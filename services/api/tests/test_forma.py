"""Pruebas de la forma, el segmentador y la integracion en el analizador.

Se usan siluetas sinteticas: no hay fotos de manos en el repo. Comprueban que la
regla mide lo que dice y que el codigo no se rompe, no que los umbrales coincidan
con el criterio de una profesional.
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.vision import forma, segmentador
from app.vision.clinico import SIN_MODELO
from app.vision.esquemas import Una
from app.vision.unas import _forma_predominante


def elipse(largo: float, corto: float, lado: int = 96) -> np.ndarray:
    y, x = np.mgrid[:lado, :lado]
    return ((x - lado / 2) / largo) ** 2 + ((y - lado / 2) / corto) ** 2 <= 1


def rectangulo(largo: int, ancho: int, lado: int = 96) -> np.ndarray:
    m = np.zeros((lado, lado), bool)
    y0, x0 = (lado - largo) // 2, (lado - ancho) // 2
    m[y0 : y0 + largo, x0 : x0 + ancho] = True
    return m


def test_circulo_es_redonda_y_fiable():
    m = forma.medir(elipse(25, 25))
    assert m.forma == "redonda" and m.fiable
    assert m.aspecto == pytest.approx(1.0, abs=0.1)


def test_rectangulo_es_cuadrada():
    assert forma.medir(rectangulo(50, 30)).forma == "cuadrada"


def test_elipse_alargada_es_ovalada():
    assert forma.medir(elipse(35, 20)).forma == "ovalada"


def test_contorno_normalizado_y_acotado():
    m = forma.medir(elipse(30, 20))
    assert 3 <= len(m.contorno) <= forma.PUNTOS_CONTORNO
    assert all(0 <= x <= 1 and 0 <= y <= 1 for x, y in m.contorno)


def test_coincide_con_la_regla_de_preparacion_de_datos():
    """services/api/app/vision/forma.py es copia de etiquetar_forma.py: no deben divergir."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "vision"))
    try:
        from preparacion import etiquetar_forma as ef
    finally:
        sys.path.pop(0)
    for largo, corto in [(25, 25), (30, 20), (40, 18), (45, 15), (35, 28)]:
        m = elipse(largo, corto)
        r = ef.rasgos(m)
        assert forma.rasgos(m) == pytest.approx((r["aspecto"], r["punta"]))
        assert forma.clasificar(*forma.rasgos(m)) == ef.clasificar(**r)


# --- segmentador -------------------------------------------------------------


def test_limpiar_rechaza_mapa_vacio():
    assert segmentador.limpiar(np.zeros((96, 96), np.float32)) is None


def test_limpiar_rechaza_mancha_pegada_al_borde():
    p = np.zeros((96, 96), np.float32)
    p[:40, 30:60] = 1
    assert segmentador.limpiar(p) is None


def test_limpiar_acepta_una_mancha_central():
    p = np.zeros((96, 96), np.float32)
    p[25:70, 30:62] = 1
    mascara = segmentador.limpiar(p)
    assert mascara is not None and mascara.dtype == bool and mascara.sum() > 800


def test_rasgos_tienen_la_forma_esperada():
    x = segmentador.rasgos_pixel(np.full((224, 224, 3), 128, np.uint8))
    assert x.shape == (96 * 96, segmentador.N_RASGOS)


def test_segmentador_sin_archivo_falla_claro(tmp_path):
    with pytest.raises(FileNotFoundError):
        segmentador.Segmentador(tmp_path / "no_existe.xml")


def test_segmentador_entrenado_con_un_circulo_lo_encuentra(tmp_path):
    """Entrena un bosque minimo con 12 imagenes sinteticas y comprueba que segmenta."""
    azar = np.random.default_rng(0)
    xs, ys = [], []
    for _ in range(12):
        img = np.full((96, 96, 3), 200, np.uint8)
        img[...] = azar.integers(150, 230, 3)
        mascara = elipse(18, 26).astype(np.uint8)
        img[mascara == 1] = (60, 60, 220)
        x, y = segmentador.rasgos_pixel(img), mascara.reshape(-1).astype(np.int32)
        idx = azar.choice(len(y), 600, replace=False)
        xs.append(x[idx]), ys.append(y[idx])
    bosque = cv2.ml.RTrees_create()
    bosque.setMaxDepth(8)
    bosque.setTermCriteria((cv2.TERM_CRITERIA_MAX_ITER, 15, 0))
    bosque.train(cv2.ml.TrainData_create(np.concatenate(xs), cv2.ml.ROW_SAMPLE, np.concatenate(ys)))
    ruta = tmp_path / "chico.xml"
    bosque.save(str(ruta))

    img = np.full((96, 96, 3), 190, np.uint8)
    img[elipse(18, 26)] = (60, 60, 220)
    mascara = segmentador.Segmentador(ruta).segmentar(img)
    assert mascara is not None
    verdad = elipse(18, 26)
    assert (mascara & verdad).sum() / (mascara | verdad).sum() > 0.8
    # Un recorte liso (blanco por transparencia o flash) no tiene una que medir.
    assert segmentador.Segmentador(ruta).segmentar(np.full((96, 96, 3), 255, np.uint8)) is None


def test_tiene_contraste_rechaza_lisos_y_acepta_texturas():
    azar = np.random.default_rng(0)
    assert not segmentador.tiene_contraste(np.full((96, 96, 3), 255, np.uint8))
    assert not segmentador.tiene_contraste(np.full((96, 96, 3), 120, np.uint8))
    assert segmentador.tiene_contraste(azar.integers(0, 255, (96, 96, 3), dtype=np.uint8))


@pytest.mark.parametrize(
    "contenido",
    [
        b"",  # copia que no llego a escribir nada
        b'<?xml version="1.0"?>\n<opencv_storage></opencv_storage>\n',  # valido pero sin modelo: segfault en OpenCV
        b'<?xml version="1.0"?>\n<opencv_storage>\n<opencv_ml_rtrees>\n<format>3</format>\n',  # cortado
        b"<garbage>1 2 3",
    ],
    ids=["vacio", "sin_modelo", "cortado", "basura"],
)
def test_segmentador_con_xml_danado_falla_con_valueerror(tmp_path, contenido):
    ruta = tmp_path / "malo.xml"
    ruta.write_bytes(contenido)
    with pytest.raises(ValueError):
        segmentador.Segmentador(ruta)


# --- forma predominante ------------------------------------------------------


def una(f, fiable=True):
    return Una(
        dedo="indice", mano=1, esquinas=[(0, 0)] * 4, recorte="x", forma=f, forma_fiable=fiable, clinico=SIN_MODELO
    )


def test_predominante_la_mas_repetida():
    assert _forma_predominante([una("cuadrada"), una("cuadrada"), una("redonda")]) == "cuadrada"


def test_predominante_ignora_las_no_fiables():
    assert _forma_predominante([una("almendra", False), una("almendra", False), una("redonda")]) == "redonda"


def test_predominante_none_en_empate_o_sin_formas():
    assert _forma_predominante([una("cuadrada"), una("redonda")]) is None
    assert _forma_predominante([Una(dedo="indice", mano=1, esquinas=[(0, 0)] * 4, recorte="x", clinico=SIN_MODELO)]) is None
