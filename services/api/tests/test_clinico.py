"""Pruebas del bloque clinico por una.

No hay modelo clinico entrenado ni fotos reales en el repo: la abstencion se
prueba con un clasificador falso que devuelve probabilidades fijas, y el
camino completo con un detector de manos falso sobre una imagen lisa. Nada de
esto mide si el modelo acierta; mide que el servicio decide, se abstiene y
degrada como dice design.md.
"""

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
from app.vision.esquemas import Clinico, Modelo
from app.vision.unas import AnalizadorUnas

TEXTOS = cargar_textos(RUTA_TEXTOS_CLINICOS)
# Mismo orden que escribiria etiquetas.json; "otra" en medio a proposito, para
# que ningun calculo dependa de que este al final.
ETIQUETAS = (
    "linea_beau", "linea_oscura", "acropaquia", "otra", "linea_mees",
    "sin_senales", "onicolisis", "una_terry", "mancha_blanca",
)
RECORTE = np.zeros((224, 224, 3), np.uint8)


def probs(principal: str, p: float, **otras: float) -> np.ndarray:
    """Vector de 9 probabilidades: `principal` con p, las nombradas con su valor y el resto a partes iguales."""
    v = dict.fromkeys(ETIQUETAS, 0.0)
    v[principal] = p
    v.update(otras)
    libres = [e for e in ETIQUETAS if e != principal and e not in otras]
    resto = max(1.0 - sum(v.values()), 0.0) / len(libres)
    return np.array([v[e] if e == principal or e in otras else resto for e in ETIQUETAS])


def falso(salida, umbral_nc: float | None = 0.70, umbral_ss: float | None = 0.90) -> ClasificadorClinico:
    """`salida`: vector fijo, o funcion (tensor -> vector) para simular fallos."""
    return ClasificadorClinico(
        predecir=salida if callable(salida) else (lambda _x: salida),
        etiquetas=ETIQUETAS,
        umbral_no_concluyente=umbral_nc,
        umbral_sin_senales=umbral_ss,
        textos=TEXTOS,
        modelo=Modelo(nombre="clasificador-falso", version="test"),
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
        {**NC, "confianza": 0.5},
        {**NC, "clase": "linea_beau"},
        {**NC, "alternativas": ALT},
        {**NC, "reporte": REPORTE},
        {**NC, "motivo": None},
    ],
    ids=[
        "ok_sin_reporte", "ok_con_motivo", "ok_una_alternativa", "ok_alternativas_desordenadas",
        "ok_alternativa_repite_clase", "ok_alternativas_repetidas", "ok_confianza_fuera_de_rango", "ok_clase_otra",
        "nc_con_confianza", "nc_con_clase", "nc_con_alternativas", "nc_con_reporte", "nc_sin_motivo",
    ],
)
def test_las_combinaciones_invalidas_no_se_pueden_construir(cambios):
    with pytest.raises(ValidationError):
        Clinico(**cambios)


# --- reglas de abstencion ----------------------------------------------------


def test_resultado_concluyente_trae_clase_redondeada_alternativas_y_reporte():
    # "otra" es la segunda mas probable: no puede colarse en las alternativas.
    c = clinico.clasificar(falso(probs("linea_beau", 0.87349, otra=0.06, linea_mees=0.03, una_terry=0.0201)), RECORTE)
    assert (c.estado, c.motivo, c.clase, c.confianza) == ("ok", None, "linea_beau", 0.873)
    assert [(a.clase, a.confianza) for a in c.alternativas] == [("linea_mees", 0.03), ("una_terry", 0.02)]
    assert [a.nombre for a in c.alternativas] == [TEXTOS["linea_mees"].nombre, TEXTOS["una_terry"].nombre]
    assert c.reporte == TEXTOS["linea_beau"]


def test_alternativas_empatadas_salen_en_el_orden_de_las_etiquetas():
    # Todas las demas a partes iguales: el resultado no puede variar entre ejecuciones.
    c = clinico.clasificar(falso(probs("una_terry", 0.92)), RECORTE)
    assert [a.clase for a in c.alternativas] == ["linea_beau", "linea_oscura"]


def test_sin_senales_nunca_se_ofrece_como_alternativa_de_una_senal():
    # QA 2026-11-12: con linea_oscura al 0.80 y sin_senales segunda, la UI decia
    # "podria ser: Sin senales reconocidas", lo contrario de la recomendacion.
    c = clinico.clasificar(falso(probs("linea_oscura", 0.80, sin_senales=0.12, onicolisis=0.03, linea_mees=0.02)), RECORTE)
    assert c.estado == "ok"
    assert [a.clase for a in c.alternativas] == ["onicolisis", "linea_mees"]


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
    c = clinico.clasificar(falso(salida, umbral_nc, umbral_ss), RECORTE)
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
    )
    c = clinico.clasificar(clasificador, RECORTE)
    assert c.motivo == caso["motivo"]
    assert c.estado == ("ok" if caso["motivo"] is None else "no_concluyente")


@pytest.mark.parametrize("clase,p", [("linea_oscura", 0.70), ("sin_senales", 0.90), ("sin_senales", 0.95)])
def test_en_el_umbral_o_encima_se_acepta(clase, p):
    # >=, igual que entrenamiento.metricas.evaluar_umbral: el umbral calibrado se acepta.
    c = clinico.clasificar(falso(probs(clase, p)), RECORTE)
    assert (c.estado, c.clase) == ("ok", clase)


def test_sin_clasificador_es_modelo_no_entrenado():
    assert clinico.clasificar(None, RECORTE) == clinico.no_concluyente("modelo_no_entrenado")


def _explota(_x):
    raise RuntimeError("fallo del interprete")


@pytest.mark.parametrize(
    "salida",
    [_explota, lambda _x: np.full(9, np.nan), lambda _x: np.ones(5) / 5],
    ids=["excepcion", "nan", "forma_distinta"],
)
def test_un_fallo_al_clasificar_es_clasificacion_fallida(salida):
    assert clinico.clasificar(falso(salida), RECORTE) == clinico.no_concluyente("clasificacion_fallida")


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


def test_etiquetas_con_valores_que_no_son_texto_no_impiden_cargar(tmp_path):
    carpeta = _carpeta(tmp_path)
    (carpeta / "etiquetas.json").write_text(json.dumps({str(i): [e] for i, e in enumerate(ETIQUETAS)}))
    assert clinico.cargar_opcional(carpeta, RUTA_TEXTOS_CLINICOS) is None


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
    assert set(TEXTOS) == set(CLASES_PUBLICAS)


def test_el_archivo_nace_pendiente_de_revision_profesional():
    import tomllib

    datos = tomllib.loads(RUTA_TEXTOS_CLINICOS.read_text(encoding="utf-8"))
    assert datos["estado_revision"] == "pendiente"
    assert "PENDIENTE DE REVISION PROFESIONAL" in RUTA_TEXTOS_CLINICOS.read_text(encoding="utf-8")


@pytest.mark.parametrize("clase", CLASES_PUBLICAS)
def test_ningun_texto_usa_lenguaje_de_diagnostico(clase):
    texto = _todo(clase)
    usadas = [p for p in PROHIBIDAS if re.search(rf"\b{p}\b", texto)]
    assert usadas == []


@pytest.mark.parametrize("clase", CLASES_PUBLICAS)
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
