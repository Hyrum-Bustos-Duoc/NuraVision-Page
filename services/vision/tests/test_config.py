import copy

import pytest

from entrenamiento.config import _validar, cargar_config, tarea


@pytest.fixture
def cfg():
    return cargar_config()


def test_config_por_defecto_carga_ambas_tareas(cfg):
    assert tarea(cfg, "forma")["clases"] == ["almendra", "cuadrada", "ovalada", "redonda", "stiletto"]
    assert "quebradiza_o_descamada" in tarea(cfg, "estado")["revision_profesional"]


@pytest.mark.parametrize("clase", ["hongos", "Onicomicosis", "posible_melanoma", "psoriasis_ungueal"])
def test_rechaza_clases_clinicas(cfg, clase):
    malo = copy.deepcopy(cfg)
    malo["tareas"]["estado"]["clases"].append(clase)
    with pytest.raises(ValueError, match="clinicas"):
        _validar(malo)


def test_rechaza_arquitectura_sin_preprocesado_interno(cfg):
    malo = copy.deepcopy(cfg)
    malo["entrenamiento"]["arquitecturas"] = ["MobileNetV2"]
    with pytest.raises(ValueError, match="no soportadas"):
        _validar(malo)


@pytest.mark.parametrize("val,test", [(0.5, 0.5), (0, 0.2), (0.2, -0.1)])
def test_rechaza_fracciones_invalidas(cfg, val, test):
    malo = copy.deepcopy(cfg)
    malo["particion"] = {"val": val, "test": test}
    with pytest.raises(ValueError, match="particion"):
        _validar(malo)


def test_rechaza_revision_profesional_de_clase_inexistente(cfg):
    malo = copy.deepcopy(cfg)
    malo["tareas"]["forma"]["revision_profesional"] = ["triangular"]
    with pytest.raises(ValueError, match="inexistentes"):
        _validar(malo)


def test_rechaza_clases_repetidas(cfg):
    malo = copy.deepcopy(cfg)
    malo["tareas"]["forma"]["clases"] = ["almendra", "almendra"]
    with pytest.raises(ValueError, match="sin repetir"):
        _validar(malo)


def test_tarea_desconocida(cfg):
    with pytest.raises(ValueError, match="desconocida"):
        tarea(cfg, "color")
