"""Regla de seleccion de la busqueda. Necesita TensorFlow (el modulo lo importa)."""

import pytest

pytest.importorskip("tensorflow")
from entrenamiento.busqueda_clinica import _elegir_variante, elegir_aumento, ganadora  # noqa: E402


def corrida(etapa, f1, ll=1.0):
    return {"etapa": etapa, "f1_macro": f1, "log_loss": ll}


def test_fine_tuning_que_gana_por_ruido_no_se_elige():
    # Caso real del 2026-11-17: 0.6653 frente a 0.6651.
    c = [corrida("2-cabeza", 0.6651, 1.0577), corrida("3-fine-tuning", 0.6653, 1.0576)]
    assert ganadora(c, 0.01)["etapa"] == "2-cabeza"


def test_fine_tuning_que_supera_el_margen_se_elige():
    c = [corrida("2-cabeza", 0.60), corrida("3-fine-tuning", 0.65)]
    assert ganadora(c, 0.01)["etapa"] == "3-fine-tuning"


def test_empate_en_f1_lo_rompe_la_log_loss():
    c = [corrida("1-arquitectura", 0.6, 1.2), corrida("2-cabeza", 0.6, 1.1)]
    assert ganadora(c, 0.01)["log_loss"] == 1.1


def test_variante_mas_chica_que_no_degrada():
    f = {"int8_dinamica": {"delta_f1": 0.03, "coincidencia_argmax": 0.9, "max_abs_dif": 0.1},
         "float16": {"delta_f1": 0.0, "coincidencia_argmax": 0.995, "max_abs_dif": 0.01},
         "float32": {"delta_f1": 0.0, "coincidencia_argmax": 1.0, "max_abs_dif": 0.0}}
    assert _elegir_variante(f, 0.01, 0.05) == "float16"
    f["float16"]["coincidencia_argmax"] = 0.98
    assert _elegir_variante(f, 0.01, 0.05) == "float32"


def test_cuantizada_que_conserva_el_argmax_pero_deforma_la_probabilidad_se_rechaza():
    # Caso real del 2026-11-17 (int8 sobre train+val).
    f = {"int8_dinamica": {"delta_f1": 0.004, "coincidencia_argmax": 0.996, "max_abs_dif": 0.685},
         "float16": {"delta_f1": 0.0, "coincidencia_argmax": 1.0, "max_abs_dif": 0.012},
         "float32": {"delta_f1": 0.0, "coincidencia_argmax": 1.0, "max_abs_dif": 0.0}}
    assert _elegir_variante(f, 0.01, 0.05) == "float16"


def _rob(aumento, f1, cobertura, peor=0.9):
    return {"aumento": aumento, "limpia": {"f1_macro": f1}, "mezcla": {"cobertura_mezcla": cobertura},
            "peor_precision": peor}


def test_aumento_elegido_por_cobertura_en_fotos_degradadas_dentro_del_margen():
    r = [_rob("ninguno", 0.665, 0.14), _rob("geometrico", 0.645, 0.30), _rob("degradacion", 0.660, 0.24)]
    # geometrico cubre mas pero pierde 0,02 de F1 limpia: fuera del margen.
    assert elegir_aumento(r, 0.01, 0.85) == "degradacion"


def test_aumento_empatado_en_cobertura_gana_el_mas_simple():
    r = [_rob("ninguno", 0.66, 0.2), _rob("degradacion", 0.665, 0.2)]
    assert elegir_aumento(r, 0.01, 0.85) == "ninguno"


def test_aumento_que_inventa_en_alguna_degradacion_no_se_elige():
    # Caso de la CV del 2026-11-17 (medias de 3 sorteos).
    r = [_rob("ninguno", 0.665, 0.150, 0.750), _rob("geometrico", 0.657, 0.213, 0.785),
         _rob("degradacion", 0.643, 0.218, 0.865)]
    assert elegir_aumento(r, 0.01, 0.85) == "degradacion"


def test_si_ninguno_es_seguro_gana_el_menos_inseguro():
    r = [_rob("ninguno", 0.665, 0.150, 0.70), _rob("geometrico", 0.657, 0.213, 0.80)]
    assert elegir_aumento(r, 0.01, 0.85) == "geometrico"
