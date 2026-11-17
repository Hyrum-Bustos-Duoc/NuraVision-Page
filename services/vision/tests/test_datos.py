import json
import shutil

import numpy as np
import pytest
from PIL import Image

from conftest import CLASES, foto
from entrenamiento import datos


def _particion(raiz, semilla=7, clases=CLASES):
    validas, _ = datos.inventariar(raiz, clases, 224)
    return datos.dividir(validas, clases, 0.15, 0.15, semilla)


# --- validacion -------------------------------------------------------------

def test_inventario_acepta_fotos_validas(dataset):
    validas, rechazadas = datos.inventariar(dataset, CLASES, 224)
    assert len(validas) == 30 and rechazadas == []


def test_rechaza_por_formato_real_no_por_extension(dataset):
    (dataset / "almendra" / "texto.jpg").write_bytes(b"no soy una imagen")
    foto(dataset / "almendra" / "animado.jpg", (1, 2, 3), formato="GIF")
    foto(dataset / "almendra" / "png_con_extension_jpg.jpg", (9, 9, 9), formato="PNG")
    _, rechazadas = datos.inventariar(dataset, CLASES, 224)
    assert sorted(rechazadas, key=lambda r: r["archivo"]) == [
        {"archivo": "almendra/animado.jpg", "motivo": "formato_no_soportado"},
        {"archivo": "almendra/texto.jpg", "motivo": "formato_no_soportado"},
    ]


def test_rechaza_archivo_truncado(dataset):
    ruta = dataset / "cuadrada" / "00.jpg"
    ruta.write_bytes(ruta.read_bytes()[:200])
    _, rechazadas = datos.inventariar(dataset, CLASES, 224)
    assert rechazadas == [{"archivo": "cuadrada/00.jpg", "motivo": "formato_no_soportado"}]


def test_rechaza_resolucion_insuficiente(dataset):
    foto(dataset / "ovalada" / "chica.jpg", (200, 0, 0), tamano=(223, 500))
    _, rechazadas = datos.inventariar(dataset, CLASES, 224)
    assert rechazadas == [{"archivo": "ovalada/chica.jpg", "motivo": "resolucion_insuficiente"}]


def test_ignora_ocultos(dataset):
    (dataset / "almendra" / ".DS_Store").write_bytes(b"x")
    validas, rechazadas = datos.inventariar(dataset, CLASES, 224)
    assert len(validas) == 30 and rechazadas == []


def test_duplicado_exacto_en_misma_clase_se_cuenta_una_vez(dataset):
    shutil.copy(dataset / "almendra" / "03.jpg", dataset / "almendra" / "zz_copia.jpg")
    validas, rechazadas = datos.inventariar(dataset, CLASES, 224)
    assert len(validas) == 30
    assert rechazadas == [{"archivo": "almendra/zz_copia.jpg", "motivo": "duplicado_exacto"}]


def test_misma_foto_en_dos_clases_se_descarta_entera(dataset):
    shutil.copy(dataset / "almendra" / "03.jpg", dataset / "cuadrada" / "robada.jpg")
    validas, rechazadas = datos.inventariar(dataset, CLASES, 224)
    assert len(validas) == 29
    assert {r["archivo"] for r in rechazadas} == {"almendra/03.jpg", "cuadrada/robada.jpg"}
    assert {r["motivo"] for r in rechazadas} == {"etiqueta_conflictiva"}


def test_carpeta_que_no_es_clase_falla(dataset):
    (dataset / "almendras").mkdir()
    with pytest.raises(ValueError, match="no coinciden"):
        datos.inventariar(dataset, CLASES, 224)


def test_clase_sin_carpeta_falla(dataset):
    with pytest.raises(ValueError, match="no coinciden"):
        datos.inventariar(dataset, CLASES + ["redonda"], 224)


# --- particion --------------------------------------------------------------

def test_particion_es_reproducible(dataset):
    a, b = _particion(dataset), _particion(dataset)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert _particion(dataset, semilla=8)["huella"] != a["huella"]


