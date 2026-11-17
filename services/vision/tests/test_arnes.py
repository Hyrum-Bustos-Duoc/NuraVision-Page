"""Arnes de fotos reales con imagenes sinteticas y un cliente falso.

Ninguna foto real: el cliente falso devuelve respuestas con el shape de
POST /vision/analizar. La prueba con el servicio de verdad se salta si el
entorno no tiene FastAPI y MediaPipe (corre con el venv de services/api).
"""

import json

import pytest

from conftest import foto
from entrenamiento import arnes
from entrenamiento.config import RAIZ_REPO


class Respuesta:
    def __init__(self, status_code: int, cuerpo):
        self.status_code, self._cuerpo = status_code, cuerpo

    def json(self):
        if isinstance(self._cuerpo, str):
            raise ValueError("no es JSON")
        return self._cuerpo


class ClienteFalso:
    """Responde en orden: el arnes recorre las fotos ordenadas por nombre."""

    def __init__(self, respuestas: list[Respuesta]):
        self.respuestas, self.nombres_enviados = list(respuestas), []

    def post(self, url, files):
        assert url == "/vision/analizar"
        self.nombres_enviados.append(files["foto"][0])
        return self.respuestas.pop(0)

    def get(self, url):
        return Respuesta(200, {"ok": True, "clasificador_clinico_cargado": False})


