"""Pruebas del bloque clinico por una.

No hay modelo clinico entrenado ni fotos reales en el repo: la abstencion se
prueba con un clasificador falso que devuelve probabilidades fijas, y el
camino completo con un detector de manos falso sobre una imagen lisa. Nada de
esto mide si el modelo acierta; mide que el servicio decide, se abstiene y
degrada como dice design.md.
"""

import dataclasses
import json
import logging
import re
import sys
import types
import unicodedata
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.main import RUTA_MODELO, RUTA_TEXTOS_CLINICOS, app
from app.vision import clinico
from app.vision.clinico import CLASES_PUBLICAS, ClasificadorClinico, cargar_textos
from app.vision.esquemas import AlternativaClinica, CalidadUna, Clinico, Modelo, ReporteClinico
from app.vision.unas import AnalizadorUnas

TEXTOS = cargar_textos(RUTA_TEXTOS_CLINICOS)
# Mismo orden que escribiria etiquetas.json; "otra" en medio a proposito, para
# que ningun calculo dependa de que este al final.
ETIQUETAS = (
    "linea_beau", "linea_oscura", "acropaquia", "otra", "linea_mees",
    "sin_senales", "onicolisis", "una_terry", "mancha_blanca",
)
RECORTE = np.zeros((224, 224, 3), np.uint8)
# Calidad sobrada: las pruebas de reglas no deben pasar por la compuerta de calidad.
CALIDAD = CalidadUna(brillo=120.0, lado_origen=224)


def probs(principal: str, p: float, **otras: float) -> np.ndarray:
    """Vector de 9 probabilidades: `principal` con p, las nombradas con su valor y el resto a partes iguales."""
    v = dict.fromkeys(ETIQUETAS, 0.0)
    v[principal] = p
    v.update(otras)
    libres = [e for e in ETIQUETAS if e != principal and e not in otras]
    resto = max(1.0 - sum(v.values()), 0.0) / len(libres)
    return np.array([v[e] if e == principal or e in otras else resto for e in ETIQUETAS])


def falso(salida, umbral_nc: float | None = 0.70, umbral_ss: float | None = 0.90) -> ClasificadorClinico:
    """`salida`: vector fijo, o funcion (tensor -> vector) para simular fallos.

    Con CLASES_NUNCA_NOMBRADAS como no fiables, igual que lo deja cargar() con
    cualquier modelo: un falso sin ellas probaria salidas que no pueden ocurrir.
    """
    return ClasificadorClinico(
        predecir=salida if callable(salida) else (lambda _x: salida),
        etiquetas=ETIQUETAS,
        umbral_no_concluyente=umbral_nc,
        umbral_sin_senales=umbral_ss,
        textos=TEXTOS,
        modelo=Modelo(nombre="clasificador-falso", version="test"),
        clases_no_fiables=clinico.CLASES_NUNCA_NOMBRADAS,
    )


# --- contrato ----------------------------------------------------------------

REPORTE = TEXTOS["linea_beau"].model_dump()
ALT = [
    {"clase": "linea_mees", "nombre": "x", "confianza": 0.05},
    {"clase": "onicolisis", "nombre": "y", "confianza": 0.04},
]
OK = {"estado": "ok", "motivo": None, "clase": "linea_beau", "confianza": 0.8, "alternativas": ALT, "reporte": REPORTE}
NC = {"estado": "no_concluyente", "motivo": "confianza_baja", "clase": None, "confianza": None, "alternativas": [], "reporte": None}


def test_las_combinaciones_validas_se_construyen():
    Clinico(**OK)
    Clinico(**NC)
    # sin_senales no puede ser alternativa, pero si la clase predicha.
    Clinico(**{**OK, "clase": "sin_senales", "reporte": TEXTOS["sin_senales"].model_dump()})


@pytest.mark.parametrize(
    "cambios",
    [
        {**OK, "reporte": None},
        {**OK, "motivo": "confianza_baja"},
        {**OK, "alternativas": ALT[:1]},
        {**OK, "alternativas": ALT[::-1]},  # orden ascendente
        {**OK, "alternativas": [ALT[0], {**ALT[1], "clase": "linea_beau"}]},  # repite la predicha
        {**OK, "alternativas": [ALT[0], ALT[0]]},
        {**OK, "confianza": 1.2},
        {**OK, "clase": "otra"},
        {**OK, "alternativas": [{**ALT[0], "clase": "sin_senales"}, ALT[1]]},
        {**OK, "alternativas": [ALT[0], {**ALT[1], "clase": "sin_senales"}]},
        {**OK, "alternativas": [ALT[0], {**ALT[1], "clase": "otra"}]},
        {**OK, "alternativas": ALT + [{**ALT[1], "clase": "una_terry", "confianza": 0.01}]},
        {**NC, "confianza": 0.5},
        {**NC, "clase": "linea_beau"},
        {**NC, "alternativas": ALT},
        {**NC, "reporte": REPORTE},
        {**NC, "motivo": None},
    ],
    ids=[
        "ok_sin_reporte", "ok_con_motivo", "ok_una_alternativa", "ok_alternativas_desordenadas",
        "ok_alternativa_repite_clase", "ok_alternativas_repetidas", "ok_confianza_fuera_de_rango", "ok_clase_otra",
        "ok_alternativa_sin_senales_primera", "ok_alternativa_sin_senales_segunda", "ok_alternativa_otra",
        "ok_tres_alternativas",
        "nc_con_confianza", "nc_con_clase", "nc_con_alternativas", "nc_con_reporte", "nc_sin_motivo",
    ],
)
def test_las_combinaciones_invalidas_no_se_pueden_construir(cambios):
    with pytest.raises(ValidationError):
        Clinico(**cambios)


