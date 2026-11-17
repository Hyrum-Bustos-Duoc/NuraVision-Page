import json
from pathlib import Path

import numpy as np
import pytest

from entrenamiento import metricas
from entrenamiento.config import CLASES_CLINICAS
from entrenamiento.reporte import tabla_markdown

CLASES = ["a", "b"]


def test_metricas_macro_por_clase_y_matriz():
    m = metricas.metricas([0, 0, 1, 1], [0, 1, 1, 1], CLASES)
    assert m["accuracy"] == 0.75
    assert m["por_clase"]["a"] == {"precision": 1.0, "recall": 0.5, "f1": pytest.approx(2 / 3), "soporte": 2}
    assert m["por_clase"]["b"]["precision"] == pytest.approx(2 / 3)
    assert m["recall_macro"] == 0.75
    assert m["matriz_confusion"] == [[1, 1], [0, 2]]


def test_metricas_clase_nunca_predicha_vale_cero_sin_error():
    m = metricas.metricas([0, 1, 2], [0, 0, 0], ["a", "b", "c"])
    assert m["por_clase"]["b"] == {"precision": 0.0, "recall": 0.0, "f1": 0.0, "soporte": 1}
    assert len(m["matriz_confusion"]) == 3


# confianzas 0.9 (acierta), 0.8 (acierta), 0.6 (falla), 0.55 (acierta)
PROBS = np.array([[0.9, 0.1], [0.2, 0.8], [0.6, 0.4], [0.45, 0.55]])
Y = [0, 1, 1, 1]


def test_umbral_es_el_menor_que_cumple_la_precision():
    # >=0.55 acierta 3/4, >=0.6 acierta 2/3, >=0.8 acierta 2/2
    assert metricas.calibrar_umbral(PROBS, Y, 0.9) == 0.8
    assert metricas.calibrar_umbral(PROBS, Y, 0.75) == 0.55


def test_umbral_inalcanzable_es_none_y_todo_no_concluyente():
    assert metricas.calibrar_umbral(PROBS, [1, 0, 1, 0], 0.9) is None
    assert metricas.evaluar_umbral(PROBS, Y, None) == {
        "umbral": None, "cobertura": 0.0, "n_aceptadas": 0, "precision_aceptadas": None
    }


def test_empates_de_confianza_se_aceptan_juntos():
    probs = np.array([[0.7, 0.3], [0.7, 0.3]])
    # Uno acierta y otro no con la misma confianza: no se puede aceptar solo uno.
    assert metricas.calibrar_umbral(probs, [0, 1], 0.9) is None


def test_evaluar_umbral_en_test():
    r = metricas.evaluar_umbral(PROBS, Y, 0.6)
    assert r == {"umbral": 0.6, "cobertura": 0.75, "n_aceptadas": 3, "precision_aceptadas": pytest.approx(2 / 3)}


def test_evaluar_umbral_sin_aceptadas():
    assert metricas.evaluar_umbral(PROBS, Y, 0.95)["precision_aceptadas"] is None


def test_por_subgrupo():
    archivos = ["a/1.jpg", "a/2.jpg", "b/3.jpg"]
    subgrupos = {"a/1.jpg": {"tono_piel": "monk_2"}, "b/3.jpg": {"tono_piel": "monk_9"}}
    r = metricas.por_subgrupo(archivos, [0, 0, 1], [0, 1, 0], subgrupos)
    assert r == {"tono_piel": {
        "monk_2": {"n": 1, "accuracy": 1.0},
        "monk_9": {"n": 1, "accuracy": 0.0},
        "sin_anotar": {"n": 1, "accuracy": 0.0},
    }}
    assert metricas.por_subgrupo(archivos, [0, 0, 1], [0, 1, 0], {}) == {}


def test_ganador_se_elige_por_validacion_no_por_test():
    a = {"arquitectura": "A", "parametros": 10, "val": {"f1_macro": 0.8}, "test": {"f1_macro": 0.95}}
    b = {"arquitectura": "B", "parametros": 10, "val": {"f1_macro": 0.9}, "test": {"f1_macro": 0.70}}
    assert metricas.elegir_ganador([a, b])["arquitectura"] == "B"


