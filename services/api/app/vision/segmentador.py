"""Segmenta la una dentro de un recorte (clasificador de pixeles + limpieza).

Entrada: recorte BGR del servicio, con el dedo hacia arriba. Salida: mascara
booleana de la una, o None si no se pudo trazar una mascara creible.

Cada pixel se clasifica como "una" o "no una" con un bosque aleatorio de OpenCV
(cv2.ml.RTrees) a partir de 19 rasgos: color en Lab, color suavizado, diferencia
con el color tipico del recorte, bordes, textura y posicion. La posicion pesa
mucho porque el recorte siempre esta alineado con el dedo. No es una red neuronal:
es un modelo pequeno que se entrena en minutos con los recortes del dataset
NailSegmentationDatasetV2 (ver services/vision/preparacion/entrenar_segmentador.py).
"""

from pathlib import Path

import cv2
import numpy as np

LADO = 96  # lado del recorte con el que se entrena y se predice
N_RASGOS = 19
UMBRAL = 0.5

# Criterios para aceptar la mascara. Mismos limites que se usaron al preparar los
# datos de entrenamiento (recortes_segmentacion.py).
FRACCION_MIN, FRACCION_MAX = 0.02, 0.50
SOLIDEZ_MIN = 0.85
DESVIACION_MIN = 6.0  # desviacion de color minima del recorte (ver tiene_contraste)