# --- reglas de abstencion ----------------------------------------------------


def test_resultado_concluyente_trae_clase_redondeada_alternativas_y_reporte():
    # "otra" es la segunda mas probable: no puede colarse en las alternativas.
    c = clinico.clasificar(falso(probs("linea_beau", 0.87349, otra=0.06, onicolisis=0.03, una_terry=0.0201)), RECORTE, CALIDAD)
    assert (c.estado, c.motivo, c.clase, c.confianza) == ("ok", None, "linea_beau", 0.873)
    assert [(a.clase, a.confianza) for a in c.alternativas] == [("onicolisis", 0.03), ("una_terry", 0.02)]
    assert [a.nombre for a in c.alternativas] == [TEXTOS["onicolisis"].nombre, TEXTOS["una_terry"].nombre]
    assert c.reporte == TEXTOS["linea_beau"]


def test_alternativas_empatadas_salen_en_el_orden_de_las_etiquetas():
    # Todas las demas a partes iguales: el resultado no puede variar entre ejecuciones.
    c = clinico.clasificar(falso(probs("una_terry", 0.92)), RECORTE, CALIDAD)
    assert [a.clase for a in c.alternativas] == ["linea_beau", "linea_oscura"]


def test_sin_senales_nunca_se_ofrece_como_alternativa_de_una_senal():
    # QA 2026-11-12: con linea_oscura al 0.80 y sin_senales segunda, la UI decia
    # "podria ser: Sin senales reconocidas", lo contrario de la recomendacion.
    c = clinico.clasificar(falso(probs("linea_oscura", 0.80, sin_senales=0.12, onicolisis=0.03, mancha_blanca=0.02)), RECORTE, CALIDAD)
    assert c.estado == "ok"
    assert [a.clase for a in c.alternativas] == ["onicolisis", "mancha_blanca"]


@pytest.mark.parametrize(
    "salida,umbral_nc,umbral_ss,motivo",
    [
        (probs("otra", 0.99), 0.70, 0.90, "clase_otra"),
        (probs("otra", 0.99), None, None, "clase_otra"),  # la regla 3 va antes que la 4
        (probs("linea_beau", 0.69), 0.70, 0.90, "confianza_baja"),
        (probs("linea_beau", 0.99), None, 0.90, "confianza_baja"),
        (probs("sin_senales", 0.85), 0.70, 0.90, "confianza_baja"),
        (probs("sin_senales", 0.99), 0.70, None, "confianza_baja"),
    ],
    ids=["otra_099", "otra_sin_umbrales", "bajo_umbral", "sin_umbral", "sin_senales_bajo_su_umbral", "sin_senales_nunca"],
)
def test_reglas_de_abstencion(salida, umbral_nc, umbral_ss, motivo):
    c = clinico.clasificar(falso(salida, umbral_nc, umbral_ss), RECORTE, CALIDAD)
    assert c == clinico.no_concluyente(motivo)
    assert '"otra"' not in c.model_dump_json()


