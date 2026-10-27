"""Fixtures sinteticas: imagenes de color plano generadas al vuelo.

No se versiona ninguna foto real de manos (dato biometrico). Estas fixtures
prueban la logica (validacion, hashing, particion, normalizacion), no la
calidad del modelo: eso solo se mide con el dataset propio en Colab.
"""

from pathlib import Path

import pytest
from PIL import Image

CLASES = ["almendra", "cuadrada", "ovalada"]


def foto(ruta: Path, color, tamano=(300, 400), formato="JPEG", exif=None) -> Path:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", tamano, color)
    img.save(ruta, formato, **({"exif": exif} if exif else {}))
    return ruta


@pytest.fixture
def dataset(tmp_path) -> Path:
    """10 fotos distintas por clase en <tmp>/forma/<clase>/."""
    raiz = tmp_path / "forma"
    for ci, clase in enumerate(CLASES):
        for i in range(10):
            foto(raiz / clase / f"{i:02d}.jpg", (ci * 80, i * 20, 50))
    return raiz
