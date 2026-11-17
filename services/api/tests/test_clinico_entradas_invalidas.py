"""Clasificador clinico frente a archivos de modelo rotos y salidas extremas.

Casos de la reverificacion de QA del 2026-11-12. Lo que se prueba: un
etiquetas.json, metadatos.json, .tflite o archivo de textos invalido nunca
impide arrancar ni da un 5xx (las unas salen modelo_no_entrenado), y decidir()
devuelve un resultado valido con probabilidades limite. Helpers y fixtures
sinteticas compartidos con test_clinico.py; ninguna foto real.
"""

import json
import logging

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import RUTA_TEXTOS_CLINICOS, app
from app.vision import clinico
from tests.test_clinico import ETIQUETAS, RECORTE, _analizador, _carpeta, _foto, falso, modelo_presente


def _numeradas(etiquetas) -> dict:
    return {str(i): e for i, e in enumerate(etiquetas)}


ETIQUETAS_INVALIDAS = {
    "valores_lista": {str(i): [e] for i, e in enumerate(ETIQUETAS)},
    "un_valor_dict": {**_numeradas(ETIQUETAS), "1": {"a": 1}},
    "null": None,
    "numero": 9,
    "nan": float("nan"),
    "texto": "abcdefghi",
    "lista_vacia": [],
    "lista_de_9": list(ETIQUETAS),
    "dict_vacio": {},
    "duplicadas": _numeradas((*ETIQUETAS[:-1], ETIQUETAS[0])),
    "faltan_una": _numeradas(ETIQUETAS[:-1]),
    "hueco_en_los_indices": {**{str(i): e for i, e in enumerate(ETIQUETAS) if i != 4}, "9": ETIQUETAS[4]},
    "clave_extra": {**_numeradas(ETIQUETAS), "x": "y"},
    "valor_numero": {**_numeradas(ETIQUETAS), "3": 3},
    "valor_null": {**_numeradas(ETIQUETAS), "3": None},
    "valor_bool": {**_numeradas(ETIQUETAS), "3": True},
    "mayusculas": {**_numeradas(ETIQUETAS), "3": "OTRA"},
    "espacios": {**_numeradas(ETIQUETAS), "3": "otra "},
    "claves_con_cero_delante": {f"0{i}": e for i, e in enumerate(ETIQUETAS)},
}


@pytest.mark.parametrize("nombre", list(ETIQUETAS_INVALIDAS))
def test_etiquetas_invalidas_no_cargan_ni_lanzan(tmp_path, caplog, nombre):
    carpeta = _carpeta(tmp_path)
    (carpeta / "etiquetas.json").write_text(json.dumps(ETIQUETAS_INVALIDAS[nombre]))
    with caplog.at_level(logging.WARNING, logger="app.vision.clinico"):
        assert clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS) is None
    assert "ignorado" in caplog.text


@pytest.mark.parametrize(
    "contenido",
    ["[" * 100_000 + "]" * 100_000, '{"0": "\\ud800"}', ""],
    ids=["json_muy_anidado", "surrogate_suelto", "vacio"],
)
def test_etiquetas_ilegibles(tmp_path, contenido):
    carpeta = _carpeta(tmp_path)
    (carpeta / "etiquetas.json").write_text(contenido)
    assert clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS) is None


_META = {"tarea": "estado_clinico", "umbral_no_concluyente": 0.7, "umbral_sin_senales": 0.9, "model": {"name": "a", "version": "1"}}


@pytest.mark.parametrize(
    "meta",
    [
        "null",
        "[]",
        '"x"',
        json.dumps(_META).replace("0.7", "NaN"),
        json.dumps({**_META, "model": None}),
        json.dumps({"tarea": ["estado_clinico"]}),
    ],
    ids=["null", "lista", "texto", "umbral_nan", "model_null", "tarea_lista"],
)
def test_metadatos_invalidos_no_cargan(tmp_path, meta):
    carpeta = _carpeta(tmp_path)
    (carpeta / "metadatos.json").write_text(meta)
    assert clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS) is None