# Tabla compartida con entrenamiento.metricas (services/vision/tests/test_metricas.py):
# si las dos copias de las reglas divergen, una de las dos suites falla. Sin esto,
# la tabla solo probaba la copia del entrenamiento y M1-M4 podian medir un sistema
# distinto del que despliega el servicio.
TABLA_ABSTENCION = json.loads(
    (Path(__file__).resolve().parents[2] / "vision" / "tests" / "casos_abstencion.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("caso", TABLA_ABSTENCION["casos"], ids=lambda c: c["caso"])
def test_tabla_de_abstencion_compartida_con_el_entrenamiento(caso):
    clasificador = ClasificadorClinico(
        predecir=lambda _x: np.array(caso["probs"]),
        etiquetas=tuple(TABLA_ABSTENCION["clases"]),
        umbral_no_concluyente=caso["umbral_no_concluyente"],
        umbral_sin_senales=caso["umbral_sin_senales"],
        textos=TEXTOS,
        modelo=Modelo(nombre="tabla", version="test"),
        clases_no_fiables=frozenset(caso.get("clases_no_fiables", [])),
        umbral_alguna_senal=caso.get("umbral_alguna_senal"),
    )
    c = clinico.clasificar(clasificador, RECORTE, CALIDAD)
    decision = caso["decision"]
    if decision == "senal_inespecifica":
        assert (c.estado, c.motivo) == ("senal_inespecifica", None)
    else:
        assert (c.estado, c.motivo) == ("ok" if decision is None else "no_concluyente", decision)


@pytest.mark.parametrize("clase,p", [("linea_oscura", 0.70), ("sin_senales", 0.90), ("sin_senales", 0.95)])
def test_en_el_umbral_o_encima_se_acepta(clase, p):
    # >=, igual que entrenamiento.metricas.evaluar_umbral: el umbral calibrado se acepta.
    c = clinico.clasificar(falso(probs(clase, p)), RECORTE, CALIDAD)
    assert (c.estado, c.clase) == ("ok", clase)


def test_sin_clasificador_es_modelo_no_entrenado():
    assert clinico.clasificar(None, RECORTE, CALIDAD) == clinico.no_concluyente("modelo_no_entrenado")


def _explota(_x):
    raise RuntimeError("fallo del interprete")


@pytest.mark.parametrize(
    "salida",
    [_explota, lambda _x: np.full(9, np.nan), lambda _x: np.ones(5) / 5],
    ids=["excepcion", "nan", "forma_distinta"],
)
def test_un_fallo_al_clasificar_es_clasificacion_fallida(salida):
    assert clinico.clasificar(falso(salida), RECORTE, CALIDAD) == clinico.no_concluyente("clasificacion_fallida")


# --- calidad, clases no fiables y senal_inespecifica ------------------------
# Reglas de la ronda 2 (aprobadas por el dueno el 2026-11-17). Cada una sale de un
# campo de metadatos.json; sin el campo, la regla no se aplica (modelo instalado).

NO_FIABLES = frozenset({"acropaquia", "linea_mees"})


def con_reglas(salida, **campos) -> ClasificadorClinico:
    return dataclasses.replace(falso(salida), **campos)


def _no_llamar(_x):
    raise AssertionError("una foto insuficiente no se le pasa al modelo")


@pytest.mark.parametrize(
    "calidad,campos",
    [
        (CalidadUna(brillo=39.99, lado_origen=224), {"brillo_minimo": 40.0}),
        (CalidadUna(brillo=120.0, lado_origen=63), {"lado_minimo": 64}),
        (CalidadUna(brillo=10.0, lado_origen=10), {"brillo_minimo": 40.0, "lado_minimo": 64}),
    ],
    ids=["oscura", "zona_pequena", "las_dos"],
)
def test_foto_insuficiente_se_decide_antes_del_modelo(calidad, campos):
    c = clinico.clasificar(con_reglas(_no_llamar, **campos), RECORTE, calidad)
    assert c == clinico.no_concluyente("foto_insuficiente")


def test_en_la_calidad_minima_se_clasifica():
    c = con_reglas(probs("linea_beau", 0.9), brillo_minimo=40.0, lado_minimo=64)
    assert clinico.clasificar(c, RECORTE, CalidadUna(brillo=40.0, lado_origen=64)).estado == "ok"


def test_sin_calidad_minima_una_foto_oscura_se_clasifica_como_hoy():
    oscura = CalidadUna(brillo=0.0, lado_origen=1)
    assert clinico.clasificar(falso(probs("linea_beau", 0.9)), RECORTE, oscura).estado == "ok"


def test_sin_modelo_va_antes_que_la_calidad():
    c = clinico.clasificar(None, RECORTE, CalidadUna(brillo=0.0, lado_origen=0))
    assert c == clinico.SIN_MODELO


def test_medir_calidad_mide_el_brillo_del_entrenamiento_y_trunca_el_lado(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[2] / "vision"))
    from entrenamiento import degradaciones

    recorte = np.random.default_rng(20261117).integers(0, 256, (224, 224, 3), dtype=np.uint8)
    calidad = clinico.medir_calidad(recorte, 63.9)
    # degradaciones.brillo recibe RGB (lo que ve el modelo); el servicio tiene BGR.
    assert calidad.brillo == degradaciones.brillo(cv2.cvtColor(recorte, cv2.COLOR_BGR2RGB))
    assert calidad.lado_origen == 63


@pytest.mark.parametrize("clase", sorted(NO_FIABLES))
def test_una_clase_no_fiable_no_se_nombra_aunque_supere_el_umbral(clase):
    c = clinico.clasificar(con_reglas(probs(clase, 0.95), clases_no_fiables=NO_FIABLES), RECORTE, CALIDAD)
    assert c == clinico.no_concluyente("clase_no_fiable")


def test_una_clase_no_fiable_nunca_es_alternativa():
    # Una no fiable del metadatos.json (una_terry) junto a las dos que nunca se nombran.
    salida = probs("linea_beau", 0.8, acropaquia=0.1, una_terry=0.05, linea_mees=0.02, onicolisis=0.015, mancha_blanca=0.01)
    no_fiables = clinico.CLASES_NUNCA_NOMBRADAS | {"una_terry"}
    c = clinico.clasificar(con_reglas(salida, clases_no_fiables=no_fiables), RECORTE, CALIDAD)
    assert c.estado == "ok"
    assert [a.clase for a in c.alternativas] == ["onicolisis", "mancha_blanca"]


def test_senal_inespecifica_no_nombra_ninguna_clase_y_trae_su_probabilidad():
    # acropaquia confiada (no fiable) y las senales juntas sobre el umbral.
    salida = probs("acropaquia", 0.9, linea_mees=0.04, sin_senales=0.01, otra=0.01)
    c = clinico.clasificar(
        con_reglas(salida, clases_no_fiables=NO_FIABLES, umbral_alguna_senal=0.855), RECORTE, CALIDAD
    )
    assert (c.estado, c.motivo, c.clase, c.confianza, c.alternativas) == ("senal_inespecifica", None, None, None, [])
    assert c.p_alguna_senal == 0.98
    assert c.reporte == TEXTOS[clinico.SENAL_INESPECIFICA]
    cuerpo = c.model_dump_json()
    assert [x for x in (*CLASES_PUBLICAS, '"otra"') if x in cuerpo] == []
    assert [k for k in CLASES_PUBLICAS if TEXTOS[k].nombre in cuerpo] == []


def test_bajo_umbral_alguna_senal_se_abstiene_con_su_motivo():
    salida = probs("linea_beau", 0.5, linea_oscura=0.3, sin_senales=0.2)
    c = clinico.clasificar(con_reglas(salida, umbral_alguna_senal=0.855), RECORTE, CALIDAD)
    assert c == clinico.no_concluyente("confianza_baja")


def test_una_senal_aceptada_no_pasa_a_senal_inespecifica():
    c = clinico.clasificar(con_reglas(probs("linea_oscura", 0.95), umbral_alguna_senal=0.5), RECORTE, CALIDAD)
    assert (c.estado, c.clase) == ("ok", "linea_oscura")


SI = {
    **NC, "estado": "senal_inespecifica", "motivo": None, "p_alguna_senal": 0.9,
    "reporte": TEXTOS[clinico.SENAL_INESPECIFICA].model_dump(),
}


def test_contrato_de_senal_inespecifica_y_motivos_nuevos():
    Clinico(**SI)
    Clinico(**{**NC, "motivo": "foto_insuficiente"})
    Clinico(**{**NC, "motivo": "clase_no_fiable"})


@pytest.mark.parametrize(
    "cambios",
    [
        {**SI, "p_alguna_senal": None},
        {**SI, "reporte": None},
        {**SI, "motivo": "confianza_baja"},
        {**SI, "clase": "linea_beau"},
        {**SI, "confianza": 0.5},
        {**SI, "alternativas": ALT},
        {**SI, "reporte": REPORTE},  # el de linea_beau trae asociaciones
        {**SI, "p_alguna_senal": 1.2},
        {**OK, "p_alguna_senal": 0.9},
        {**NC, "p_alguna_senal": 0.9},
    ],
    ids=[
        "si_sin_p", "si_sin_reporte", "si_con_motivo", "si_con_clase", "si_con_confianza", "si_con_alternativas",
        "si_reporte_con_asociaciones", "si_p_fuera_de_rango", "ok_con_p", "nc_con_p",
    ],
)
def test_combinaciones_invalidas_de_senal_inespecifica(cambios):
    with pytest.raises(ValidationError):
        Clinico(**cambios)


@pytest.mark.parametrize("calidad", [{"brillo": 255.1, "lado_origen": 1}, {"brillo": -1, "lado_origen": 1},
                                     {"brillo": 1, "lado_origen": -1}])
def test_calidad_fuera_de_rango_no_se_construye(calidad):
    with pytest.raises(ValidationError):
        CalidadUna(**calidad)


# --- entrada identica a la del entrenamiento --------------------------------


def _cargar_imagen_del_entrenamiento(monkeypatch):
    """entrenamiento.datos.cargar_imagen real, desde services/vision.

    datos.py importa sklearn al cargar (para pesos de clase, que aqui no se
    usan) y el venv del API no lo tiene: se sustituye solo durante el import.
    Se prueba contra la funcion real y no contra una copia, porque una copia
    podria quedar desalineada sin que ningun test lo note.
    """
    raiz_vision = Path(__file__).resolve().parents[2] / "vision"
    monkeypatch.syspath_prepend(str(raiz_vision))
    if "sklearn" not in sys.modules:
        stub = types.ModuleType("sklearn.utils.class_weight")
        stub.compute_class_weight = None
        for nombre, modulo in (
            ("sklearn", types.ModuleType("sklearn")),
            ("sklearn.utils", types.ModuleType("sklearn.utils")),
            ("sklearn.utils.class_weight", stub),
        ):
            monkeypatch.setitem(sys.modules, nombre, modulo)
    monkeypatch.delitem(sys.modules, "entrenamiento.datos", raising=False)
    from entrenamiento.datos import cargar_imagen

    return cargar_imagen


def test_tensor_identico_al_del_entrenamiento(tmp_path, monkeypatch):
    cargar_imagen = _cargar_imagen_del_entrenamiento(monkeypatch)
    recorte = np.random.default_rng(20261112).integers(0, 256, (224, 224, 3), dtype=np.uint8)
    ruta = tmp_path / "recorte.png"
    assert cv2.imwrite(str(ruta), recorte)
    esperado = cargar_imagen(ruta, 224).astype(np.float32)
    obtenido = clinico.entrada(recorte)
    assert obtenido.dtype == np.float32
    np.testing.assert_array_equal(obtenido, esperado)


# --- carga del modelo --------------------------------------------------------


def _carpeta(tmp_path, etiquetas=ETIQUETAS, **metadatos) -> Path:
    carpeta = tmp_path / "estado_clinico"
    carpeta.mkdir()
    (carpeta / "etiquetas.json").write_text(json.dumps({str(i): e for i, e in enumerate(etiquetas)}))
    base = {
        "model": {"name": "nuravision-estado_clinico-x", "version": "1"},
        "tarea": "estado_clinico",
        "umbral_no_concluyente": 0.7,
        "umbral_sin_senales": 0.9,
    }
    (carpeta / "metadatos.json").write_text(json.dumps({**base, **metadatos}))
    (carpeta / "modelo.tflite").write_bytes(b"no es un flatbuffer")
    return carpeta


def test_sin_carpeta_de_modelo_no_hay_clasificador(tmp_path):
    assert clinico.cargar_opcional(tmp_path / "no_existe", RUTA_TEXTOS_CLINICOS) is None


@pytest.mark.parametrize(
    "etiquetas,metadatos,motivo",
    [
        (("almendra", "cuadrada", "ovalada", "redonda", "stiletto"), {}, "9 ids"),
        ((*ETIQUETAS[:-1], "melanoma"), {}, "9 ids"),
        (ETIQUETAS, {"tarea": "forma"}, "tarea"),
        (ETIQUETAS, {"umbral_no_concluyente": 1.5}, "umbral_no_concluyente"),
        (ETIQUETAS, {"umbral_sin_senales": "0.9"}, "umbral_sin_senales"),
        (ETIQUETAS, {"model": "x"}, "model.name"),
        (ETIQUETAS, {}, "TFLite"),  # todo bien salvo el .tflite, que es basura
    ],
    ids=["etiquetas_de_forma", "clase_ajena", "otra_tarea", "umbral_fuera_de_rango", "umbral_texto", "sin_model", "tflite_danado"],
)
def test_un_modelo_que_no_cumple_no_se_carga(tmp_path, caplog, etiquetas, metadatos, motivo):
    carpeta = _carpeta(tmp_path, etiquetas, **metadatos)
    with caplog.at_level(logging.WARNING, logger="app.vision.clinico"):
        assert clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS) is None
    assert motivo in caplog.text