def test_particion_no_depende_del_orden_de_entrada(dataset):
    validas, _ = datos.inventariar(dataset, CLASES, 224)
    invertida = datos.dividir(list(reversed(validas)), CLASES, 0.15, 0.15, 7)
    assert invertida["huella"] == _particion(dataset)["huella"]


def test_particion_estratificada(dataset):
    conteos = _particion(dataset)["conteos"]
    # 10 por clase: round(1.5) = 2 en test y en val, 6 en train
    for clase in CLASES:
        assert (conteos["train"][clase], conteos["val"][clase], conteos["test"][clase]) == (6, 2, 2)


def test_anadir_una_clase_no_mueve_las_demas(dataset):
    antes = {a["archivo"]: a["particion"] for a in _particion(dataset)["archivos"]}
    for i in range(5):
        foto(dataset / "redonda" / f"{i}.jpg", (255, i * 40, 255))
    despues = {a["archivo"]: a["particion"] for a in _particion(dataset, clases=CLASES + ["redonda"])["archivos"]}
    assert all(despues[k] == v for k, v in antes.items())


def test_clase_con_menos_de_tres_fotos_falla(dataset):
    for ruta in sorted((dataset / "ovalada").iterdir())[2:]:
        ruta.unlink()
    with pytest.raises(ValueError, match="ovalada: 2 fotos"):
        _particion(dataset)


def test_ninguna_foto_cruza_particiones(dataset):
    m = _particion(dataset)
    datos.verificar(m)
    por_hash = {}
    for a in m["archivos"]:
        por_hash.setdefault(a["sha256"], set()).add(a["particion"])
    assert all(len(p) == 1 for p in por_hash.values())


def test_verificar_detecta_manifiesto_alterado(dataset):
    m = _particion(dataset)
    m["archivos"][0]["particion"] = "test" if m["archivos"][0]["particion"] != "test" else "train"
    with pytest.raises(ValueError, match="huella"):
        datos.verificar(m)


def test_verificar_detecta_mismo_contenido_en_dos_particiones(dataset):
    m = _particion(dataset)
    a, b = m["archivos"][0], next(x for x in m["archivos"] if x["particion"] != m["archivos"][0]["particion"])
    b["sha256"] = a["sha256"]
    m["huella"] = datos._huella(m["archivos"])
    with pytest.raises(ValueError, match="dos particiones"):
        datos.verificar(m)


def test_de_particion_devuelve_indices_de_clase(dataset):
    m = _particion(dataset)
    archivos, etiquetas = datos.de_particion(m, "test")
    assert len(archivos) == 6
    assert all(CLASES[e] == a.split("/")[0] for a, e in zip(archivos, etiquetas))


# --- normalizacion y pesos --------------------------------------------------

def test_cargar_imagen_aplica_exif_y_no_deforma(tmp_path):
    # 400x200: mitad izquierda roja, derecha azul. Orientacion EXIF 6 = el
    # visor la gira 90 grados horario: queda vertical con el rojo arriba.
    img = Image.new("RGB", (400, 200), (0, 0, 255))
    img.paste((255, 0, 0), (0, 0, 200, 200))
    exif = Image.Exif()
    exif[0x0112] = 6
    ruta = tmp_path / "girada.jpg"
    img.save(ruta, "JPEG", exif=exif)

    x = datos.cargar_imagen(ruta, 224)
    assert x.shape == (224, 224, 3) and x.dtype == np.uint8
    assert x[20, 112, 0] > 200 and x[20, 112, 2] < 60     # arriba: rojo
    assert x[200, 112, 2] > 200 and x[200, 112, 0] < 60   # abajo: azul
    # Relleno lateral negro: la proporcion 1:2 se conserva, no se estira.
    assert x[112, 5].max() < 10 and x[112, 218].max() < 10


def test_cargar_imagen_convierte_a_rgb(tmp_path):
    ruta = tmp_path / "gris.png"
    Image.new("L", (300, 300), 128).save(ruta)
    assert datos.cargar_imagen(ruta, 224).shape == (224, 224, 3)