def test_sin_tflite_no_carga(tmp_path):
    carpeta = _carpeta(tmp_path)
    (carpeta / "modelo.tflite").unlink()
    assert clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS) is None


def test_tflite_que_es_una_carpeta_no_carga(tmp_path):
    carpeta = _carpeta(tmp_path)
    (carpeta / "modelo.tflite").unlink()
    (carpeta / "modelo.tflite").mkdir()
    assert clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS) is None


@pytest.mark.parametrize(
    "textos",
    [b"\xff\xfe basura", b"estado_revision = 'pendiente'\n[clases]\n", b"estado_revision = 'pendiente'\nclases = 3\n"],
    ids=["no_utf8", "clases_vacio", "clases_no_tabla"],
)
def test_textos_invalidos_no_cargan(tmp_path, textos):
    ruta = tmp_path / "t.toml"
    ruta.write_bytes(textos)
    assert clinico.cargar_opcional(_carpeta(tmp_path), ruta) is None


def test_textos_muy_anidados_no_cargan_ni_lanzan(tmp_path):
    # QA 2026-11-12: un TOML con 50.000 niveles lanza RecursionError al leerlo.
    ruta = tmp_path / "t.toml"
    ruta.write_text("x = " + "[" * 50_000 + "]" * 50_000 + "\n", encoding="utf-8")
    assert clinico.cargar_opcional(_carpeta(tmp_path), ruta) is None


class _InterpreteFalso:
    """Imita al Interpreter de LiteRT con las formas correctas y el dtype que se le pida."""

    def __init__(self, dtype_entrada, dtype_salida):
        self._d = (dtype_entrada, dtype_salida)

    def __call__(self, model_path, **_opciones):
        return self

    def allocate_tensors(self):
        pass

    def get_tensor_details(self):
        return []  # sin tensor de embedding: el clasificador carga igual, sin primer plano

    def get_input_details(self):
        return [{"shape": np.array([1, clinico.LADO, clinico.LADO, 3]), "dtype": self._d[0], "index": 0}]

    def get_output_details(self):
        return [{"shape": np.array([1, len(ETIQUETAS)]), "dtype": self._d[1], "index": 1}]


@pytest.mark.parametrize(
    "entrada, salida",
    [(np.uint8, np.float32), (np.int8, np.float32), (np.float32, np.uint8), (np.float32, np.int8)],
    ids=["entrada_uint8", "entrada_int8", "salida_uint8", "salida_int8"],
)
def test_modelo_cuantizado_no_carga(tmp_path, monkeypatch, entrada, salida):
    # QA 2026-11-12: cargaba como valido (y /salud lo daba por cargado) y fallaba en cada una.
    monkeypatch.setattr(clinico, "Interpreter", _InterpreteFalso(entrada, salida))
    assert clinico.cargar_opcional(_carpeta(tmp_path), RUTA_TEXTOS_CLINICOS) is None


def test_modelo_float32_si_carga(tmp_path, monkeypatch):
    monkeypatch.setattr(clinico, "Interpreter", _InterpreteFalso(np.float32, np.float32))
    assert clinico.cargar_opcional(_carpeta(tmp_path), RUTA_TEXTOS_CLINICOS) is not None