def test_metadatos_sin_umbral_sin_senales_no_se_carga(tmp_path):
    carpeta = _carpeta(tmp_path)
    datos = json.loads((carpeta / "metadatos.json").read_text())
    del datos["umbral_sin_senales"]
    (carpeta / "metadatos.json").write_text(json.dumps(datos))
    with pytest.raises(clinico.ClasificadorNoDisponible, match="umbral_sin_senales"):
        clinico.cargar(carpeta, RUTA_TEXTOS_CLINICOS)


def test_textos_sin_una_clase_impiden_cargar(tmp_path):
    texto = RUTA_TEXTOS_CLINICOS.read_text(encoding="utf-8")
    sin_terry = re.sub(r"\[clases\.una_terry\].*?(?=\n\[)", "", texto, flags=re.S)
    assert "una_terry" not in sin_terry.split("[clases.", 1)[1]
    ruta = tmp_path / "textos.toml"
    ruta.write_text(sin_terry, encoding="utf-8")
    with pytest.raises(clinico.ClasificadorNoDisponible, match="exactamente los ids"):
        clinico.cargar(_carpeta(tmp_path), ruta)


def _cargar_sin_tflite(tmp_path, monkeypatch, **metadatos) -> ClasificadorClinico:
    """cargar() con todo real salvo el interprete, para probar lo que lee de metadatos.json."""
    monkeypatch.setattr(clinico, "_interprete", lambda _ruta, _n: (lambda _x: probs("linea_beau", 0.9), None))
    return clinico.cargar(_carpeta(tmp_path, **metadatos), RUTA_TEXTOS_CLINICOS)