def ok(*clinicos, sin_campo=False):
    unas = []
    for i, c in enumerate(clinicos):
        una = {"dedo": arnes.DEDOS[i % 5], "mano": 1 + i // 5, "forma": None, "recorte": "data:image/jpeg;base64,AAA"}
        if not sin_campo:
            una["clinico"] = c
        unas.append(una)
    return Respuesta(200, {"estado": "ok", "motivo": None, "manos": 1 + (len(unas) - 1) // 5, "unas": unas})


def senal(clase):
    return {"estado": "ok", "motivo": None, "clase": clase}


ABSTENCION = {"estado": "no_concluyente", "motivo": "confianza_baja", "clase": None}
SIN_MANO = Respuesta(200, {"estado": "no_concluyente", "motivo": "sin_mano", "manos": 0, "unas": []})


@pytest.fixture
def fotos(tmp_path):
    for nombre in ("ana_soto.jpg", "maria_perez.jpg", "zz_tercera.jpg"):
        foto(tmp_path / "fotos" / nombre, (200, 150, 120))
    return tmp_path / "fotos"


def test_sin_anotacion_informa_todo_y_h1_h2_sin_anotacion(fotos):
    cliente = ClienteFalso([ok(senal("linea_beau"), ABSTENCION), SIN_MANO, Respuesta(500, "Internal Server Error")])
    registros, r = arnes.ejecutar(cliente, fotos, {})
    assert (r["fotos"], r["fotos_con_mano"], r["unas"]) == (3, 1, 2)
    assert r["unas_por_foto"] == {0: 1, 2: 1}
    assert r["estado"] == {"ok": 1, "no_concluyente": 1}
    assert r["motivo"] == {"confianza_baja": 1} and r["clase"] == {"linea_beau": 1}
    assert r["cobertura"] == 0.5 and r["errores"] == {"error_interno": 1}
    assert set(r["latencia_ms"]) == {"p50", "p95"}
    assert r["aceptacion"]["H1"]["cumple"] is None and r["aceptacion"]["H2"]["cumple"] is None
    assert r["aceptacion"]["H3"] == {"valor": 1, "limite": 0, "cumple": False}
    assert r["salud"]["clasificador_clinico_cargado"] is False
    # El resultado no vuelve a contener la imagen, y el servicio no recibe el nombre.
    assert "recorte" not in str(registros) and set(cliente.nombres_enviados) == {"foto"}


def test_falsa_alarma_h2_20_por_ciento(fotos, tmp_path):
    (tmp_path / "a.csv").write_text(
        "archivo,dedo,clase,tono_piel\nana_soto.jpg,,sin_senales,monk_8\nmaria_perez.jpg,,sin_senales,monk_3\n"
    )
    anotacion = arnes.cargar_anotacion(tmp_path / "a.csv")
    cinco_ss = [senal("sin_senales")] * 3 + [ABSTENCION]
    cliente = ClienteFalso([
        ok(senal("mancha_blanca"), *cinco_ss),
        ok(senal("mancha_blanca"), *cinco_ss),
        SIN_MANO,
    ])
    _, r = arnes.ejecutar(cliente, fotos, anotacion)
    assert r["aceptacion"]["H2"] == {"valor": 0.2, "limite": 0.10, "cumple": False}
    assert r["subgrupos"]["tono_piel"]["monk_8"]["falsas_alarmas"] == 1
    assert "H2: 20% (limite 10%) no cumple" in arnes.consola(r)


def test_h1_cuenta_senal_grave_dicha_sin_senales_por_dedo(fotos, tmp_path):
    (tmp_path / "a.csv").write_text("archivo,dedo,clase\nana_soto.jpg,pulgar,linea_oscura\nana_soto.jpg,indice,acropaquia\n")
    cliente = ClienteFalso([ok(senal("sin_senales"), ABSTENCION, senal("sin_senales")), SIN_MANO, SIN_MANO])
    _, r = arnes.ejecutar(cliente, fotos, arnes.cargar_anotacion(tmp_path / "a.csv"))
    # Solo pulgar e indice estan anotados: el tercer sin_senales (medio) no cuenta.
    assert r["aceptacion"]["H1"] == {"valor": 1, "limite": 0, "cumple": False}


def test_sin_modelo_todas_las_unas_son_modelo_no_entrenado(fotos):
    # Servicio anterior a la tarea 3.2: las unas no traen `clinico`.
    cliente = ClienteFalso([ok({}, {}, {}, sin_campo=True), SIN_MANO, SIN_MANO])
    _, r = arnes.ejecutar(cliente, fotos, {})
    assert r["motivo"] == {"modelo_no_entrenado": 3} and r["cobertura"] == 0.0
    assert r["aceptacion"]["H3"]["cumple"] is True


def test_consola_sin_nombres_de_archivo(fotos, tmp_path, capsys):
    (tmp_path / "a.csv").write_text("archivo,clase\nmaria_perez.jpg,sin_senales\nfalta_carla.jpg,otra\n")
    cliente = ClienteFalso([SIN_MANO, ok(senal("sin_senales")), SIN_MANO])
    _, r = arnes.ejecutar(cliente, fotos, arnes.cargar_anotacion(tmp_path / "a.csv"))
    texto = arnes.consola(r)
    assert r["anotaciones_sin_foto"] == 1
    for nombre in ("ana", "maria", "perez", "carla", "zz_tercera", ".jpg"):
        assert nombre not in texto


@pytest.mark.parametrize("csv", [
    "archivo,dedo,clase\na.jpg,,melanoma\n",
    "archivo,dedo,clase\na.jpg,codo,\n",
    "archivo,clase\na.jpg,otra\na.jpg,sin_senales\n",
])
def test_anotacion_invalida_falla_con_el_conteo(tmp_path, csv):
    (tmp_path / "a.csv").write_text(csv)
    with pytest.raises(ValueError, match="1 filas invalidas") as error:
        arnes.cargar_anotacion(tmp_path / "a.csv")
    assert "a.jpg" not in str(error.value)


@pytest.mark.parametrize("opcion", ["--salida", "--fotos", "--anotacion"])
def test_se_niega_a_usar_el_repositorio_antes_de_procesar(fotos, tmp_path, opcion):
    args = {"--fotos": str(fotos), "--salida": str(tmp_path / "res"), "--anotacion": str(tmp_path / "a.csv")}
    args[opcion] = str(RAIZ_REPO / "services" / "vision" / "arnes_prueba")
    with pytest.raises(ValueError, match="fuera del repositorio"):
        arnes.main([x for par in args.items() for x in par])
    assert not (tmp_path / "res").exists()


def test_con_el_servicio_real(fotos, tmp_path):
    """Pasa las fotos sinteticas (sin mano) por la app de services/api."""
    pytest.importorskip("fastapi")
    pytest.importorskip("mediapipe")
    if not (RAIZ_REPO / "services" / "api" / "models" / "hand_landmarker.task").is_file():
        pytest.skip("falta el modelo de MediaPipe del servicio")
    arnes.main(["--fotos", str(fotos), "--salida", str(tmp_path / "res")])
    r = json.loads((tmp_path / "res" / "resumen.json").read_text())
    assert r["fotos"] == 3 and r["errores"] == {} and r["fotos_con_mano"] == 0
    assert r["salud"]["modelo_cargado"] is True
