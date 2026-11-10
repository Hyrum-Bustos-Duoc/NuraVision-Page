"""Calcula la FORMA de cada una a partir de su mascara (pseudo-etiquetas).

Las 5 clases son las de `config.toml` (tarea `forma`): almendra, cuadrada,
ovalada, redonda, stiletto. Nadie etiqueto estas fotos a mano: la clase sale de
una regla geometrica sobre el contorno de la una. Por eso son PSEUDO-etiquetas:
un modelo entrenado con ellas aprende la regla, no el criterio de una
profesional. Ver docs/etiquetas-forma.md.

Para cada una (componente conectado de la mascara) se miden dos cosas:
  aspecto : largo / ancho, a lo largo del eje principal de la una.
  punta   : ancho en el extremo mas afilado / ancho maximo. Cerca de 1 = punta
            plana; ~0.65 = punta redondeada; bajo 0.5 = punta que se afila.

Uso (con la particion limpia de preparar_segmentacion.py):
    python -I etiquetar_forma.py RUTA/NailSegmentationDatasetV2 particion_seg.json salida.json
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

# --- umbrales de la regla. Fijados a ojo el 2026-11-10 y revisados mirando un
# mosaico de ejemplos por clase; NO estan calibrados contra el juicio de una
# profesional. Si se cambian, hay que regenerar las etiquetas. ---------------
STILETTO_ASPECTO_MIN = 1.8
STILETTO_PUNTA_MAX = 0.35
ALMENDRA_ASPECTO_MIN = 1.3
ALMENDRA_PUNTA_MAX = 0.50
CUADRADA_PUNTA_MIN = 0.85
REDONDA_ASPECTO_MAX = 1.25

# Clases cuya etiqueta es creible. Revisado el 2026-11-10 con un mosaico de 9
# ejemplos al azar por clase: en "almendra" y "stiletto" casi todas son unas
# naturales vistas de lado, tapadas o con la mascara angosta; la regla las ve
# puntiagudas por el angulo de la foto, no por su forma. Las fotos del dataset son
# de unas naturales y no hay almendras ni stilettos reales. NO entrenar con esas dos.
CLASES_FIABLES = {"cuadrada", "redonda", "ovalada"}

# Filtros: por debajo de esto el contorno es de pocos pixeles y la forma es ruido.
AREA_MINIMA_PX = 400
# area / area de la envolvente convexa. Bajo esto, dos unas pegadas o una mascara rota.
SOLIDEZ_MINIMA = 0.85
# Franjas a lo largo del eje principal para medir el ancho.
FRANJAS = 8


def rasgos(mascara: np.ndarray) -> dict:
    """aspecto y punta de UNA una. `mascara` es un arreglo 2D booleano con una sola una."""
    ys, xs = np.nonzero(mascara)
    pts = np.stack([xs, ys], axis=1).astype(np.float64)
    pts -= pts.mean(axis=0)
    valores, vectores = np.linalg.eigh(np.cov(pts.T))
    u = vectores[:, np.argmax(valores)]  # eje principal
    v = np.array([-u[1], u[0]])
    a, b = pts @ u, pts @ v

    largo = a.max() - a.min() + 1
    cortes = np.linspace(a.min(), a.max() + 1e-9, FRANJAS + 1)
    anchos = []
    for i in range(FRANJAS):
        en_franja = (a >= cortes[i]) & (a < cortes[i + 1])
        anchos.append(b[en_franja].max() - b[en_franja].min() + 1 if en_franja.any() else 0.0)
    ancho = max(anchos)
    # La punta es el extremo mas afilado de los dos.
    extremo = min(anchos[0], anchos[-1])
    return {"aspecto": float(largo / ancho), "punta": float(extremo / ancho)}


def clasificar(aspecto: float, punta: float) -> str:
    if aspecto >= STILETTO_ASPECTO_MIN and punta <= STILETTO_PUNTA_MAX:
        return "stiletto"
    if aspecto >= ALMENDRA_ASPECTO_MIN and punta <= ALMENDRA_PUNTA_MAX:
        return "almendra"
    if punta >= CUADRADA_PUNTA_MIN:
        return "cuadrada"
    if aspecto < REDONDA_ASPECTO_MAX:
        return "redonda"
    return "ovalada"


def etiquetar_mascara(mascara: np.ndarray) -> tuple[list[dict], Counter]:
    """Una entrada por cada una de la mascara, y el conteo de las descartadas por motivo."""
    import cv2  # solo aqui, para que rasgos() y clasificar() se prueben sin OpenCV

    binaria = (mascara > 127).astype(np.uint8)
    alto, ancho = binaria.shape
    n, etiquetas, est, _ = cv2.connectedComponentsWithStats(binaria, connectivity=8)
    unas, descartes = [], Counter()
    for i in range(1, n):
        x, y, w, h, area = (int(v) for v in est[i])
        if area < AREA_MINIMA_PX:
            descartes["muy_pequena"] += 1
            continue
        if x == 0 or y == 0 or x + w >= ancho or y + h >= alto:
            descartes["cortada_por_el_borde"] += 1  # el contorno estaria incompleto
            continue
        comp = etiquetas == i
        contornos, _ = cv2.findContours(comp.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        envolvente = cv2.contourArea(cv2.convexHull(max(contornos, key=cv2.contourArea)))
        if envolvente == 0 or area / envolvente < SOLIDEZ_MINIMA:
            descartes["forma_irregular"] += 1
            continue
        r = rasgos(comp)
        forma = clasificar(**r)
        unas.append(
            {"caja": [x, y, w, h], "area": area, **r, "forma": forma, "fiable": forma in CLASES_FIABLES}
        )
    return unas, descartes


def main() -> int:
    import cv2

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("raiz", type=Path, help="carpeta NailSegmentationDatasetV2")
    ap.add_argument("particion", type=Path, help="manifiesto de preparar_segmentacion.py")
    ap.add_argument("salida", type=Path)
    args = ap.parse_args()

    items = json.loads(args.particion.read_text())["items"]
    registros, descartes = [], Counter()
    for it in items:
        mascara = cv2.imread(str(args.raiz / it["mascara"]), cv2.IMREAD_GRAYSCALE)
        if mascara is None:
            descartes["mascara_ilegible"] += 1
            continue
        unas, desc = etiquetar_mascara(mascara)
        descartes.update(desc)
        registros += [{"imagen": it["imagen"], "particion": it["particion"], **u} for u in unas]

    args.salida.write_text(json.dumps({"unas": registros, "descartes": descartes}, indent=1))
    print("unas etiquetadas:", len(registros), "| descartadas:", dict(descartes))
    for particion in ("train", "val", "test"):
        c = Counter(r["forma"] for r in registros if r["particion"] == particion)
        print(f"{particion:5}", dict(sorted(c.items())))
    fiables = [r for r in registros if r["fiable"]]
    print(f"fiables (cuadrada, redonda, ovalada): {len(fiables)} de {len(registros)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