def test_metadatos_sin_las_reglas_nuevas_cargan_sin_aplicarlas(tmp_path, monkeypatch):
    # Es el caso del modelo instalado (0.1.0). Salvo CLASES_NUNCA_NOMBRADAS, que no
    # depende del modelo (decision de producto 2026-11-17).
    c = _cargar_sin_tflite(tmp_path, monkeypatch)
    assert (c.brillo_minimo, c.lado_minimo, c.umbral_alguna_senal) == (None, None, None)
    assert c.clases_no_fiables == clinico.CLASES_NUNCA_NOMBRADAS


def test_sin_clases_no_fiables_en_metadatos_nunca_se_nombran_linea_mees_ni_acropaquia(tmp_path, monkeypatch):
    # Modelo instalado 0.1.0: su metadatos.json no trae clases_no_fiables y antes
    # de la decision 2026-11-17 enviaba estas dos en clase, reporte y alternativas.
    salida = [probs("acropaquia", 0.95)]
    monkeypatch.setattr(clinico, "_interprete", lambda _ruta, _n: (lambda _x: salida[0], None))
    c = clinico.cargar(_carpeta(tmp_path), RUTA_TEXTOS_CLINICOS)

    assert clinico.clasificar(c, RECORTE, CALIDAD) == clinico.no_concluyente("clase_no_fiable")
    salida[0] = probs("linea_beau", 0.8, acropaquia=0.1, linea_mees=0.05, una_terry=0.02, onicolisis=0.01)
    r = clinico.clasificar(c, RECORTE, CALIDAD)
    assert (r.estado, r.clase) == ("ok", "linea_beau")
    assert [a.clase for a in r.alternativas] == ["una_terry", "onicolisis"]  # las 2 siguientes nombrables

    # Barrido con semilla fija: ninguna salida del modelo las saca en ningun campo.
    rng = np.random.default_rng(20261117)
    for _ in range(500):
        salida[0] = rng.dirichlet(np.full(len(ETIQUETAS), 0.3))
        r = clinico.clasificar(c, RECORTE, CALIDAD)
        nombradas = {r.clase, *(a.clase for a in r.alternativas)}
        assert nombradas.isdisjoint(clinico.CLASES_NUNCA_NOMBRADAS)
        assert r.reporte not in [TEXTOS[k] for k in clinico.CLASES_NUNCA_NOMBRADAS]


