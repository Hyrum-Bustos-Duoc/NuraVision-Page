"""Mapeo de carpetas de Kaggle a los ids de estado_clinico y series por similitud.
Sin TensorFlow: la similitud se inyecta como matriz."""

import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from entrenamiento import preparar_clinico as pc
from entrenamiento.config import CLASES_CLINICAS, RAIZ_REPO


def test_mapeo_cubre_exactamente_los_9_ids_sin_repetir():
    assert sorted(pc.MAPEO_KAGGLE.values()) == sorted(CLASES_CLINICAS)


def test_mapeo_de_la_ficha():
    # FICHA de kaggle_nail, seccion 10.
    assert pc.id_clinico("black line") == "linea_oscura"
    assert pc.id_clinico("normal") == "sin_senales"
    assert pc.id_clinico("other") == "otra"


@pytest.mark.parametrize("carpeta", ["Acral_Lentiginous_Melanoma", "melanoma", "Normal", "black_line", ""])
def test_carpeta_desconocida_falla_en_vez_de_perder_fotos(carpeta):
    with pytest.raises(ValueError, match="sin id"):
        pc.id_clinico(carpeta)


def test_series_une_transitivamente_dentro_de_la_clase():
    # 0-1 y 1-2 parecidas (0-2 no): una sola serie. 3 suelta.
    sim = np.eye(4)
    sim[0, 1] = sim[1, 0] = 0.85
    sim[1, 2] = sim[2, 1] = 0.81
    sim[0, 2] = sim[2, 0] = 0.5
    assert pc.series(sim, ["a", "a", "a", "a"]) == [0, 0, 0, 3]


def test_series_no_une_clases_distintas_ni_bajo_el_umbral():
    sim = np.full((3, 3), 0.99)
    assert pc.series(sim, ["a", "b", "a"]) == [0, 1, 0]
    assert pc.series(np.full((2, 2), pc.UMBRAL_SIMILITUD - 0.01) + np.eye(2), ["a", "a"]) == [0, 1]


def test_series_no_depende_del_orden_de_las_uniones():
    sim = np.eye(4)
    for a, b in ((3, 2), (2, 1), (1, 0)):
        sim[a, b] = sim[b, a] = 0.9
    assert pc.series(sim, ["a"] * 4) == [0, 0, 0, 0]


def test_cli_se_niega_a_escribir_dentro_del_repo(tmp_path):
    r = subprocess.run([sys.executable, "-I", str(Path(pc.__file__)), "--kaggle", str(tmp_path),
                        "--salida", str(RAIZ_REPO / "services" / "vision" / "prep_prueba")],
                       capture_output=True, text=True)
    assert r.returncode != 0 and "fuera del repositorio" in r.stderr
    assert not (RAIZ_REPO / "services" / "vision" / "prep_prueba").exists()
