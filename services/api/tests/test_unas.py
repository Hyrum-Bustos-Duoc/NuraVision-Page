"""Pruebas de la logica de recorte y del endpoint.

No hay fotos de manos en el repo (son dato biometrico), asi que el camino
"se detecto una mano" se verifica a mano, ver README. Aqui se prueba la
geometria con figuras sinteticas y todos los caminos de error.
"""

import numpy as np
import cv2
import pytest
from fastapi.testclient import TestClient

from app.main import RUTA_MODELO, app
from app.vision import unas
from app.vision.unas import Region, esquinas_region, matriz_recorte, region_una

modelo_presente = RUTA_MODELO.is_file()


def png(ancho: int, alto: int, valor: int = 255) -> bytes:
    ok, buf = cv2.imencode(".png", np.full((alto, ancho, 3), valor, np.uint8))
    assert ok
    return buf.tobytes()


@pytest.fixture(scope="module")
def cliente():
    with TestClient(app) as c:
        yield c


# --- geometria -------------------------------------------------------------


def test_region_degenerada_si_el_tramo_es_casi_cero():
    assert region_una((100, 100), (103, 104)) is None


def test_region_apunta_de_la_articulacion_a_la_punta():
    r = region_una((100, 200), (100, 100))  # dedo vertical, punta arriba
    assert r is not None
    assert r.adelante == pytest.approx((0, -1))
    assert r.lado == pytest.approx(100 * unas.ESCALA_RECORTE)
    # El centro se adelanta de la punta (y=100) hacia afuera del dedo (y menor).
    assert r.centro[0] == pytest.approx(100)
    assert r.centro[1] == pytest.approx(100 - 100 * unas.AVANCE_CENTRO)


@pytest.mark.parametrize("dip,tip", [((200, 300), (300, 200)), ((300, 200), (200, 300)), ((250, 100), (250, 300))])
def test_el_recorte_deja_el_dedo_vertical_con_la_punta_arriba(dip, tip):
    # Barra blanca a lo largo del dedo y punta roja: tras recortar, la barra debe
    # ser vertical (mismo ancho en cada fila) y la punta, quedar en la mitad de arriba.
    img = np.zeros((500, 500, 3), np.uint8)
    cv2.line(img, tuple(map(int, dip)), tuple(map(int, tip)), (255, 255, 255), 30)
    cv2.circle(img, tuple(map(int, tip)), 18, (0, 0, 255), -1)
    region = region_una(dip, tip)
    salida = cv2.warpAffine(img, matriz_recorte(region), (224, 224))
    blanco = salida.min(axis=2) > 200
    # Filas intermedias del cuerpo del dedo: mismo ancho en todas = barra vertical.
    # Se toman respecto de donde hay barra, no de filas fijas: el encuadre se ajusta.
    filas = np.where(blanco.any(axis=1))[0]
    muestra = np.linspace(filas.min() + 15, filas.max() - 15, 5).astype(int)
    anchos = [int(blanco[y].sum()) for y in muestra]
    assert max(anchos) - min(anchos) <= 2 and min(anchos) > 20
    # La punta (roja) queda arriba del cuerpo de la barra.
    rojo = (salida[:, :, 2] > 200) & (salida[:, :, 1] < 80)
    assert rojo.any() and np.where(rojo)[0].mean() < np.where(blanco)[0].mean()


def test_fraccion_dentro_distingue_una_visible_de_una_cortada_por_el_borde():
    dentro = Region(centro=(100.0, 100.0), adelante=(0.0, -1.0), lado=40.0)
    en_el_borde = Region(centro=(100.0, 0.0), adelante=(0.0, -1.0), lado=40.0)
    fuera = Region(centro=(100.0, -50.0), adelante=(0.0, -1.0), lado=40.0)
    assert unas.fraccion_dentro(dentro, 300, 300) == 1.0
    assert unas.fraccion_dentro(en_el_borde, 300, 300) == pytest.approx(0.5, abs=0.12)
    assert unas.fraccion_dentro(fuera, 300, 300) == 0.0


def test_una_imagen_con_demasiados_pixeles_se_rechaza_sin_reventar_la_memoria():
    # 13000x13000 = 169 MP, sobre el tope de 64 MP. Liso, pesa pocos KB.
    contenido = png(13000, 13000)
    with pytest.raises(unas.ImagenInvalida):
        unas.decodificar(contenido)


def _mano_sintetica(**dedos: list[tuple[float, float]]) -> np.ndarray:
    """21 puntos: muneca en (0,0), dedos hacia arriba (y negativo). Cada dedo se da como [pip, dip, punta]."""
    pts = np.zeros((21, 2))
    mcp = {"indice": (-30, -100), "medio": (-10, -105), "anular": (10, -100), "menique": (30, -90)}
    idx = {"indice": 5, "medio": 9, "anular": 13, "menique": 17}
    for nombre, i in idx.items():
        pts[i] = mcp[nombre]
        pip, dip, punta = dedos[nombre]
        pts[i + 1], pts[i + 2], pts[i + 3] = pip, dip, punta
    return pts


