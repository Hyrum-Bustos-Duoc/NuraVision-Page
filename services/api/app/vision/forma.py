"""Forma de la una a partir de su mascara.

Es la misma regla de services/vision/preparacion/etiquetar_forma.py (hay un test que
comprueba que ambas dan lo mismo). Se copia aqui porque el servicio no depende de
la carpeta de preparacion de datos.

Se miden dos cosas sobre el contorno de la una:
  aspecto : largo / ancho, a lo largo del eje principal.
  punta   : ancho del extremo mas afilado / ancho maximo (1 = punta plana).

Los umbrales se fijaron a ojo el 2026-11-10; NO estan calibrados contra el juicio de
una profesional. Solo cuadrada, redonda y ovalada son creibles: con almendra y
stiletto la regla se confunde con unas vistas de lado (ver
services/vision/docs/etiquetas-forma.md).
"""

from dataclasses import dataclass

import cv2
import numpy as np

STILETTO_ASPECTO_MIN = 1.8
STILETTO_PUNTA_MAX = 0.35
ALMENDRA_ASPECTO_MIN = 1.3
ALMENDRA_PUNTA_MAX = 0.50
CUADRADA_PUNTA_MIN = 0.85
REDONDA_ASPECTO_MAX = 1.25

CLASES_FIABLES = {"cuadrada", "redonda", "ovalada"}
FRANJAS = 8  # franjas a lo largo del eje principal para medir el ancho
PUNTOS_CONTORNO = 40  # tope de vertices del contorno que se devuelve


def rasgos(mascara: np.ndarray) -> tuple[float, float]:
    """(aspecto, punta) de UNA una. `mascara` es un arreglo 2D booleano."""
    ys, xs = np.nonzero(mascara)
    pts = np.stack([xs, ys], axis=1).astype(np.float64)
    pts -= pts.mean(axis=0)
    valores, vectores = np.linalg.eigh(np.cov(pts.T))
    u = vectores[:, np.argmax(valores)]
    v = np.array([-u[1], u[0]])
    a, b = pts @ u, pts @ v

    largo = a.max() - a.min() + 1
    cortes = np.linspace(a.min(), a.max() + 1e-9, FRANJAS + 1)
    anchos = []
    for i in range(FRANJAS):
        en_franja = (a >= cortes[i]) & (a < cortes[i + 1])
        anchos.append(b[en_franja].max() - b[en_franja].min() + 1 if en_franja.any() else 0.0)
    ancho = max(anchos)
    extremo = min(anchos[0], anchos[-1])
    return float(largo / ancho), float(extremo / ancho)


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


@dataclass(frozen=True)
class MedidaForma:
    forma: str
    aspecto: float
    punta: float
    fiable: bool
    # Contorno de la una en coordenadas 0..1 del recorte, para dibujarlo encima.
    contorno: list[tuple[float, float]]


def medir(mascara: np.ndarray) -> MedidaForma:
    """Forma, medidas y contorno de una mascara booleana con una sola una."""
    aspecto, punta = rasgos(mascara)
    forma = clasificar(aspecto, punta)
    alto, ancho = mascara.shape
    contornos, _ = cv2.findContours(mascara.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    mayor = max(contornos, key=cv2.contourArea)
    perimetro = cv2.arcLength(mayor, True)
    # Se simplifica hasta que queden pocos vertices: el JSON no necesita 300 puntos.
    epsilon = 0.005 * perimetro
    simple = cv2.approxPolyDP(mayor, epsilon, True)
    while len(simple) > PUNTOS_CONTORNO:
        epsilon *= 1.5
        simple = cv2.approxPolyDP(mayor, epsilon, True)
    contorno = [(round(float(p[0][0]) / ancho, 4), round(float(p[0][1]) / alto, 4)) for p in simple]
    return MedidaForma(forma, round(aspecto, 3), round(punta, 3), forma in CLASES_FIABLES, contorno)
