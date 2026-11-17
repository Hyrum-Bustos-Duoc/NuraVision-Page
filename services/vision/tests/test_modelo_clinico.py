"""El modelo exportado de estado_clinico carga con el codigo real del servicio.

Corre con el venv del API (ai-edge-litert, OpenCV, Pydantic):
  ../api/.venv/bin/python -m pytest -q tests/test_modelo_clinico.py
Se salta si falta ese entorno o si no hay modelo instalado en
services/api/models/estado_clinico/ (no se versiona: ver la FICHA de
kaggle_nail, seccion 11, para reproducirlo). Entradas sinteticas: ninguna foto.
"""

import os
import sys
from pathlib import Path

import numpy as np
import pytest

from entrenamiento.config import CLASES_CLINICAS, RAIZ_REPO

API = RAIZ_REPO / "services" / "api"
CARPETA = Path(os.environ.get("VISION_CLINICO", API / "models" / "estado_clinico"))


@pytest.fixture(scope="module")
def clinico():
    for modulo in ("ai_edge_litert", "cv2", "pydantic"):
        pytest.importorskip(modulo)
    if not (CARPETA / "modelo.tflite").is_file():
        pytest.skip(f"sin modelo clinico en {CARPETA}")
    sys.path.insert(0, str(API))
    try:
        from app.vision import clinico
    finally:
        sys.path.pop(0)
    return clinico


@pytest.fixture(scope="module")
def clasificador(clinico):
    return clinico.cargar(CARPETA, API / "app" / "vision" / "textos_clinicos.toml")


def test_carga_con_las_9_etiquetas_y_los_dos_umbrales(clasificador):
    assert set(clasificador.etiquetas) == set(CLASES_CLINICAS) and len(clasificador.etiquetas) == 9
    assert clasificador.umbral_no_concluyente is None or 0 < clasificador.umbral_no_concluyente <= 1
    assert clasificador.umbral_sin_senales is None or 0 < clasificador.umbral_sin_senales <= 1


@pytest.mark.parametrize("semilla", range(3))
def test_inferencia_devuelve_9_probabilidades_que_suman_1(clinico, clasificador, semilla):
    recorte = np.random.default_rng(semilla).integers(0, 256, (clinico.LADO, clinico.LADO, 3), dtype=np.uint8)
    probs = clasificador.predecir(clinico.entrada(recorte))
    assert probs.shape == (9,) and probs.dtype == np.float32
    assert (probs >= 0).all() and probs.sum() == pytest.approx(1, abs=1e-4)
    # La misma entrada da la misma salida: el interprete es determinista.
    assert np.array_equal(probs, clasificador.predecir(clinico.entrada(recorte)))


def test_clasificar_nunca_lanza_y_respeta_el_contrato(clinico, clasificador):
    resultado = clinico.clasificar(clasificador, np.zeros((clinico.LADO, clinico.LADO, 3), np.uint8))
    assert resultado.estado in ("ok", "no_concluyente")
    assert resultado.motivo != "clasificacion_fallida"
