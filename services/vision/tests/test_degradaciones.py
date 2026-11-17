"""Degradaciones y medida de calidad: forma, determinismo y direccion del efecto."""

import numpy as np
import pytest

from entrenamiento import degradaciones as dg


@pytest.fixture
def img():
    # Tablero de 8 px: tiene bordes (nitidez alta) y brillo medio conocido.
    x, y = np.meshgrid(np.arange(224), np.arange(224))
    plano = (((x // 8 + y // 8) % 2) * 200 + 28).astype(np.uint8)
    return np.repeat(plano[..., None], 3, axis=2)


@pytest.mark.parametrize("nivel", list(dg.NIVELES))
def test_cada_nivel_conserva_forma_y_tipo(img, nivel):
    out = dg.degradar(img, dg.NIVELES[nivel], semilla=3)
    assert out.shape == img.shape and out.dtype == np.uint8


def test_misma_semilla_mismo_resultado(img):
    p = dg.NIVELES["celular_poca_luz"]
    assert np.array_equal(dg.degradar(img, p, 7), dg.degradar(img, p, 7))
    assert not np.array_equal(dg.degradar(img, p, 7), dg.degradar(img, p, 8))


def test_sin_parametros_no_cambia_nada(img):
    assert np.array_equal(dg.degradar(img, {}), img)


def test_desenfoque_y_resolucion_borran_los_bordes(img):
    # Diferencia media entre pixeles vecinos: el tablero tiene bordes netos.
    def bordes(x):
        return np.abs(np.diff(x.astype(float), axis=1)).mean()
    assert bordes(dg.degradar(img, dg.NIVELES["desenfoque_fuerte"])) < 0.5 * bordes(img)
    assert bordes(dg.degradar(img, dg.NIVELES["resolucion_40"])) < 0.8 * bordes(img)


def test_brillo_mueve_el_brillo_medido(img):
    base = dg.brillo(img)
    assert dg.brillo(dg.degradar(img, dg.NIVELES["muy_oscura"])) == pytest.approx(0.25 * base, abs=1)
    assert dg.brillo(dg.degradar(img, dg.NIVELES["sobreexpuesta"])) > base


def test_brillo_es_el_gris_bt601_de_opencv():
    # cv2.cvtColor(..., COLOR_RGB2GRAY) de un pixel (200, 100, 50): 0.299*200 + 0.587*100 + 0.114*50 = 124.2
    assert dg.brillo(np.array([[[200, 100, 50]]], np.uint8)) == pytest.approx(124.2)


def test_rotacion_no_mete_esquinas_negras():
    # Con relleno negro (primera version) las esquinas quedaban en 0; el
    # servicio replica el borde, asi que aqui tampoco puede haber negro nuevo.
    clara = np.full((224, 224, 3), 180, np.uint8)
    out = dg.degradar(clara, {"rotacion": 20.0})
    assert out.min() >= 170


def test_aleatoria_es_reproducible_y_respeta_rangos():
    vistos = set()
    for s in range(200):
        p = dg.aleatoria(s)
        assert p == dg.aleatoria(s)
        for k, v in p.items():
            lo, hi = dg.RANGOS[k]
            assert lo <= v <= hi
        vistos |= set(p)
    assert vistos == set(dg.RANGOS)