def test_empate_en_validacion_gana_el_mas_liviano():
    a = {"arquitectura": "A", "parametros": 5, "val": {"f1_macro": 0.9}}
    b = {"arquitectura": "B", "parametros": 9, "val": {"f1_macro": 0.9}}
    assert metricas.elegir_ganador([b, a])["arquitectura"] == "A"


def test_tabla_markdown():
    m = metricas.metricas([0, 1], [0, 1], CLASES)
    resultado = {
        "arquitectura": "EfficientNetB0", "parametros": 4_000_000, "tamano_mb": 16.2, "latencia_ms": 7.3,
        "val": m, "test": m,
        "umbral": {"test": metricas.evaluar_umbral(np.array([[0.6, 0.4]]), [0], None)},
        "subgrupos_test": {"luz": {"natural": {"n": 2, "accuracy": 1.0}}},
    }
    md = tabla_markdown({
        "tarea": "forma", "fecha": "2026-10-27",
        "particion": {"huella": "abcdef0123456789", "semilla": 1, "clases": CLASES, "conteos": {}},
        "rechazadas": {}, "entorno": {"dispositivo": "GPU"}, "precision_objetivo": 0.9,
        "ganador": "EfficientNetB0", "resultados": [resultado],
    })
    assert "| EfficientNetB0 | 4,000,000 | 16.2 | 7.3 | 100.0% |" in md
    assert "| ninguno | 0.0% | - |" in md
    assert "| a | 1 | 0 |" in md
    assert "natural 100.0% (n=2)" in md
    assert "No es un diagnostico medico" in md


# --- estado_clinico ------------------------------------------------------------

CASOS = json.loads((Path(__file__).parent / "casos_abstencion.json").read_text())
C9 = list(CLASES_CLINICAS)
SS, OSCURA, ACRO, BEAU, OTRA = (C9.index(c) for c in ("sin_senales", "linea_oscura", "acropaquia", "linea_beau", "otra"))


def _fila(clase: int, p: float) -> list[float]:
    resto = (1 - p) / 8
    return [p if i == clase else resto for i in range(9)]


@pytest.mark.parametrize("caso", CASOS["casos"], ids=lambda c: c["caso"])
def test_tabla_de_abstencion_compartida_con_el_servicio(caso):
    assert CASOS["clases"] == C9
    motivo = metricas.motivo_abstencion(
        np.array(caso["probs"]), C9, caso["umbral_no_concluyente"], caso["umbral_sin_senales"]
    )
    assert motivo == caso["motivo"]


def test_umbral_sin_senales_igual_al_general_sin_falsos():
    probs = np.array([_fila(SS, 0.8), _fila(BEAU, 0.9), _fila(SS, 0.75)])
    assert metricas.calibrar_umbral_sin_senales(probs, [SS, BEAU, SS], C9, 0.70) == 0.70


def test_umbral_sin_senales_sobre_el_falso_mas_confiado():
    # linea_oscura predicha sin_senales con 0,93; aciertos sin_senales en 0,80, 0,96 y 0,98.
    probs = np.array([_fila(SS, 0.93), _fila(SS, 0.80), _fila(SS, 0.96), _fila(SS, 0.98)])
    assert metricas.calibrar_umbral_sin_senales(probs, [OSCURA, SS, SS, SS], C9, 0.70) == pytest.approx(0.96)


def test_umbral_sin_senales_nunca_menor_que_el_general():
    probs = np.array([_fila(SS, 0.50), _fila(SS, 0.60)])
    # El unico falso (otra, 0,50) queda bajo el general: manda el general.
    assert metricas.calibrar_umbral_sin_senales(probs, [OTRA, SS], C9, 0.70) == 0.70


def test_umbral_sin_senales_imposible_es_none():
    probs = np.array([_fila(SS, 0.97), _fila(SS, 0.90)])
    assert metricas.calibrar_umbral_sin_senales(probs, [OSCURA, SS], C9, 0.70) is None
    assert metricas.calibrar_umbral_sin_senales(probs, [SS, SS], C9, None) is None