def test_pesos_de_clase_compensan_desbalance():
    assert datos.pesos_de_clase([0, 0, 0, 1], 2) == pytest.approx({0: 4 / 6, 1: 2.0})


def test_subgrupos(dataset):
    assert datos.cargar_subgrupos(dataset) == {}
    (dataset / "subgrupos.csv").write_text("archivo,tono_piel,luz\nalmendra/00.jpg,monk_7,natural\n")
    assert datos.cargar_subgrupos(dataset) == {"almendra/00.jpg": {"tono_piel": "monk_7", "luz": "natural"}}
    # el csv no es una carpeta de clase: no debe romper el inventario
    assert len(datos.inventariar(dataset, CLASES, 224)[0]) == 30


# --- particion por series ----------------------------------------------------

def _series(ruta, filas):
    ruta.write_text("archivo,serie\n" + "".join(f"{a},{s}\n" for a, s in filas))
    return datos.cargar_series(ruta)


def _particion_con_series(raiz, filas, tmp_path, semilla=7):
    validas, rechazadas = datos.inventariar(raiz, CLASES, 224)
    validas, rechazadas = datos.asignar_series(validas, rechazadas, _series(tmp_path / "series.csv", filas))
    return datos.dividir(validas, CLASES, 0.15, 0.15, semilla), rechazadas


def test_sin_series_la_huella_es_la_de_antes_del_cambio(dataset):
    # Calculada con el datos.dividir anterior a las series (2026-11-12), sobre
    # esta misma fixture: forma y estado no cambian de particion.
    assert _particion(dataset)["huella"] == "df7ed6c6a576007ef0f866dbccd1f121ff32289d53795b9d48f844cf5b62857e"


def test_serie_unida_cae_en_una_sola_particion(dataset, tmp_path):
    filas = [(f"almendra/0{i}.jpg", "s7") for i in (1, 4, 8)]
    for semilla in range(20):  # con cualquier barajado, nunca se separa
        m, _ = _particion_con_series(dataset, filas, tmp_path, semilla)
        datos.verificar(m)
        assert len({a["particion"] for a in m["archivos"] if a["serie"] == "s7"}) == 1
        assert all(m["conteos"][p]["almendra"] >= 1 for p in datos.PARTICIONES)


def test_series_grandes_dejan_al_menos_una_serie_por_particion(dataset, tmp_path):
    filas = [(f"almendra/0{i}.jpg", "grande") for i in range(8)]
    m, _ = _particion_con_series(dataset, filas, tmp_path)
    assert all(m["conteos"][p]["almendra"] >= 1 for p in datos.PARTICIONES)
    assert sum(m["conteos"][p]["almendra"] for p in datos.PARTICIONES) == 10


def test_menos_de_tres_series_por_clase_falla(dataset, tmp_path):
    filas = [(f"almendra/0{i}.jpg", "a" if i < 5 else "b") for i in range(10)]
    with pytest.raises(ValueError, match="almendra: 10 fotos validas en 2 series"):
        _particion_con_series(dataset, filas, tmp_path)


def test_verificar_nombra_la_serie_movida(dataset, tmp_path):
    m, _ = _particion_con_series(dataset, [(f"cuadrada/0{i}.jpg", "s7") for i in range(3)], tmp_path)
    foto_s7 = next(a for a in m["archivos"] if a["serie"] == "s7")
    foto_s7["particion"] = "train" if foto_s7["particion"] != "train" else "test"
    m["huella"] = datos._huella(m["archivos"])
    with pytest.raises(ValueError, match="serie s7 aparece en dos particiones"):
        datos.verificar(m)


def test_serie_con_dos_clases_se_rechaza_entera(dataset, tmp_path):
    m, rechazadas = _particion_con_series(dataset, [("almendra/00.jpg", "x"), ("ovalada/00.jpg", "x")], tmp_path)
    assert {r["archivo"]: r["motivo"] for r in rechazadas} == {
        "almendra/00.jpg": "etiqueta_conflictiva", "ovalada/00.jpg": "etiqueta_conflictiva",
    }
    assert len(m["archivos"]) == 28