def test_metadatos_con_las_reglas_nuevas_las_cargan(tmp_path, monkeypatch):
    c = _cargar_sin_tflite(
        tmp_path, monkeypatch,
        calidad_minima={"brillo": 40, "lado_origen": 64},
        clases_no_fiables={"acropaquia": "precision_baja", "linea_mees": "pocas_fotos"},
        umbral_alguna_senal=0.855,
    )
    assert (c.brillo_minimo, c.lado_minimo, c.umbral_alguna_senal) == (40.0, 64, 0.855)
    assert c.clases_no_fiables == NO_FIABLES


def test_umbral_alguna_senal_null_no_rescata_nada(tmp_path, monkeypatch):
    assert _cargar_sin_tflite(tmp_path, monkeypatch, umbral_alguna_senal=None).umbral_alguna_senal is None


@pytest.mark.parametrize(
    "metadatos,motivo",
    [
        ({"calidad_minima": {"brillo": 40}}, "calidad_minima"),
        ({"calidad_minima": [40, 64]}, "calidad_minima"),
        ({"calidad_minima": {"brillo": 300, "lado_origen": 64}}, "calidad_minima.brillo"),
        ({"calidad_minima": {"brillo": True, "lado_origen": 64}}, "calidad_minima.brillo"),
        ({"calidad_minima": {"brillo": 40, "lado_origen": 64.5}}, "calidad_minima.lado_origen"),
        ({"calidad_minima": {"brillo": 40, "lado_origen": -1}}, "calidad_minima.lado_origen"),
        ({"clases_no_fiables": {"otra": "x"}}, "clases_no_fiables"),
        ({"clases_no_fiables": ["acropaquia"]}, "clases_no_fiables"),
        ({"clases_no_fiables": dict.fromkeys(["linea_beau", "linea_oscura", "acropaquia", "linea_mees", "onicolisis"], "x")},
         "menos de 3"),
        # Tres del metadatos mas las dos nunca nombradas: se cuenta la union.
        ({"clases_no_fiables": dict.fromkeys(["linea_beau", "linea_oscura", "onicolisis"], "x")}, "menos de 3"),
        ({"umbral_alguna_senal": 0.4}, ">= 0.5"),
        ({"umbral_alguna_senal": "0.9"}, "umbral_alguna_senal"),
        ({"umbral_alguna_senal": 1.5}, "umbral_alguna_senal"),
    ],
    ids=[
        "calidad_sin_lado", "calidad_lista", "brillo_fuera_de_rango", "brillo_bool", "lado_decimal", "lado_negativo",
        "no_fiable_otra", "no_fiables_lista", "no_fiables_dejan_dos_senales", "no_fiables_mas_nunca_nombradas_dejan_dos",
        "alguna_senal_bajo_un_medio", "alguna_senal_texto", "alguna_senal_fuera_de_rango",
    ],
)
def test_reglas_nuevas_mal_formadas_impiden_cargar(tmp_path, caplog, metadatos, motivo):
    with caplog.at_level(logging.WARNING, logger="app.vision.clinico"):
        assert clinico.cargar_opcional(_carpeta(tmp_path, **metadatos), RUTA_TEXTOS_CLINICOS) is None
    assert motivo in caplog.text


# --- textos clinicos ---------------------------------------------------------


def _plano(texto: str) -> str:
    """Minusculas y sin tildes, para buscar palabras sin depender de como se escribieron."""
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def _todo(clase: str) -> str:
    t = TEXTOS[clase]
    return _plano(" ".join([t.nombre, t.descripcion, *t.asociaciones, t.recomendacion]))


PROHIBIDAS = ["tienes", "padeces", "sufres", "melanoma", "cancer", "benigno", "benigna", "no es grave", "sana", "sano", "saludable"]
# Causas de una banda oscura que su texto no puede nombrar ni descartar (decision 8).
CAUSAS_LINEA_OSCURA = [
    "melan", "lunar", "nevus", "nevo", "hongo", "golpe", "trauma", "hematoma", "sangre", "etnic", "raza", "racial",
    "farmaco", "medicamento", "embarazo", "infecc", "maligno", "maligna", "benign", "tumor", "no es",
    "descart", "normal", "inofensiv", "tranquil", "preocup",
]


def test_el_archivo_trae_un_texto_por_cada_id_publico_y_ninguno_para_otra():
    assert set(TEXTOS) == {*CLASES_PUBLICAS, clinico.SENAL_INESPECIFICA}


def test_el_texto_de_senal_inespecifica_no_nombra_ni_insinua_ninguna_senal():
    texto = _todo(clinico.SENAL_INESPECIFICA)
    assert TEXTOS[clinico.SENAL_INESPECIFICA].asociaciones == []
    assert [k for k in CLASES_PUBLICAS if _plano(TEXTOS[k].nombre) in texto] == []
    # Palabras de los nombres de cada senal que bastarian para adivinarla.
    pistas = ["surco", "banda", "franja", "linea", "curvad", "ensanch", "separad", "despeg", "blanc", "mancha"]
    assert [p for p in pistas if p in texto] == []


