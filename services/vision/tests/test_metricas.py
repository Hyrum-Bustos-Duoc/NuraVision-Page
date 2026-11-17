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


# --- calibracion -----------------------------------------------------------------

def test_temperatura_no_cambia_el_argmax_y_se_deshace():
    p = np.array([[0.7, 0.2, 0.1], [0.1, 0.3, 0.6]])
    t = metricas.con_temperatura(p, 2.5)
    assert (t.argmax(1) == p.argmax(1)).all() and np.allclose(t.sum(1), 1)
    assert t.max() < p.max()  # t > 1 baja la confianza
    assert np.allclose(metricas.con_temperatura(t, 1 / 2.5), p)


def test_ajustar_temperatura_recupera_la_de_un_modelo_sobreconfiado():
    # Probabilidades reales = softmax(z); el "modelo" informa softmax(3z).
    rng = np.random.default_rng(0)
    z = rng.normal(0, 1.5, (4000, 4))
    reales = metricas.con_temperatura(np.exp(z) / np.exp(z).sum(1, keepdims=True), 1.0)
    y = np.array([rng.choice(4, p=p) for p in reales])
    informadas = metricas.con_temperatura(reales, 1 / 3)
    assert metricas.ajustar_temperatura(informadas, y) == pytest.approx(3, rel=0.15)


def test_ece_cero_si_la_confianza_coincide_con_el_acierto_y_alto_si_no():
    # 4 fotos con confianza 0.75 y 3 aciertos: calibrado perfecto.
    p = np.array([[0.75, 0.25]] * 4)
    assert metricas.ece(p, [0, 0, 0, 1])["ece"] == pytest.approx(0)
    malo = metricas.ece(np.array([[0.99, 0.01]] * 2), [1, 1])
    assert malo["ece"] == pytest.approx(0.99) and malo["fiabilidad"][0]["n"] == 2


# --- robustez: mezcla limpia + degradadas ----------------------------------------

MEES = C9.index("linea_mees")


def test_calibrar_mezcla_excluye_las_copias_oscuras_y_mide_por_conjunto():
    y = [BEAU, BEAU]
    probs = {"limpia": np.array([_fila(BEAU, 0.9), _fila(BEAU, 0.8)]),
             # La copia oscura falla con mucha confianza: si contara, el umbral subiria.
             "muy_oscura": np.array([_fila(OSCURA, 0.99), _fila(OSCURA, 0.99)])}
    brillo = {"limpia": np.array([120, 120]), "muy_oscura": np.array([20, 20])}
    m = metricas.calibrar_mezcla(probs, brillo, y, C9, 0.9, brillo_minimo=40)
    assert m["por_conjunto"]["muy_oscura"] == {"apta": 0.0, "cobertura": 0.0, "precision_aceptadas": None,
                                              "f1_macro": pytest.approx(0.0)}
    assert m["por_conjunto"]["limpia"]["cobertura"] == 1.0 and m["precision_mezcla"] == 1.0
    raw, yy = metricas.mezcla_apta(probs, brillo, y, 40)
    assert raw.shape == (2, 9) and list(yy) == y
    # Sin compuerta, las copias oscuras entran y ningun umbral alcanza 0,9 sobre la mezcla:
    # bajo el umbral solo quedan fallos confiados.
    sin = metricas.calibrar_mezcla(probs, brillo, y, C9, 0.9, brillo_minimo=0)
    assert sin["umbral"] is None and sin["cobertura_mezcla"] == 0.0


def test_umbral_alguna_senal_cuenta_otra_como_negativa():
    # Senales distintas con p(senal) alta, y una 'otra' cuya masa se reparte entre senales.
    probs = np.array([_fila(BEAU, 0.95), _fila(OSCURA, 0.9), _fila(MEES, 0.6), _fila(SS, 0.9)])
    y = [BEAU, ACRO, OTRA, SS]  # la segunda es otra senal: igual cuenta como "alguna senal"
    p_senal = probs[:, [i for i, c in enumerate(C9) if c not in ("sin_senales", "otra")]].sum(1)
    u = metricas.calibrar_umbral_senal(probs, y, C9, 0.95)
    assert u == pytest.approx(p_senal[1])  # la de 'otra' (0,6 + resto) queda debajo
    assert metricas.calibrar_umbral_senal(probs, [OTRA, OTRA, OTRA, SS], C9, 0.95) is None


def test_umbral_alguna_senal_nunca_menor_que_un_medio():
    probs = np.array([_fila(SS, 0.6)])  # p(senal) = 7 * 0,05 = 0,35
    assert metricas.calibrar_umbral_senal(probs, [BEAU], C9, 0.5) is None


def test_clases_no_fiables_por_pocas_fotos_sin_aceptadas_y_precision_baja():
    filas, y = [], []
    filas += [_fila(BEAU, 0.95)] * 25; y += [BEAU] * 25           # fiable: 25/25
    filas += [_fila(ACRO, 0.95)] * 25; y += [OSCURA] * 25         # acropaquia aceptada y siempre errada
    filas += [_fila(ACRO, 0.95)] * 5; y += [ACRO] * 5
    filas += [_fila(ACRO, 0.5)] * 20; y += [ACRO] * 20            # 25 de acropaquia, solo 5 aceptadas bien
    filas += [_fila(MEES, 0.95)] * 10; y += [MEES] * 10           # 10 fotos: pocas
    filas += [_fila(SS, 0.5)] * 25; y += [SS] * 25                # nunca aceptada
    r = metricas.clases_no_fiables(np.array(filas), y, C9, 0.7, 0.7, minimo_fotos=20, precision_objetivo=0.9)
    assert r["acropaquia"] == "precision_baja"
    assert r["linea_mees"] == "pocas_fotos"
    assert r["sin_senales"] == "sin_aceptadas"
    assert "linea_beau" not in r and "otra" not in r
    # linea_oscura tiene 25 fotos pero ninguna aceptada como linea_oscura.
    assert r["linea_oscura"] == "sin_aceptadas"
