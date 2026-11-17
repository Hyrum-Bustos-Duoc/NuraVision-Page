"""Casi-duplicados con imagenes sinteticas con textura (un color plano da
siempre el mismo dHash y no prueba nada)."""

import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from entrenamiento import casi_duplicados as cd
from entrenamiento.config import RAIZ_REPO

SCRIPT = Path(cd.__file__)


def textura(ruta: Path, semilla: int, lado=(200, 160)) -> Path:
    """Manchas suaves al azar: estructura de baja frecuencia, como una foto."""
    rng = np.random.default_rng(semilla)
    chica = rng.integers(0, 256, (6, 5, 3), dtype=np.uint8)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(chica).resize(lado, Image.Resampling.BICUBIC).save(ruta, "JPEG", quality=90)
    return ruta


@pytest.mark.parametrize("semilla", range(1, 6))
def test_copia_recortada_un_5_por_ciento_por_el_borde_es_candidata(tmp_path, semilla):
    # 2,5 % por cada lado = 5 % del ancho y del alto. Medido el 2026-11-12: un
    # 5 % quitado de un solo lado da distancia 3-7 sobre estas texturas, asi
    # que esos recortes pueden escaparse con DISTANCIA_MAXIMA = 4.
    original = textura(tmp_path / "acropaquia" / "a.jpg", semilla)
    with Image.open(original) as img:
        ancho, alto = img.size
        dx, dy = round(ancho * 0.025), round(alto * 0.025)
        img.crop((dx, dy, ancho - dx, alto - dy)).save(tmp_path / "acropaquia" / "b.jpg")
    pares, ilegibles = cd.candidatos(tmp_path)
    assert [(a, b) for a, b, _ in pares] == [("acropaquia/a.jpg", "acropaquia/b.jpg")]
    assert pares[0][2] <= cd.DISTANCIA_MAXIMA and ilegibles == 0


def test_fotos_sin_relacion_no_son_candidatas(tmp_path):
    for i in range(6):
        textura(tmp_path / "otra" / f"{i}.jpg", 100 + i)
    (tmp_path / "otra" / "roto.jpg").write_bytes(b"no soy una imagen")
    pares, ilegibles = cd.candidatos(tmp_path)
    assert pares == [] and ilegibles == 1


def test_cli_solo_cuenta_en_consola_y_escribe_fuera_del_repo(tmp_path):
    textura(tmp_path / "datos" / "x" / "maria_perez.jpg", 1)
    textura(tmp_path / "datos" / "x" / "maria_perez_2.jpg", 1)
    salida = tmp_path / "fuera" / "pares.csv"
    r = subprocess.run([sys.executable, "-I", str(SCRIPT), "--dataset", str(tmp_path / "datos"), "--salida", str(salida)],
                       capture_output=True, text=True, check=True)
    assert "1 pares candidatos" in r.stdout and "maria" not in r.stdout + r.stderr
    assert "x/maria_perez.jpg,x/maria_perez_2.jpg,0" in salida.read_text()


def test_cli_se_niega_a_escribir_dentro_del_repo(tmp_path):
    salida = RAIZ_REPO / "services" / "vision" / "pares_prueba.csv"
    r = subprocess.run([sys.executable, "-I", str(SCRIPT), "--dataset", str(tmp_path), "--salida", str(salida)],
                       capture_output=True, text=True)
    assert r.returncode != 0 and "fuera del repositorio" in r.stderr
    assert not salida.exists()
