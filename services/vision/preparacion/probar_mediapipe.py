"""Mide en cuantas fotos de cada carpeta MediaPipe logra detectar una mano.

No clasifica nada ni entrena nada: solo responde "con estas fotos, el paso de
detectar la mano funciona?". Es el experimento del 2026-11-10 que justifica
las decisiones de docs/preparacion-modelo.md.

Requisitos (Python 3.14 probado; en un entorno aparte, no en el del API):
    pip install mediapipe opencv-python-headless numpy
    curl -LO https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

Uso, pasando cada grupo como nombre=patron:
    python -I probar_mediapipe.py hand_landmarker.task \
        "seg_V2=/ruta/NailSegmentationDatasetV2/train/images/*.jpg" \
        "anemia=/ruta/data/photo/*.jpg" --n 60
"""

import argparse
import glob
import random
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

# Semilla fija: dos personas que corran esto con las mismas fotos obtienen la
# misma muestra, y por tanto el mismo porcentaje.
SEMILLA = 1
# 0.3 es mas permisivo que el valor por defecto (0.5). Si aun asi no detecta,
# con el valor por defecto detectaria menos.
CONFIANZA_DETECCION = 0.3


def crear_detector(modelo: str) -> vision.HandLandmarker:
    opciones = vision.HandLandmarkerOptions(
        base_options=mpp.BaseOptions(model_asset_path=modelo),
        num_hands=2,
        min_hand_detection_confidence=CONFIANZA_DETECCION,
        running_mode=vision.RunningMode.IMAGE,
    )
    return vision.HandLandmarker.create_from_options(opciones)


def detecta_mano(detector: vision.HandLandmarker, ruta: str) -> bool | None:
    """True/False si pudo analizar la foto; None si el archivo no se pudo leer."""
    bgr = cv2.imread(ruta)
    if bgr is None:
        return None
    rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    resultado = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    return bool(resultado.hand_landmarks)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("modelo", help="ruta a hand_landmarker.task")
    ap.add_argument("grupos", nargs="+", help="nombre=patron_glob")
    ap.add_argument("--n", type=int, default=60, help="fotos por grupo (muestra al azar)")
    args = ap.parse_args()

    detector = crear_detector(args.modelo)
    azar = random.Random(SEMILLA)
    for grupo in args.grupos:
        nombre, _, patron = grupo.partition("=")
        archivos = glob.glob(patron)
        if not archivos:
            print(f"{nombre}: sin archivos para el patron {patron}")
            continue
        muestra = azar.sample(archivos, min(args.n, len(archivos)))
        resultados = [detecta_mano(detector, f) for f in muestra]
        leidas = [r for r in resultados if r is not None]
        ok = sum(leidas)
        print(f"{nombre}: {ok}/{len(leidas)} con mano detectada ({100 * ok // len(leidas)}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
