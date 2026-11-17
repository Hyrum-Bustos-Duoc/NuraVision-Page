"""Pruebas del camino primer_plano: foto sin mano tratada como una sola una.

No hay fotos de unas en el repo (dato biometrico). La puerta (clinico.parece_una)
se prueba con un clasificador falso cuyo embedding se controla; con el modelo y la
referencia reales, si estan instalados, se comprueba que fotos que no son unas
(paisaje, cara dibujada, ruido, lisas) salen sin_mano y nunca con una clase
clinica. La tasa de aceptacion sobre fotos reales de unas se midio fuera del
repo, con Nail.zip (ver el reporte de la tarea).
"""

import dataclasses
import hashlib
import json
import logging

import cv2
import numpy as np
import pytest
from pydantic import ValidationError

from app.main import RUTA_CLINICO, RUTA_MODELO, RUTA_TEXTOS_CLINICOS
from app.vision import clinico, unas
from app.vision.esquemas import Modelo, ResultadoAnalisis, Una
from app.vision.unas import AnalizadorUnas, recorte_primer_plano
from tests.test_clinico import DetectorFalso, _cargar_imagen_del_entrenamiento, falso, probs

modelo_presente = RUTA_MODELO.is_file()
REFERENCIA = clinico.ReferenciaUna(media=np.array([1.0, 0.0, 0.0]), umbral=0.7)
UNA_FALSA = np.array([3.0, 0.5, 0.0])  # coseno 0.99 con la referencia
NO_UNA = np.array([0.0, 1.0, 0.0])  # coseno 0


def con_puerta(embedding, predecir=lambda _x: probs("linea_beau", 0.9)) -> clinico.ClasificadorClinico:
    emb = embedding if callable(embedding) else (lambda _x: embedding)
    return dataclasses.replace(falso(predecir), embeber=emb, referencia=REFERENCIA)


