import copy
import json
from pathlib import Path

import pytest

from conftest import foto
from entrenamiento import datos, externo
from entrenamiento.config import RUTA_POR_DEFECTO, _validar, cargar_config

KAGGLE = Path(__file__).resolve().parent.parent / "datasets" / "kaggle_nail"


@pytest.fixture
def ficha():
    return {
        "uso": "solo_particion",
        "dataset": "prueba",
        "semilla": 7,
        "lado_minimo": 1,
        "clases": ["normal", "onycholysis"],
        "particion": {"val": 0.15, "test": 0.15},
    }


@pytest.fixture
def externo_dir(tmp_path) -> Path:
    """10 fotos por clase; las pares miden 300 de lado menor, las impares 40."""
    for ci, clase in enumerate(["normal", "onycholysis"]):
        for i in range(10):
            lado = 300 if i % 2 == 0 else 40
            foto(tmp_path / clase / f"{i:02d}.jpg", (ci * 120, i * 20, 50), tamano=(lado, lado + 10))
    return tmp_path


# --- separacion entre la via temporal y el producto ---------------------------

def test_ficha_kaggle_carga_y_es_solo_particion():
    f = externo.cargar_ficha(KAGGLE / "particion.toml")
    assert f["uso"] == "solo_particion" and "onycholysis" in f["clases"]


def test_config_del_producto_rechaza_una_ficha_externa():
    with pytest.raises(ValueError, match="solo particion"):
        cargar_config(KAGGLE / "particion.toml")


def test_ficha_externa_rechaza_la_config_del_producto():
    with pytest.raises(ValueError, match="no es una ficha"):
        externo.cargar_ficha(RUTA_POR_DEFECTO)


@pytest.mark.parametrize("clase", ["onycholysis", "clubbing", "nail_fungus", "Onychomycosis"])
def test_guarda_clinica_cubre_nombres_en_ingles(clase):
    malo = copy.deepcopy(cargar_config())
    malo["tareas"]["estado"]["clases"].append(clase)
    with pytest.raises(ValueError, match="clinicas"):
        _validar(malo)


def test_el_cli_del_producto_no_acepta_carpetas_de_kaggle(externo_dir):
    estado = cargar_config()["tareas"]["estado"]["clases"]
    with pytest.raises(ValueError, match="no coinciden"):
        datos.inventariar(externo_dir, estado, 224)


# --- particion -----------------------------------------------------------------

@pytest.mark.parametrize("antes,despues", [
    ("lado_minimo = 1", "lado_minimo = 0"),
    ("val = 0.15", "val = 0.9"),
    ('"normal",', '"black line",'),  # clase repetida
    ('uso = "solo_particion"', 'uso = "entrenamiento"'),
])
def test_ficha_invalida(tmp_path, antes, despues):
    texto = (KAGGLE / "particion.toml").read_text()
    assert antes in texto
    ruta = tmp_path / "f.toml"
    ruta.write_text(texto.replace(antes, despues))
    with pytest.raises(ValueError):
        externo.cargar_ficha(ruta)


def test_particiona_todo_y_cuenta_aptas_por_resolucion(ficha, externo_dir):
    m = externo.particionar(ficha, externo_dir, 224)
    datos.verificar(m)
    assert len(m["archivos"]) == 20 and m["rechazadas"] == []
    assert {a["lado_menor"] for a in m["archivos"]} == {40, 300}
    aptas = m["aptas_lado_producto"]["conteos"]
    assert sum(sum(c.values()) for c in aptas.values()) == 10
    assert m["uso"] == "solo_particion"


def test_cambiar_el_minimo_del_producto_no_mueve_fotos(ficha, externo_dir):
    # El filtro por resolucion es un subconjunto: la particion no cambia.
    a = externo.particionar(ficha, externo_dir, 224)
    b = externo.particionar(ficha, externo_dir, 32)
    assert a["huella"] == b["huella"]
    assert a["aptas_lado_producto"] != b["aptas_lado_producto"]


def test_particion_externa_es_reproducible(ficha, externo_dir):
    a = externo.particionar(ficha, externo_dir, 224)
    b = externo.particionar(ficha, externo_dir, 224)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_manifiesto_versionado_de_kaggle_es_integro():
    # Si alguien edita particion.json a mano, la huella deja de coincidir.
    m = json.loads((KAGGLE / "particion.json").read_text())
    datos.verificar(m)
    f = externo.cargar_ficha(KAGGLE / "particion.toml")
    assert m["clases"] == f["clases"] and m["semilla"] == f["semilla"]
    assert m["uso"] == "solo_particion" and len(m["archivos"]) == 540