def test_un_dedo_recto_cuenta_y_uno_doblado_sobre_la_palma_no():
    recto = [(-30, -150), (-30, -190), (-30, -225)]
    doblado = [(-10, -150), (20, -130), (30, -105)]  # la punta vuelve hacia la palma
    pts = _mano_sintetica(indice=recto, medio=doblado, anular=doblado, menique=doblado)
    assert unas.dedo_estirado(pts, "indice") is True
    for dedo in ("medio", "anular", "menique"):
        assert unas.dedo_estirado(pts, dedo) is False, dedo


def test_pulgar_estirado_si_y_doblado_hacia_el_menique_no():
    pts = np.zeros((21, 2))
    pts[17] = (60, -80)  # base del menique
    pts[2], pts[3], pts[4] = (-30, -30), (-60, -50), (-90, -70)  # pulgar recto, alejandose
    assert unas.dedo_estirado(pts, "pulgar") is True
    pts[3], pts[4] = (-20, -50), (20, -60)  # doblado: la punta se acerca al menique
    assert unas.dedo_estirado(pts, "pulgar") is False


def test_png_con_transparencia_se_lee_con_fondo_blanco_no_negro():
    rgba = np.zeros((300, 300, 4), np.uint8)  # todo transparente (RGB 0 = negro)
    rgba[100:200, 100:200] = (10, 20, 200, 255)  # un cuadrado opaco (BGR + alfa)
    ok, buf = cv2.imencode(".png", rgba)
    assert ok
    img = unas.decodificar(buf.tobytes())
    assert img.shape == (300, 300, 3)
    assert tuple(img[10, 10]) == (255, 255, 255)  # lo transparente queda blanco
    assert tuple(img[150, 150]) == (10, 20, 200)  # lo opaco no cambia


def test_esquinas_forman_un_cuadrado_del_lado_de_la_region():
    r = Region(centro=(100.0, 100.0), adelante=(0.6, -0.8), lado=40.0)
    e = np.array(esquinas_region(r))
    lados = [np.hypot(*(e[i] - e[(i + 1) % 4])) for i in range(4)]
    assert lados == pytest.approx([40.0] * 4)
    assert e.mean(axis=0) == pytest.approx([100.0, 100.0])


# --- decodificacion --------------------------------------------------------


def test_decodificar_rechaza_lo_que_no_es_imagen():
    with pytest.raises(unas.ImagenInvalida):
        unas.decodificar(b"%PDF-1.4 esto no es una foto")


def test_decodificar_rechaza_una_imagen_corrupta():
    with pytest.raises(unas.ImagenInvalida):
        unas.decodificar(b"\x89PNG\r\n\x1a\n" + b"basura")


def test_decodificar_lee_png_valido():
    assert unas.decodificar(png(10, 20)).shape == (20, 10, 3)


# --- endpoint --------------------------------------------------------------


def subir(cliente, contenido: bytes, nombre="foto.png", tipo="image/png"):
    return cliente.post("/vision/analizar", files={"foto": (nombre, contenido, tipo)})


def test_salud_informa_si_el_modelo_esta_cargado(cliente):
    r = cliente.get("/salud")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is True
    assert cuerpo["modelo_cargado"] is modelo_presente
    # El segmentador es opcional: sin el, el servicio sigue detectando unas.
    assert isinstance(cuerpo["segmentador_cargado"], bool)


def test_sin_campo_foto_responde_400_con_codigo(cliente):
    r = cliente.post("/vision/analizar")
    assert r.status_code == 400
    assert r.json()["codigo"] == "imagen_invalida"


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_archivo_que_no_es_imagen_responde_400(cliente):
    r = subir(cliente, b"hola, no soy una imagen", "x.png")
    assert r.status_code == 400
    assert r.json()["codigo"] == "imagen_invalida"


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_mas_de_10_mb_responde_413_sin_decodificar(cliente):
    r = subir(cliente, b"\xff\xd8\xff" + b"0" * (10 * 1024 * 1024 + 1), "x.jpg", "image/jpeg")
    assert r.status_code == 413
    assert r.json()["codigo"] == "imagen_muy_grande"


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_imagen_menor_al_minimo_es_no_concluyente(cliente):
    r = subir(cliente, png(200, 800))
    assert r.status_code == 200
    cuerpo = r.json()
    assert (cuerpo["estado"], cuerpo["motivo"], cuerpo["unas"]) == ("no_concluyente", "imagen_pequena", [])


@pytest.mark.skipif(not modelo_presente, reason="falta models/hand_landmarker.task")
def test_foto_sin_mano_es_no_concluyente_y_lleva_el_aviso(cliente):
    r = subir(cliente, png(640, 640))
    assert r.status_code == 200
    cuerpo = r.json()
    assert (cuerpo["estado"], cuerpo["motivo"], cuerpo["manos"]) == ("no_concluyente", "sin_mano", 0)
    assert "No es un diagnostico medico" in cuerpo["aviso"]


def test_sin_modelo_responde_503_en_vez_de_caerse():
    with TestClient(app) as c:
        anterior = app.state.analizador
        app.state.analizador, app.state.motivo_sin_modelo = None, "Falta el modelo"
        try:
            r = subir(c, png(640, 640))
        finally:
            app.state.analizador = anterior
    assert r.status_code == 503
    assert r.json()["codigo"] == "modelo_no_disponible"