def foto_lisa(ancho=640, alto=480) -> bytes:
    """Degradado sin mano: el detector real no ve nada en ella."""
    yy, xx = np.mgrid[:alto, :ancho]
    img = np.dstack([(xx * 255 // ancho), (yy * 255 // alto), np.full_like(xx, 128)]).astype(np.uint8)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


# --- normalizacion -----------------------------------------------------------


def test_el_recorte_es_identico_a_la_entrada_del_entrenamiento(tmp_path, monkeypatch):
    # Foto apaisada: obliga a rellenar, que es donde una normalizacion distinta se notaria.
    cargar_imagen = _cargar_imagen_del_entrenamiento(monkeypatch)
    foto = np.random.default_rng(20261117).integers(0, 256, (300, 520, 3), dtype=np.uint8)
    ruta = tmp_path / "foto.png"
    assert cv2.imwrite(str(ruta), foto)
    obtenido = clinico.entrada(recorte_primer_plano(unas.decodificar(ruta.read_bytes())))
    np.testing.assert_array_equal(obtenido, cargar_imagen(ruta, 224).astype(np.float32))


def test_el_recorte_rellena_con_negro_sin_estirar_ni_cortar():
    foto = np.full((200, 400, 3), (10, 20, 200), np.uint8)  # 2:1, rojo en BGR
    recorte = recorte_primer_plano(foto)
    assert recorte.shape == (224, 224, 3)
    filas_rojas = np.where((recorte[:, 112, 2] > 150))[0]
    assert len(filas_rojas) == pytest.approx(112, abs=2)  # 224 / 2: proporcion conservada
    assert recorte[:50].max() == 0 and recorte[-50:].max() == 0  # bandas negras
    assert tuple(recorte[112, 112]) == pytest.approx((10, 20, 200), abs=2)


# --- puerta ------------------------------------------------------------------


def test_la_puerta_acepta_lo_parecido_y_rechaza_lo_distinto():
    assert clinico.parece_una(con_puerta(UNA_FALSA), np.zeros((224, 224, 3), np.uint8))
    assert not clinico.parece_una(con_puerta(NO_UNA), np.zeros((224, 224, 3), np.uint8))


def test_sin_referencia_o_sin_clasificador_no_hay_primer_plano():
    recorte = np.zeros((224, 224, 3), np.uint8)
    assert not clinico.parece_una(None, recorte)
    assert not clinico.parece_una(falso(probs("linea_beau", 0.9)), recorte)  # sin embeber ni referencia
    sin_ref = dataclasses.replace(con_puerta(UNA_FALSA), referencia=None)
    assert not clinico.parece_una(sin_ref, recorte)


def _explota(_x):
    raise RuntimeError("valor 0.123 del tensor")


@pytest.mark.parametrize(
    "embedding", [_explota, np.array([np.nan, 1.0, 0.0]), np.ones(5), np.zeros(3)], ids=["excepcion", "nan", "forma", "cero"]
)
def test_un_fallo_de_la_puerta_rechaza_sin_lanzar_ni_filtrar_valores(embedding, caplog):
    with caplog.at_level(logging.WARNING):
        assert clinico.parece_una(con_puerta(embedding), np.zeros((224, 224, 3), np.uint8)) is False
    assert "0.123" not in caplog.text


# --- camino completo (detector real, que no ve mano en una foto lisa) --------


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_sin_mano_y_aceptada_sale_una_sola_una_de_primer_plano():
    r = AnalizadorUnas(RUTA_MODELO, None, con_puerta(UNA_FALSA)).analizar(foto_lisa())
    assert (r.estado, r.modo, r.motivo, r.manos, len(r.unas)) == ("ok", "primer_plano", None, 0, 1)
    u = r.unas[0]
    assert (u.dedo, u.mano, u.forma, u.contorno) == (None, None, None, [])
    assert u.esquinas == unas.ESQUINAS_FOTO
    assert u.recorte.startswith("data:image/jpeg;base64,")
    assert (u.clinico.estado, u.clinico.clase) == ("ok", "linea_beau")
    assert u.calidad.lado_origen == 480  # el lado menor de la foto de 640x480
    assert r.forma_predominante is None


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_sin_mano_y_rechazada_es_sin_mano_y_no_se_clasifica():
    llamadas = []

    def predecir(_x):
        llamadas.append(1)
        return probs("linea_beau", 0.99)

    r = AnalizadorUnas(RUTA_MODELO, None, con_puerta(NO_UNA, predecir)).analizar(foto_lisa())
    assert (r.estado, r.motivo, r.modo, r.unas) == ("no_concluyente", "sin_mano", None, [])
    assert llamadas == []  # una foto rechazada no recibe ninguna senal clinica, ni oculta


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_con_mano_no_se_consulta_la_puerta():
    def no_llamar(_x):
        raise AssertionError("con mano detectada no hay primer plano")

    a = AnalizadorUnas(RUTA_MODELO, None, con_puerta(no_llamar))
    a._detector = DetectorFalso()
    r = a.analizar(foto_lisa(640, 640))
    assert (r.estado, r.modo) == ("ok", "mano_completa")
    assert all(u.dedo is not None and u.mano == 1 for u in r.unas)


# --- contrato ----------------------------------------------------------------

UNA_PP = {"dedo": None, "mano": None, "esquinas": unas.ESQUINAS_FOTO, "recorte": "x",
          "calidad": {"brillo": 120.0, "lado_origen": 640}, "clinico": clinico.SIN_MODELO}
BASE = {"manos": 0, "modelo": Modelo(nombre="m", version="1"), "modelo_clinico": None}


@pytest.mark.parametrize(
    "campos",
    [
        {"estado": "ok", "modo": None, "unas": [UNA_PP]},
        {"estado": "no_concluyente", "motivo": "sin_mano", "modo": "primer_plano", "unas": []},
        {"estado": "ok", "modo": "primer_plano", "unas": [{**UNA_PP, "dedo": "indice"}]},
        {"estado": "ok", "modo": "primer_plano", "unas": [{**UNA_PP, "forma": "redonda"}]},
        {"estado": "ok", "modo": "primer_plano", "unas": [UNA_PP, UNA_PP]},
        {"estado": "ok", "modo": "primer_plano", "unas": [UNA_PP], "manos": 1},
        {"estado": "ok", "modo": "mano_completa", "unas": [UNA_PP], "manos": 1},
    ],
    ids=["ok_sin_modo", "nc_con_modo", "pp_con_dedo", "pp_con_forma", "pp_dos_unas", "pp_con_mano", "mano_sin_dedo"],
)
def test_el_contrato_rechaza_combinaciones_incoherentes(campos):
    with pytest.raises(ValidationError):
        ResultadoAnalisis(**{**BASE, **campos})


def test_el_contrato_acepta_primer_plano_coherente():
    r = ResultadoAnalisis(**BASE, estado="ok", modo="primer_plano", unas=[Una(**UNA_PP)])
    assert r.model_dump()["unas"][0]["dedo"] is None


# --- referencia --------------------------------------------------------------


def _carpeta_referencia(tmp_path, **cambios):
    (tmp_path / "modelo.tflite").write_bytes(b"pesos")
    datos = {"modelo_sha256": hashlib.sha256(b"pesos").hexdigest(), "media": [2.0, 0.0, 0.0], "umbral_coseno": 0.7}
    (tmp_path / clinico.ARCHIVO_REFERENCIA).write_text(json.dumps({**datos, **cambios}))
    return tmp_path


def _embeber(_x):
    return np.zeros(3)


def test_una_referencia_valida_se_carga_normalizada(tmp_path):
    ref = clinico._referencia(_carpeta_referencia(tmp_path), _embeber)
    assert ref is not None and ref.umbral == 0.7
    np.testing.assert_allclose(ref.media, [1.0, 0.0, 0.0])


@pytest.mark.parametrize(
    "cambios",
    [{"modelo_sha256": "0" * 64}, {"media": [1.0, 0.0]}, {"media": [0.0, 0.0, 0.0]}, {"umbral_coseno": 1.5}, {"umbral_coseno": True}],
    ids=["otro_modelo", "dimension", "norma_cero", "umbral_fuera", "umbral_bool"],
)
def test_una_referencia_invalida_se_ignora_sin_impedir_cargar(tmp_path, caplog, cambios):
    with caplog.at_level(logging.WARNING, logger="app.vision.clinico"):
        assert clinico._referencia(_carpeta_referencia(tmp_path, **cambios), _embeber) is None
    assert "Referencia de primer plano ignorada" in caplog.text


def test_sin_archivo_de_referencia_no_hay_primer_plano(tmp_path):
    assert clinico._referencia(tmp_path, _embeber) is None


# --- modelo y referencia reales, si estan instalados -------------------------

clasificador_real = clinico.cargar_opcional(RUTA_CLINICO, RUTA_TEXTOS_CLINICOS)
puerta_real = clasificador_real is not None and clasificador_real.referencia is not None


def _no_unas() -> dict[str, np.ndarray]:
    rng = np.random.default_rng(20261117)
    paisaje = np.zeros((480, 640, 3), np.uint8)
    paisaje[:240], paisaje[240:] = (235, 180, 120), (60, 140, 70)
    cv2.circle(paisaje, (500, 90), 45, (80, 220, 255), -1)
    cara = np.full((640, 480, 3), (200, 210, 225), np.uint8)
    cv2.ellipse(cara, (240, 320), (150, 200), 0, 0, 360, (150, 175, 215), -1)  # tono piel
    for x in (185, 295):
        cv2.circle(cara, (x, 270), 12, (60, 40, 30), -1)
    cv2.ellipse(cara, (240, 420), (55, 18), 0, 0, 180, (90, 80, 170), -1)
    piel = np.clip(np.full((480, 480, 3), (150, 180, 220), np.float32) + rng.normal(0, 12, (480, 480, 3)), 0, 255)
    return {
        "paisaje": paisaje,
        "cara": cara,
        "piel_sin_una": piel.astype(np.uint8),
        "ruido": rng.integers(0, 256, (480, 640, 3), dtype=np.uint8),
        "blanco": np.full((480, 640, 3), 255, np.uint8),
    }


@pytest.mark.skipif(not (modelo_presente and puerta_real), reason="falta el modelo clinico o su referencia de primer plano")
@pytest.mark.parametrize("nombre", list(_no_unas()))
def test_con_el_modelo_real_lo_que_no_es_una_sale_sin_mano(nombre):
    ok, buf = cv2.imencode(".png", _no_unas()[nombre])
    r = AnalizadorUnas(RUTA_MODELO, None, clasificador_real).analizar(buf.tobytes())
    assert (r.estado, r.motivo, r.unas) == ("no_concluyente", "sin_mano", [])


@pytest.mark.skipif(not puerta_real, reason="falta el modelo clinico o su referencia de primer plano")
def test_el_embedding_real_es_determinista():
    x = clinico.entrada(recorte_primer_plano(_no_unas()["cara"]))
    np.testing.assert_array_equal(clasificador_real.embeber(x), clasificador_real.embeber(x))