def test_wilson():
    assert metricas.wilson(0, 0) is None
    bajo, alto = metricas.wilson(0, 9)
    assert bajo == 0.0 and alto == pytest.approx(0.299, abs=1e-3)  # design.md: M1 = 0 con 9 fotos, hasta ~30 %
    bajo, alto = metricas.wilson(8, 10)
    assert (bajo, alto) == (pytest.approx(0.490, abs=1e-3), pytest.approx(0.943, abs=1e-3))


def _evaluacion(test_filas, y_test, umbral=0.70):
    val = np.array([_fila(SS, 0.95), _fila(BEAU, 0.9)])
    return metricas.evaluacion_clinica(val, [SS, BEAU], np.array(test_filas), y_test, C9, umbral)


def test_evaluacion_clinica_por_clase_suma_n_y_m1_no_cumple():
    filas = [_fila(SS, 0.97), _fila(ACRO, 0.9), _fila(ACRO, 0.5), _fila(BEAU, 0.9), _fila(OTRA, 0.99)]
    y = [ACRO, ACRO, ACRO, OSCURA, OTRA]
    e = _evaluacion(filas, y)
    assert e["umbral_sin_senales"] == 0.70
    acro = e["por_clase"]["acropaquia"]
    assert (acro["n"], acro["aceptadas_correctas"], acro["abstenidas"], acro["aceptadas_otra_clase"],
            acro["aceptadas_sin_senales"]) == (3, 1, 1, 0, 1)
    assert e["por_clase"]["linea_oscura"]["aceptadas_otra_clase"] == 1
    assert e["por_clase"]["otra"]["abstenidas"] == 1
    for m in e["por_clase"].values():
        assert m["aceptadas_correctas"] + m["abstenidas"] + m["aceptadas_otra_clase"] + m["aceptadas_sin_senales"] == m["n"]
    a = e["aceptacion"]
    assert a["M1"] == {"valor": 1, "limite": 0, "tipo": "max", "cumple": False}
    assert a["M2"]["valor"] == 1 and a["M2"]["cumple"]
    assert a["M3"]["valor"] == pytest.approx(1 / 3) and not a["M3"]["cumple"]
    assert a["M4"]["valor"] == pytest.approx(3 / 5) and a["M4"]["cumple"]


def test_evaluacion_clinica_sin_umbral_no_acepta_nada():
    e = _evaluacion([_fila(BEAU, 0.99)], [BEAU], umbral=None)
    assert e["umbral_sin_senales"] is None
    assert e["aceptacion"]["M3"] == {"valor": None, "limite": 0.90, "tipo": "min", "cumple": False}
    assert e["aceptacion"]["M4"]["valor"] == 0.0


def test_comparativa_markdown_con_veredicto_m1():
    e = _evaluacion([_fila(SS, 0.97)], [ACRO])
    m = metricas.metricas([ACRO], [SS], C9)
    resultado = {
        "arquitectura": "MobileNetV3Small", "parametros": 1, "tamano_mb": 1.0, "latencia_ms": 1.0,
        "val": m, "test": m, "umbral": {"test": metricas.evaluar_umbral(np.array([_fila(SS, 0.97)]), [ACRO], 0.7)},
        "subgrupos_test": {}, "clinico": e,
    }
    md = tabla_markdown({
        "tarea": "estado_clinico", "fecha": "2026-11-12",
        "particion": {"huella": "abcdef0123456789", "semilla": 1, "clases": C9, "conteos": {}},
        "rechazadas": {}, "entorno": {}, "precision_objetivo": 0.9,
        "ganador": "MobileNetV3Small", "resultados": [resultado],
    })
    assert "| M1 | 1 | <= 0 | no cumple |" in md
    assert "| acropaquia | 1 | 0 | 0 | 0 | 1 | 0.0% |" in md
    assert "Umbral sin_senales (calibrado en val): 0.700" in md
    assert "Senal orientativa para consultar con un profesional" in md