@pytest.mark.parametrize("seccion", ["sin_seccion", "con_asociaciones"])
def test_textos_sin_reporte_generico_valido_impiden_cargar(tmp_path, seccion):
    texto = RUTA_TEXTOS_CLINICOS.read_text(encoding="utf-8")
    inicio = texto.index("\n[senal_inespecifica]")  # la tabla, no su mencion en la cabecera
    resto = "" if seccion == "sin_seccion" else texto[inicio:].replace("asociaciones = []", 'asociaciones = ["x"]')
    texto = texto[:inicio] + resto
    ruta = tmp_path / "textos.toml"
    ruta.write_text(texto, encoding="utf-8")
    with pytest.raises(clinico.ClasificadorNoDisponible, match="senal_inespecifica"):
        clinico.cargar_textos(ruta)


@pytest.mark.parametrize("asociacion", ['""', '"   "'], ids=["vacia", "solo_espacios"])
def test_una_asociacion_vacia_impide_cargar(tmp_path, asociacion):
    # Debe fallar al arrancar, no salir en pantalla como una vineta vacia.
    texto = RUTA_TEXTOS_CLINICOS.read_text(encoding="utf-8").replace("asociaciones = [\n", f"asociaciones = [\n  {asociacion},\n", 1)
    ruta = tmp_path / "textos.toml"
    ruta.write_text(texto, encoding="utf-8")
    with pytest.raises(clinico.ClasificadorNoDisponible, match="texto de linea_beau invalido"):
        clinico.cargar_textos(ruta)


def test_las_asociaciones_se_cargan_sin_espacios_sobrantes():
    reporte = ReporteClinico(nombre="n", descripcion="d", asociaciones=["  causa  "], recomendacion="r")
    assert reporte.asociaciones == ["causa"]


def test_una_alternativa_sin_nombre_no_se_construye():
    with pytest.raises(ValidationError):
        AlternativaClinica(clase="onicolisis", nombre="", confianza=0.1)


def test_el_archivo_nace_pendiente_de_revision_profesional():
    import tomllib

    datos = tomllib.loads(RUTA_TEXTOS_CLINICOS.read_text(encoding="utf-8"))
    assert datos["estado_revision"] == "pendiente"
    assert "PENDIENTE DE REVISION PROFESIONAL" in RUTA_TEXTOS_CLINICOS.read_text(encoding="utf-8")


@pytest.mark.parametrize("clase", [*CLASES_PUBLICAS, clinico.SENAL_INESPECIFICA])
def test_ningun_texto_usa_lenguaje_de_diagnostico(clase):
    texto = _todo(clase)
    usadas = [p for p in PROHIBIDAS if re.search(rf"\b{p}\b", texto)]
    assert usadas == []


@pytest.mark.parametrize("clase", [*CLASES_PUBLICAS, clinico.SENAL_INESPECIFICA])
def test_toda_recomendacion_nombra_a_un_profesional(clase):
    reco = _plano(TEXTOS[clase].recomendacion)
    assert any(p in reco for p in ("profesional", "dermatolog", "medic"))


def test_linea_oscura_recomienda_evaluacion_dermatologica_sin_nombrar_ni_descartar_causas():
    assert "dermatolog" in _plano(TEXTOS["linea_oscura"].recomendacion)
    texto = _todo("linea_oscura")
    assert [c for c in CAUSAS_LINEA_OSCURA if c in texto] == []


def test_sin_senales_no_trae_asociaciones():
    # Asociaciones de "nada" invitarian a leer una causa donde no se vio ninguna senal.
    assert TEXTOS["sin_senales"].asociaciones == []


# --- camino completo con un detector falso ----------------------------------

modelo_presente = RUTA_MODELO.is_file()
LADO_FOTO = 640


def _mano_tres_dedos() -> list[SimpleNamespace]:
    """21 puntos normalizados: indice, medio y anular estirados; pulgar y menique doblados."""
    pts = np.zeros((21, 2))
    pts[1], pts[2], pts[3], pts[4] = (-20, -15), (-30, -30), (-20, -50), (20, -60)  # pulgar hacia el menique
    dedos = {
        5: [(-30, -100), (-30, -150), (-30, -190), (-30, -225)],  # indice
        9: [(0, -105), (0, -155), (0, -195), (0, -230)],  # medio
        13: [(30, -100), (30, -150), (30, -190), (30, -225)],  # anular
        17: [(60, -80), (60, -110), (75, -95), (70, -80)],  # menique doblado
    }
    for i, puntos in dedos.items():
        pts[i : i + 4] = puntos
    px = pts * 2 + (LADO_FOTO / 2, 560)  # muneca abajo al centro, dedos hacia arriba
    return [SimpleNamespace(x=x / LADO_FOTO, y=y / LADO_FOTO) for x, y in px]


class DetectorFalso:
    def detect(self, _imagen):
        return SimpleNamespace(hand_landmarks=[_mano_tres_dedos()])


