import copy

import pytest

from entrenamiento.config import CLASES_CLINICAS, RAIZ_REPO, _validar, cargar_config, exigir_fuera_del_repo, lado_minimo, tarea


@pytest.fixture
def cfg():
    return cargar_config()


def test_config_por_defecto_carga_las_tres_tareas(cfg):
    # Unico test existente que cambia con estado_clinico: cuenta las tareas.
    assert sorted(cfg["tareas"]) == ["estado", "estado_clinico", "forma"]
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


# --- guarda clinica por tarea -------------------------------------------------

@pytest.mark.parametrize("tarea_estetica", ["forma", "estado"])
@pytest.mark.parametrize("clase", CLASES_CLINICAS)
def test_ids_clinicos_rechazados_en_tareas_esteticas(cfg, tarea_estetica, clase):
    # linea_beau, una_terry, mancha_blanca... no contienen ningun TERMINO_CLINICO.
    malo = copy.deepcopy(cfg)
    malo["tareas"][tarea_estetica]["clases"].append(clase)
    with pytest.raises(ValueError, match=f"tarea {tarea_estetica}: clases clinicas.*{clase}"):
        _validar(malo)


@pytest.mark.parametrize("tarea_estetica", ["forma", "estado"])
@pytest.mark.parametrize("clase", [
    # variantes de los ids clinicos
    "Mancha_Blanca", "mancha blanca", "linea_oscura ", "Línea-Oscura", "Una Terry",
    # carpetas de Nail.zip tal cual
    "white spot", "black line", "beau_s line", "terry_s nail", "mees_ line",
    "clubbing", "onycholysis", "normal", "other",
    # sinonimos de linea_oscura y terminos con acento
    "melanoniquia", "Melanonychia", "infección",
])
def test_variantes_y_equivalentes_clinicos_rechazados(cfg, tarea_estetica, clase):
    malo = copy.deepcopy(cfg)
    malo["tareas"][tarea_estetica]["clases"].append(clase)
    with pytest.raises(ValueError, match=f"tarea {tarea_estetica}: clases clinicas"):
        _validar(malo)


@pytest.mark.parametrize("tarea_estetica", ["forma", "estado"])
def test_clases_esteticas_legitimas_siguen_aceptandose(cfg, tarea_estetica):
    # Cada clase por separado, para que un falso positivo nombre a su culpable.
    for clase in tarea(cfg, tarea_estetica)["clases"]:
        ok = copy.deepcopy(cfg)
        ok["tareas"][tarea_estetica]["clases"] = [clase, "otra_estetica_x"]
        ok["tareas"][tarea_estetica]["revision_profesional"] = []
        _validar(ok)


def test_estado_clinico_tiene_las_9_clases_y_revision_en_las_7_senales(cfg):
    t = tarea(cfg, "estado_clinico")
    assert set(t["clases"]) == set(CLASES_CLINICAS) and len(t["clases"]) == 9
    assert set(t["revision_profesional"]) == set(CLASES_CLINICAS) - {"sin_senales", "otra"}


def test_estado_clinico_no_admite_una_clase_extra(cfg):
    malo = copy.deepcopy(cfg)
    malo["tareas"]["estado_clinico"]["clases"].append("melanoma")
    with pytest.raises(ValueError, match="exactamente"):
        _validar(malo)


def test_estado_clinico_no_admite_quitar_una_clase(cfg):
    malo = copy.deepcopy(cfg)
    malo["tareas"]["estado_clinico"]["clases"].remove("otra")
    with pytest.raises(ValueError, match="exactamente"):
        _validar(malo)


def test_otra_tarea_con_las_clases_clinicas_se_rechaza(cfg):
    malo = copy.deepcopy(cfg)
    malo["tareas"]["clinica2"] = copy.deepcopy(malo["tareas"]["estado_clinico"])
    with pytest.raises(ValueError, match="tarea clinica2: clases clinicas"):
        _validar(malo)


# --- lado minimo por tarea ----------------------------------------------------

def test_lado_minimo_por_tarea_y_global(cfg):
    assert lado_minimo(cfg, "estado_clinico") == 64
    assert lado_minimo(cfg, "forma") == lado_minimo(cfg, "estado") == 224


def test_lado_minimo_invalido(cfg):
    malo = copy.deepcopy(cfg)
    malo["tareas"]["forma"]["lado_minimo"] = 0
    with pytest.raises(ValueError, match="lado_minimo"):
        _validar(malo)


def test_exigir_fuera_del_repo(tmp_path):
    exigir_fuera_del_repo(tmp_path / "salida", "la salida")
    with pytest.raises(ValueError, match="fuera del repositorio"):
        exigir_fuera_del_repo(RAIZ_REPO / "services" / "vision" / "x", "la salida")