def test_serie_que_nombra_foto_inexistente_falla_solo_con_el_conteo(dataset, tmp_path):
    filas = [("almendra/00.jpg", "a"), ("almendra/maria_perez.jpg", "a"), ("ovalada/00.jpg", ""),
             ("cuadrada/00.jpg", "b"), ("cuadrada/00.jpg", "c")]
    with pytest.raises(ValueError, match="3 filas invalidas") as error:
        _particion_con_series(dataset, filas, tmp_path)
    assert "maria" not in str(error.value) and ".jpg" not in str(error.value)


def test_serie_puede_nombrar_una_foto_rechazada(dataset, tmp_path):
    foto(dataset / "almendra" / "chica.jpg", (1, 1, 1), tamano=(100, 100))
    m, rechazadas = _particion_con_series(dataset, [("almendra/chica.jpg", "a"), ("almendra/00.jpg", "a")], tmp_path)
    assert {"archivo": "almendra/chica.jpg", "motivo": "resolucion_insuficiente"} in rechazadas
    assert len(m["archivos"]) == 30


def test_archivo_de_series_sin_columnas(tmp_path):
    (tmp_path / "s.csv").write_text("foto,grupo\na.jpg,1\n")
    with pytest.raises(ValueError, match="archivo,serie"):
        datos.cargar_series(tmp_path / "s.csv")


# --- CLI: estado_clinico -------------------------------------------------------

@pytest.fixture
def clinico(tmp_path):
    """4 fotos de 70 px de lado menor por cada clase de estado_clinico."""
    from entrenamiento.config import CLASES_CLINICAS
    raiz = tmp_path / "estado_clinico"
    for ci, clase in enumerate(CLASES_CLINICAS):
        for i in range(4):
            foto(raiz / clase / f"{i}.jpg", (ci * 25, i * 60, 90), tamano=(70, 90))
    return raiz


def test_estado_clinico_exige_series(clinico, tmp_path):
    from entrenamiento.__main__ import _particionar
    from entrenamiento.config import cargar_config
    with pytest.raises(ValueError, match="exige --series"):
        _particionar(cargar_config(), "estado_clinico", clinico, tmp_path / "salida", None)


def test_estado_clinico_acepta_70_px_y_forma_no(clinico, tmp_path):
    from entrenamiento.__main__ import _particionar
    from entrenamiento.config import cargar_config, lado_minimo
    series = tmp_path / "series.csv"
    series.write_text("archivo,serie\nacropaquia/0.jpg,s1\nacropaquia/1.jpg,s1\n")
    cfg = cargar_config()
    m, motivos = _particionar(cfg, "estado_clinico", clinico, tmp_path / "salida", series)
    assert len(m["archivos"]) == 36 and motivos == {}
    # comparar vuelve a particionar con los mismos argumentos: misma particion.
    assert _particionar(cfg, "estado_clinico", clinico, tmp_path / "otra", series)[0]["huella"] == m["huella"]
    _, rechazadas = datos.inventariar(clinico, sorted(p.name for p in clinico.iterdir()), lado_minimo(cfg, "forma"))
    assert {r["motivo"] for r in rechazadas} == {"resolucion_insuficiente"} and len(rechazadas) == 36


def test_estado_clinico_con_carpetas_de_kaggle_sin_renombrar_falla(tmp_path):
    from entrenamiento.__main__ import _particionar
    from entrenamiento.config import cargar_config
    for clase in ("black line", "beau_s line"):
        foto(tmp_path / "estado_clinico" / clase / "0.jpg", (1, 2, 3))
    series = tmp_path / "series.csv"
    series.write_text("archivo,serie\n")
    with pytest.raises(ValueError, match="no coinciden"):
        _particionar(cargar_config(), "estado_clinico", tmp_path / "estado_clinico", tmp_path / "s", series)
