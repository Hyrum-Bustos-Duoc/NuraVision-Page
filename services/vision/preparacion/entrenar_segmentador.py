"""Entrena el segmentador de unas (bosque aleatorio de pixeles, OpenCV).

Lee el .npz de recortes_segmentacion.py, saca una muestra de pixeles de cada
recorte de train, entrena un cv2.ml.RTrees y mide el IoU de la una sobre los
recortes de val y test (que el modelo no vio). Guarda el modelo en XML.

No es una red neuronal: es un modelo chico, entrenable en minutos en un portatil,
que se eligio por el plazo de la demo. Cuando haya GPU y tiempo, una U-Net con
estos mismos datos deberia segmentar mejor.

Uso (con el venv de services/api, que trae OpenCV):
    python -I entrenar_segmentador.py recortes.npz segmentador.xml [--por-recorte 150]
"""

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# El servicio y el entrenamiento comparten rasgos y limpieza: una sola version.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api"))
from app.vision import segmentador as seg  # noqa: E402


def muestra_pixeles(imagenes, mascaras, por_recorte, azar):
    """Pixeles al azar de cada recorte, mitad dentro de la una y mitad fuera."""
    xs, ys = [], []
    for img, m in zip(imagenes, mascaras):
        x = seg.rasgos_pixel(img)
        y = m.reshape(-1).astype(np.int32)
        dentro, fuera = np.nonzero(y == 1)[0], np.nonzero(y == 0)[0]
        mitad = por_recorte // 2
        idx = np.concatenate([
            azar.choice(dentro, min(mitad, dentro.size), replace=False),
            azar.choice(fuera, min(mitad, fuera.size), replace=False),
        ])
        xs.append(x[idx])
        ys.append(y[idx])
    return np.concatenate(xs), np.concatenate(ys)


def iou(a: np.ndarray, b: np.ndarray) -> float:
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 0.0


def evaluar(modelo: seg.Segmentador, imagenes, mascaras) -> dict:
    """IoU de la prediccion cruda y de la mascara final (None cuenta como rechazo)."""
    crudo, final, rechazados = [], [], 0
    for img, m in zip(imagenes, mascaras):
        p = modelo.probabilidad(img)
        crudo.append(iou(p >= seg.UMBRAL, m.astype(bool)))
        limpia = seg.limpiar(p)
        if limpia is None:
            rechazados += 1
        else:
            final.append(iou(limpia, m.astype(bool)))
    return {
        "n": len(imagenes),
        "iou_crudo_medio": round(float(np.mean(crudo)), 3),
        "aceptadas": len(final),
        "rechazadas_por_calidad": rechazados,
        "iou_final_medio": round(float(np.mean(final)), 3) if final else None,
        "iou_final_mediana": round(float(np.median(final)), 3) if final else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("recortes", type=Path)
    ap.add_argument("salida", type=Path)
    ap.add_argument("--por-recorte", type=int, default=150, help="pixeles por recorte")
    ap.add_argument("--arboles", type=int, default=40)
    ap.add_argument("--profundidad", type=int, default=14)
    args = ap.parse_args()

    datos = np.load(args.recortes)
    imgs, masc, part = datos["imagenes"], datos["mascaras"], datos["particion"]
    azar = np.random.default_rng(1)
    train = np.nonzero(part == "train")[0]
    print("recortes:", {p: int((part == p).sum()) for p in ("train", "val", "test")})

    t0 = time.time()
    x, y = muestra_pixeles(imgs[train], masc[train], args.por_recorte, azar)
    print(f"muestra: {x.shape[0]} pixeles x {x.shape[1]} rasgos ({time.time() - t0:.0f} s)")

    bosque = cv2.ml.RTrees_create()
    bosque.setMaxDepth(args.profundidad)
    bosque.setMinSampleCount(10)
    bosque.setActiveVarCount(5)
    bosque.setCalculateVarImportance(False)
    bosque.setTermCriteria((cv2.TERM_CRITERIA_MAX_ITER, args.arboles, 0))
    t0 = time.time()
    bosque.train(cv2.ml.TrainData_create(x, cv2.ml.ROW_SAMPLE, y))
    print(f"entrenado en {time.time() - t0:.0f} s")
    bosque.save(str(args.salida))
    print(f"modelo: {args.salida} ({args.salida.stat().st_size / 1e6:.1f} MB)")

    modelo = seg.Segmentador(args.salida)
    for nombre in ("val", "test"):
        idx = np.nonzero(part == nombre)[0]
        if idx.size:
            print(nombre, evaluar(modelo, imgs[idx], masc[idx]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