# --- por HTTP ----------------------------------------------------------------


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_con_etiquetas_invalidas_arranca_salud_lo_dice_y_analizar_da_200(monkeypatch, tmp_path):
    carpeta = _carpeta(tmp_path)
    (carpeta / "etiquetas.json").write_text(json.dumps(ETIQUETAS_INVALIDAS["un_valor_dict"]))
    monkeypatch.setattr(main, "RUTA_CLINICO", carpeta)
    with TestClient(app) as c:
        salud = c.get("/salud").json()
        r = c.post("/vision/analizar", files={"foto": ("f.png", _foto(), "image/png")})
    assert (salud["ok"], salud["modelo_cargado"], salud["clasificador_clinico_cargado"]) == (True, True, False)
    # Detector real sobre una foto lisa: no ve mano. Lo que importa es que no hay 5xx.
    assert r.status_code == 200
    assert r.json()["modelo_clinico"] is None


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_con_etiquetas_invalidas_cada_una_sale_modelo_no_entrenado_por_http(tmp_path):
    carpeta = _carpeta(tmp_path)
    (carpeta / "etiquetas.json").write_text(json.dumps(ETIQUETAS_INVALIDAS["un_valor_dict"]))
    with TestClient(app) as c:
        anterior = app.state.analizador
        app.state.analizador = _analizador(clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS))
        try:
            r = c.post("/vision/analizar", files={"foto": ("f.png", _foto(), "image/png")})
        finally:
            app.state.analizador = anterior
    assert r.status_code == 200
    unas = r.json()["unas"]
    assert len(unas) == 3 and all(u["clinico"]["motivo"] == "modelo_no_entrenado" for u in unas)


# --- decidir con probabilidades limite ---------------------------------------


def _alternativas_validas(c, predicha):
    assert c.estado == "ok"
    alts = [a.clase for a in c.alternativas]
    assert len(alts) == 2
    assert "sin_senales" not in alts and "otra" not in alts and predicha not in alts
    assert c.alternativas[0].confianza >= c.alternativas[1].confianza


@pytest.mark.parametrize("predicha", [e for e in ETIQUETAS if e != "otra"])
@pytest.mark.parametrize("segunda", ["sin_senales", "otra", None])
def test_toda_clase_predicha_da_dos_alternativas_validas(predicha, segunda):
    v = dict.fromkeys(ETIQUETAS, 0.0)
    v[predicha] = 0.95
    if segunda and segunda != predicha:
        v[segunda] = 0.05
    c = clinico.clasificar(falso(np.array([v[e] for e in ETIQUETAS]), 0.7, 0.9), RECORTE)
    _alternativas_validas(c, predicha)


@pytest.mark.parametrize("p", [1.0, 1.0 + 1e-7, 0.9999999, 0.70])
def test_sin_senales_con_probabilidad_extrema(p):
    v = np.zeros(9)
    v[ETIQUETAS.index("sin_senales")] = p
    c = clinico.clasificar(falso(v, 0.7, 0.0), RECORTE)
    _alternativas_validas(c, "sin_senales")
    assert 0 <= c.confianza <= 1


def test_softmax_float32_que_pasa_de_1():
    # En float32 la clase puede valer 1.0000001: redondeada a 3 decimales es 1.0.
    v = np.zeros(9, np.float32)
    v[0] = np.float32(1.0000001)
    _alternativas_validas(clinico.clasificar(falso(v), RECORTE), ETIQUETAS[0])


def test_empate_entre_otra_y_sin_senales_gana_la_primera_etiqueta():
    # argmax toma "otra" (indice 3) antes que "sin_senales" (5): se abstiene.
    v = np.zeros(9)
    v[3] = v[5] = 0.5
    assert clinico.clasificar(falso(v, 0.0, 0.0), RECORTE).motivo == "clase_otra"


def test_salida_uniforme_con_umbral_cero():
    c = clinico.clasificar(falso(np.full(9, 1 / 9), 0.0, 0.0), RECORTE)
    _alternativas_validas(c, ETIQUETAS[0])
    assert [a.clase for a in c.alternativas] == ["linea_oscura", "acropaquia"]


def test_logits_sin_softmax_son_clasificacion_fallida():
    # Un modelo exportado sin softmax da valores > 1: el contrato los rechaza y
    # la una sale no_concluyente en vez de un 5xx.
    c = clinico.clasificar(falso(np.linspace(-3, 5, 9), 0.0, 0.0), RECORTE)
    assert c == clinico.no_concluyente("clasificacion_fallida")
