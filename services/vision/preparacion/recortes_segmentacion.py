"""Genera recortes de una + mascara para entrenar el segmentador de unas.

El servicio (services/api) trabaja sobre recortes de una: MediaPipe encuentra la
mano, se recorta la punta de cada dedo estirado y se gira para que el dedo mire
arriba. Para que el segmentador vea en el entrenamiento lo mismo que vera en
produccion, aqui se hace igual con el dataset NailSegmentationDatasetV2: se
detecta la mano, se recorta con la MISMA funcion del servicio y la mascara se
recorta con la MISMA matriz.

Se conserva un recorte solo si su mascara es limpia:
  - una una principal (la que cae en el centro) de entre 2 % y 50 % del recorte;
  - que no toque el borde del recorte (si no, la una esta cortada);
  - sin otras unas de tamano relevante dentro del recorte (el dedo vecino quedaria
    como "fondo" siendo una una).

Uso (necesita mediapipe, opencv y numpy; ver preparacion-modelo.md, seccion 8):
    python -I recortes_segmentacion.py RAIZ_DATASET particion_seg.json hand_landmarker.task salida.npz
"""

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

# Se reutiliza la geometria del servicio para no tener dos versiones del recorte.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api"))
from app.vision import unas as srv  # noqa: E402

LADO = 96  # el segmentador trabaja a 96 px: suficiente para la forma, barato de entrenar
FRACCION_MIN, FRACCION_MAX = 0.02, 0.50
OTRAS_UNAS_MAX = 0.20  # area de unas ajenas / area de la una principal


def una_principal(mascara: np.ndarray) -> tuple[np.ndarray | None, str]:
    """La una del centro del recorte, o (None, motivo) si el recorte no sirve."""
    n, etiquetas, est, _ = cv2.connectedComponentsWithStats(mascara, connectivity=8)
    if n < 2:
        return None, "sin_una"
    c0, c1 = LADO // 4, LADO - LADO // 4
    centro = etiquetas[c0:c1, c0:c1]
    candidatos = [(int((centro == i).sum()), i) for i in range(1, n)]
    solape, i = max(candidatos)
    if solape == 0:
        return None, "sin_una_al_centro"
    x, y, w, h, area = (int(v) for v in est[i])
    if not FRACCION_MIN <= area / LADO**2 <= FRACCION_MAX:
        return None, "tamano_fuera_de_rango"
    if x == 0 or y == 0 or x + w >= LADO or y + h >= LADO:
        return None, "cortada_por_el_borde"
    otras = sum(int(est[j][4]) for j in range(1, n) if j != i and est[j][4] >= 15)
    if otras > OTRAS_UNAS_MAX * area:
        return None, "otras_unas_dentro"
    return (etiquetas == i).astype(np.uint8), ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("raiz", type=Path)
    ap.add_argument("particion", type=Path)
    ap.add_argument("modelo", type=Path, help="hand_landmarker.task")
    ap.add_argument("salida", type=Path)
    ap.add_argument("--max-train", type=int, default=3000, help="fotos de train a recorrer")
    ap.add_argument("--max-val", type=int, default=500)
    ap.add_argument("--max-test", type=int, default=600)
    args = ap.parse_args()

    items = json.loads(args.particion.read_text())["items"]
    azar = random.Random(1)
    topes = {"train": args.max_train, "val": args.max_val, "test": args.max_test}
    por_particion = {p: [i for i in items if i["particion"] == p] for p in topes}
    for lista in por_particion.values():
        azar.shuffle(lista)

    detector = vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(
            base_options=mpp.BaseOptions(model_asset_path=str(args.modelo)),
            num_hands=2,
            min_hand_detection_confidence=srv.CONFIANZA_DETECCION,
            running_mode=vision.RunningMode.IMAGE,
        )
    )

    imgs, mascaras, parts = [], [], []
    descartes = Counter()
    for particion, tope in topes.items():
        for it in por_particion[particion][:tope]:
            imagen = cv2.imread(str(args.raiz / it["imagen"]), cv2.IMREAD_COLOR)
            mascara = cv2.imread(str(args.raiz / it["mascara"]), cv2.IMREAD_GRAYSCALE)
            if imagen is None or mascara is None:
                descartes["ilegible"] += 1
                continue
            alto, ancho = imagen.shape[:2]
            rgb = np.ascontiguousarray(cv2.cvtColor(imagen, cv2.COLOR_BGR2RGB))
            res = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if not res.hand_landmarks:
                descartes["sin_mano"] += 1
                continue
            for puntos in res.hand_landmarks:
                pts = np.array([[p.x * ancho, p.y * alto] for p in puntos])
                for dedo, (i_dip, i_punta) in srv.DEDOS.items():
                    if not srv.dedo_estirado(pts, dedo):
                        descartes["dedo_no_estirado"] += 1
                        continue
                    region = srv.region_una(tuple(pts[i_dip]), tuple(pts[i_punta]))
                    if region is None or srv.fraccion_dentro(region, ancho, alto) < srv.FRACCION_MINIMA_DENTRO:
                        descartes["region_invalida"] += 1
                        continue
                    m = srv.matriz_recorte(region, LADO)
                    recorte = cv2.warpAffine(imagen, m, (LADO, LADO), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
                    m_rec = cv2.warpAffine(mascara, m, (LADO, LADO), flags=cv2.INTER_LINEAR, borderValue=0)
                    una, motivo = una_principal((m_rec > 127).astype(np.uint8))
                    if una is None:
                        descartes[motivo] += 1
                        continue
                    imgs.append(recorte)
                    mascaras.append(una)
                    parts.append(particion)

    np.savez_compressed(
        args.salida,
        imagenes=np.stack(imgs),
        mascaras=np.stack(mascaras),
        particion=np.array(parts),
    )
    print("recortes:", dict(Counter(parts)), "| descartes:", dict(descartes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
