"""Regla de seleccion de la busqueda. Necesita TensorFlow (el modulo lo importa)."""

import pytest

pytest.importorskip("tensorflow")
from entrenamiento.busqueda_clinica import _elegir_variante, ganadora  # noqa: E402


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