def _foto() -> bytes:
    ok, buf = cv2.imencode(".png", np.full((LADO_FOTO, LADO_FOTO, 3), 180, np.uint8))
    assert ok
    return buf.tobytes()


def _analizador(clasificador) -> AnalizadorUnas:
    a = AnalizadorUnas(RUTA_MODELO, None, clasificador)
    a._detector = DetectorFalso()
    return a


def _sin_clinico(resultado) -> list[dict]:
    return [u.model_dump(exclude={"clinico"}) for u in resultado.unas]


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_sin_modelo_las_unas_salen_con_su_forma_y_modelo_no_entrenado():
    r = _analizador(None).analizar(_foto())
    assert len(r.unas) == 3
    assert all(u.clinico == clinico.SIN_MODELO for u in r.unas)
    assert r.modelo_clinico is None
    assert "No es un diagnóstico médico" in r.aviso_clinico


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_falla_la_segunda_de_tres_unas_y_las_otras_siguen(caplog):
    llamadas = []

    def predecir(_x):
        llamadas.append(1)
        if len(llamadas) == 2:
            raise RuntimeError("fallo del interprete")
        return probs("linea_beau", 0.9)

    with caplog.at_level(logging.WARNING):
        con = _analizador(falso(predecir)).analizar(_foto())
    # El mensaje de la excepcion podria arrastrar valores de la salida: solo va su tipo.
    assert "RuntimeError" in caplog.text and "fallo del interprete" not in caplog.text
    sin = _analizador(None).analizar(_foto())
    assert [u.clinico.motivo for u in con.unas] == [None, "clasificacion_fallida", None]
    assert [u.clinico.estado for u in con.unas] == ["ok", "no_concluyente", "ok"]
    assert _sin_clinico(con) == _sin_clinico(sin)  # la forma no cambia por el bloque clinico
    assert con.modelo_clinico == Modelo(nombre="clasificador-falso", version="test")


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
@pytest.mark.parametrize("lado_minimo,estado", [(84, "ok"), (85, "no_concluyente")])
def test_la_calidad_de_cada_una_sale_de_su_recorte_y_de_su_zona(lado_minimo, estado):
    # En _mano_tres_dedos el tramo articulacion-punta mide 70 px: la zona, 70 * 1.2 = 84.
    r = _analizador(con_reglas(probs("linea_beau", 0.9), brillo_minimo=40.0, lado_minimo=lado_minimo)).analizar(_foto())
    assert {(u.calidad.lado_origen, round(u.calidad.brillo, 6)) for u in r.unas} == {(84, 180.0)}
    assert {u.clinico.estado for u in r.unas} == {estado}
    if estado == "no_concluyente":
        assert {u.clinico.motivo for u in r.unas} == {"foto_insuficiente"}


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_la_respuesta_http_lleva_el_bloque_y_los_logs_no_llevan_nada_clinico(caplog):
    with TestClient(app) as c:
        anterior = app.state.analizador
        app.state.analizador = _analizador(falso(probs("linea_oscura", 0.87349)))
        try:
            with caplog.at_level(logging.DEBUG):
                r = c.post("/vision/analizar", files={"foto": ("f.png", _foto(), "image/png")})
        finally:
            app.state.analizador = anterior
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["aviso_clinico"].startswith("Señal orientativa")
    assert cuerpo["modelo_clinico"] == {"nombre": "clasificador-falso", "version": "test"}
    assert {u["clinico"]["clase"] for u in cuerpo["unas"]} == {"linea_oscura"}
    assert "otra" not in {a["clase"] for u in cuerpo["unas"] for a in u["clinico"]["alternativas"]}
    registros = " ".join(r.getMessage() for r in caplog.records)
    reporte = TEXTOS["linea_oscura"]
    for prohibido in ["linea_oscura", reporte.nombre, reporte.recomendacion, "0.873", "0.87", "data:image"]:
        assert prohibido not in registros


# --- arranque ----------------------------------------------------------------


def test_salud_sin_modelo_clinico_informa_false(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "RUTA_CLINICO", tmp_path / "no_existe")
    with TestClient(app) as c:
        cuerpo = c.get("/salud").json()
    assert cuerpo["ok"] is True
    assert cuerpo["clasificador_clinico_cargado"] is False
    assert cuerpo["modelo_cargado"] is modelo_presente


def test_el_503_no_filtra_la_ruta_del_modelo(monkeypatch, tmp_path):
    ruta = tmp_path / "carpeta_secreta" / "hand_landmarker.task"
    monkeypatch.setattr(main, "RUTA_MODELO", ruta)
    with TestClient(app) as c:
        assert c.get("/salud").json()["clasificador_clinico_cargado"] is False
        r = c.post("/vision/analizar", files={"foto": ("f.png", _foto(), "image/png")})
    assert r.status_code == 503
    assert r.json()["codigo"] == "modelo_no_disponible"
    assert "carpeta_secreta" not in r.text and str(tmp_path) not in r.text


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_un_modelo_clinico_danado_no_impide_arrancar(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "RUTA_CLINICO", _carpeta(tmp_path))
    with TestClient(app) as c:
        cuerpo = c.get("/salud").json()
    assert (cuerpo["modelo_cargado"], cuerpo["clasificador_clinico_cargado"]) == (True, False)