def rasgos_pixel(recorte_bgr: np.ndarray) -> np.ndarray:
    """Matriz (LADO*LADO, N_RASGOS) float32 con los rasgos de cada pixel."""
    pequeno = cv2.resize(recorte_bgr, (LADO, LADO), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(pequeno, cv2.COLOR_BGR2LAB).astype(np.float32)
    canales = [lab[..., i] for i in range(3)]
    suave1 = [cv2.GaussianBlur(c, (0, 0), 1.5) for c in canales]
    suave2 = [cv2.GaussianBlur(c, (0, 0), 4.0) for c in canales]
    tipico = np.median(lab.reshape(-1, 3), axis=0)
    dif = [suave1[i] - tipico[i] for i in range(3)]
    luz = suave1[0]
    gx, gy = cv2.Sobel(luz, cv2.CV_32F, 1, 0), cv2.Sobel(luz, cv2.CV_32F, 0, 1)
    grad = np.sqrt(gx**2 + gy**2)
    grad_suave = cv2.GaussianBlur(grad, (0, 0), 3.0)
    media = cv2.GaussianBlur(canales[0], (0, 0), 3.0)
    desv = np.sqrt(np.maximum(cv2.GaussianBlur(canales[0] ** 2, (0, 0), 3.0) - media**2, 0))
    crom = np.sqrt((lab[..., 1] - 128) ** 2 + (lab[..., 2] - 128) ** 2)
    yy, xx = np.mgrid[:LADO, :LADO].astype(np.float32) / (LADO - 1)
    radio = np.sqrt((xx - 0.5) ** 2 + (yy - 0.45) ** 2)
    pila = [*canales, *suave1, *suave2, *dif, grad, grad_suave, desv, crom, xx, yy, radio]
    # 3 + 3 + 3 + 3 + 4 + 3 = 19
    return np.stack([p.reshape(-1) for p in pila], axis=1).astype(np.float32)


def limpiar(probabilidad: np.ndarray) -> np.ndarray | None:
    """Mapa de probabilidad (LADO, LADO) -> mascara booleana de una sola una, o None."""
    suave = cv2.GaussianBlur(probabilidad, (0, 0), 1.0)
    binaria = (suave >= UMBRAL).astype(np.uint8)
    binaria = cv2.morphologyEx(binaria, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, etiquetas, est, _ = cv2.connectedComponentsWithStats(binaria, connectivity=8)
    if n < 2:
        return None
    c0, c1 = LADO // 4, LADO - LADO // 4
    centro = etiquetas[c0:c1, c0:c1]
    solapes = [(int((centro == i).sum()), i) for i in range(1, n)]
    solape, i = max(solapes)
    if solape == 0:
        return None
    x, y, w, h, area = (int(v) for v in est[i])
    if not FRACCION_MIN <= area / LADO**2 <= FRACCION_MAX:
        return None
    if x == 0 or y == 0 or x + w >= LADO or y + h >= LADO:
        return None  # tocando el borde: la una estaria cortada
    comp = (etiquetas == i).astype(np.uint8)
    contornos, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    contorno = max(contornos, key=cv2.contourArea)
    envolvente = cv2.contourArea(cv2.convexHull(contorno))
    if envolvente == 0 or area / envolvente < SOLIDEZ_MIN:
        return None
    relleno = np.zeros_like(comp)
    cv2.drawContours(relleno, [contorno], -1, 1, thickness=cv2.FILLED)
    return relleno.astype(bool)


def tiene_contraste(recorte_bgr: np.ndarray) -> bool:
    """False si el recorte es una zona lisa (blanco por transparencia o flash, etc.).

    Sin textura los rasgos de posicion mandan y el bosque "ve" la una promedio:
    un recorte blanco salia como una redonda. En los recortes reales del dataset la
    desviacion de color minima fue 7,1 (percentil 1: 13,3); un recorte liso da ~0.
    """
    pequeno = cv2.resize(recorte_bgr, (LADO, LADO), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(pequeno, cv2.COLOR_BGR2LAB).astype(np.float32)
    return float(lab.reshape(-1, 3).std(axis=0).max()) >= DESVIACION_MIN


def _comprobar_xml(ruta: Path) -> None:
    """Descarta un XML que no sea un RTrees completo ANTES de pasarselo a OpenCV.

    RTrees_load se cae con un segfault (no una excepcion) si el XML es valido pero
    no trae un modelo, y no se puede atrapar desde Python. Un archivo copiado a
    medias es el caso realista: 75 MB que quedan cortados.
    """
    tam = ruta.stat().st_size
    with ruta.open("rb") as f:
        inicio = f.read(512)
        f.seek(max(tam - 128, 0))
        final = f.read()
    if b"<opencv_ml_rtrees" not in inicio or b"</opencv_storage>" not in final:
        raise ValueError(f"{ruta} no es un bosque RTrees completo (vacio, cortado o de otro tipo)")


class Segmentador:
    def __init__(self, ruta: Path):
        if not ruta.is_file():
            raise FileNotFoundError(ruta)
        _comprobar_xml(ruta)
        try:
            self._bosque = cv2.ml.RTrees_load(str(ruta))
        except cv2.error as exc:
            raise ValueError(f"{ruta} no se pudo leer: {exc}") from exc
        if self._bosque is None or not self._bosque.isTrained():
            raise ValueError(f"{ruta} no es un bosque entrenado")

    def probabilidad(self, recorte_bgr: np.ndarray) -> np.ndarray:
        """Mapa (LADO, LADO) con la probabilidad de que cada pixel sea una."""
        x = rasgos_pixel(recorte_bgr)
        # Matriz (muestras + 1, clases): la primera fila trae la etiqueta de cada
        # columna y las demas los votos de los arboles por pixel.
        votos = self._bosque.getVotes(x, 0)
        columnas = np.nonzero(votos[0] == 1)[0]
        if columnas.size == 0:
            return np.zeros((LADO, LADO), np.float32)
        total = votos[1:].sum(axis=1).clip(min=1)  # arboles que votaron por pixel
        p = votos[1:, columnas[0]].astype(np.float32) / total
        return p.reshape(LADO, LADO)

    def segmentar(self, recorte_bgr: np.ndarray) -> np.ndarray | None:
        if not tiene_contraste(recorte_bgr):
            return None
        return limpiar(self.probabilidad(recorte_bgr))
