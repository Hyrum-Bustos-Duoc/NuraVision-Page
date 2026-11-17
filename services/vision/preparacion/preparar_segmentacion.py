"""Prepara NailSegmentationDatasetV2 para entrenar un segmentador de unas.

Que hace:
  1. Lee el CSV del dataset y comprueba que cada foto tenga su mascara.
  2. Descarta las mascaras vacias (la una no esta marcada, el modelo
     aprenderia "aqui no hay una").
  3. Detecta fotos identicas por sha256 y deja una sola copia. Si una misma
     foto cae en varias particiones, se conserva en la mas "protegida"
     (test > val > train) para que nada de lo que se evalua se haya visto
     al entrenar.
  4. Escribe un manifiesto JSON (sin imagenes) con la particion final.
  5. Opcional: --verificar N decodifica N pares con OpenCV y comprueba forma y
     valores de la mascara, que es la normalizacion que usara el entrenamiento.

No detecta casi-duplicados (la misma foto girada, con ruido o recortada):
para eso haria falta un hash perceptual. Ver docs/preparacion-modelo.md.

Uso:
    python -I preparar_segmentacion.py RUTA/NailSegmentationDatasetV2 salida.json
    python -I preparar_segmentacion.py RUTA salida.json --verificar 200
"""

import argparse
import csv
import hashlib
import json
import random
import sys
from collections import Counter
from pathlib import Path

# Lado al que se reescala para entrenar. Las fotos originales son de 640 px;
# 256 mantiene la una visible y entra holgado en una GPU gratuita de Colab.
LADO = 256
# Una mascara guardada como PNG de 1 canal: 0 = fondo, 255 = una.
UMBRAL_MASCARA = 127
# Orden de preferencia cuando una foto aparece en mas de una particion.
PRIORIDAD = {"test": 0, "val": 1, "train": 2}


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def preparar(raiz: Path) -> dict:
    csv_path = raiz / "NailSegmentationV1.csv"
    with csv_path.open(newline="") as f:
        filas = list(csv.DictReader(f))

    descartes: list[dict] = []
    validas = []
    vistas: set[str] = set()
    for fila in filas:
        # El CSV llama "valid" a la particion cuya carpeta en disco es "val".
        if fila["split"] == "valid":
            fila["split"] = "val"
            for campo in ("image_path", "mask_path"):
                fila[campo] = "val/" + fila[campo].split("/", 1)[1]
        img, mask = raiz / fila["image_path"], raiz / fila["mask_path"]
        if fila["image_path"] in vistas:
            # El CSV lista 13 rutas dos veces; son la misma foto, no un duplicado real.
            descartes.append({"imagen": fila["image_path"], "motivo": "fila_repetida_en_csv"})
            continue
        vistas.add(fila["image_path"])
        if not img.is_file() or not mask.is_file():
            descartes.append({"imagen": fila["image_path"], "motivo": "falta_archivo"})
        elif int(fila["masked_pixels"]) == 0:
            descartes.append({"imagen": fila["image_path"], "motivo": "mascara_vacia"})
        else:
            validas.append((fila, sha256(img)))

    # Un grupo por contenido identico. Dentro del grupo se queda la copia de la
    # particion mas protegida; el resto se descarta como duplicado.
    grupos: dict[str, list] = {}
    for fila, h in validas:
        grupos.setdefault(h, []).append(fila)

    items = []
    for h, miembros in grupos.items():
        miembros.sort(key=lambda m: (PRIORIDAD[m["split"]], m["image_path"]))
        elegido, resto = miembros[0], miembros[1:]
        items.append(
            {
                "imagen": elegido["image_path"],
                "mascara": elegido["mask_path"],
                "sha256": h,
                "particion": elegido["split"],
            }
        )
        for r in resto:
            descartes.append(
                {"imagen": r["image_path"], "motivo": "duplicado", "igual_a": elegido["image_path"]}
            )

    items.sort(key=lambda i: i["imagen"])
    return {
        "dataset": "NailSegmentationDatasetV2",
        "filas_csv": len(filas),
        "conservadas": Counter(i["particion"] for i in items),
        "descartadas": Counter(d["motivo"] for d in descartes),
        "items": items,
        "descartes": descartes,
    }


def verificar(raiz: Path, items: list[dict], n: int) -> None:
    """Decodifica n pares al azar y comprueba la normalizacion."""
    import cv2  # solo aqui, para que el resto corra con la libreria estandar
    import numpy as np

    azar = random.Random(20261110)
    muestra = azar.sample(items, min(n, len(items)))
    problemas = 0
    for it in muestra:
        img = cv2.imread(str(raiz / it["imagen"]), cv2.IMREAD_COLOR)
        mask = cv2.imread(str(raiz / it["mascara"]), cv2.IMREAD_GRAYSCALE)
        if img is None or mask is None or img.shape[:2] != mask.shape[:2]:
            problemas += 1
            print("  PROBLEMA de lectura o de tamano:", it["imagen"])
            continue
        # Imagen: bilineal. Mascara: vecino mas cercano, para no inventar grises.
        x = cv2.resize(img, (LADO, LADO), interpolation=cv2.INTER_LINEAR)
        y = cv2.resize(mask, (LADO, LADO), interpolation=cv2.INTER_NEAREST)
        y = (y > UMBRAL_MASCARA).astype(np.uint8)
        if x.shape != (LADO, LADO, 3) or y.sum() == 0:
            problemas += 1
            print("  PROBLEMA tras normalizar (mascara vacia al reducir):", it["imagen"])
    print(f"verificados {len(muestra)} pares, con problemas: {problemas}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("raiz", type=Path, help="carpeta NailSegmentationDatasetV2")
    ap.add_argument("salida", type=Path, help="manifiesto JSON de salida")
    ap.add_argument("--verificar", type=int, default=0, metavar="N")
    args = ap.parse_args()

    res = preparar(args.raiz)
    args.salida.write_text(json.dumps(res, indent=1, ensure_ascii=False, default=dict))
    print("filas en el CSV:", res["filas_csv"])
    print("conservadas    :", dict(res["conservadas"]), "=", sum(res["conservadas"].values()))
    print("descartadas    :", dict(res["descartadas"]))
    if args.verificar:
        verificar(args.raiz, res["items"], args.verificar)
    return 0


if __name__ == "__main__":
    sys.exit(main())
