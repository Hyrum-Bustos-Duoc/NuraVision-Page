import numpy as np
import pytest

from entrenamiento import metricas
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
