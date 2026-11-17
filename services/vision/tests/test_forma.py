"""Pruebas de la regla de forma con siluetas geometricas generadas al vuelo.

Comprueban que la regla hace lo que dice (medir proporcion y punta), no que sus
umbrales coincidan con el criterio de una profesional: eso no se puede probar aqui.
"""

import numpy as np
import pytest

from preparacion import etiquetar_forma as ef


def elipse(semieje_largo: float, semieje_corto: float, lado: int = 200) -> np.ndarray:
    y, x = np.mgrid[:lado, :lado]
    return ((x - lado / 2) / semieje_largo) ** 2 + ((y - lado / 2) / semieje_corto) ** 2 <= 1


def rectangulo(largo: int, ancho: int, lado: int = 200) -> np.ndarray:
    m = np.zeros((lado, lado), bool)
    y0, x0 = (lado - largo) // 2, (lado - ancho) // 2
    m[y0 : y0 + largo, x0 : x0 + ancho] = True
    return m


def triangulo(largo: int, ancho_base: int, lado: int = 200) -> np.ndarray:
    """Base ancha abajo y punta arriba: una silueta que se afila."""
    m = np.zeros((lado, lado), bool)
    y0 = (lado - largo) // 2
    for i in range(largo):
        medio = max(1, int(ancho_base * i / largo))
        x0 = (lado - medio) // 2
        m[y0 + i, x0 : x0 + medio] = True
    return m


def forma(mascara: np.ndarray) -> str:
    return ef.clasificar(**ef.rasgos(mascara))


def test_el_circulo_es_redonda_y_mide_aspecto_uno():
    r = ef.rasgos(elipse(50, 50))
    assert r["aspecto"] == pytest.approx(1.0, abs=0.08)
    assert forma(elipse(50, 50)) == "redonda"


def test_una_elipse_alargada_es_ovalada():
    r = ef.rasgos(elipse(80, 45))
    assert r["aspecto"] == pytest.approx(80 / 45, abs=0.1)
    assert forma(elipse(80, 45)) == "ovalada"


def test_un_rectangulo_de_punta_plana_es_cuadrada():
    assert ef.rasgos(rectangulo(70, 55))["punta"] >= ef.CUADRADA_PUNTA_MIN
    assert forma(rectangulo(70, 55)) == "cuadrada"


def test_una_silueta_que_se_afila_es_almendra_o_stiletto():
    assert forma(triangulo(100, 70)) == "almendra"  # aspecto ~1.4: se afila pero no es larga
    assert forma(triangulo(160, 50)) == "stiletto"  # aspecto ~3.2: larga y muy afilada


def test_la_forma_no_depende_de_la_rotacion_ni_del_lado_de_la_punta():
    base = elipse(80, 45)
    assert forma(base.T) == forma(base)  # girada 90 grados
    t = triangulo(110, 60)
    assert forma(t[::-1]) == forma(t)  # punta hacia abajo en vez de arriba


def test_solo_cuadrada_redonda_y_ovalada_son_fiables():
    assert ef.CLASES_FIABLES == {"cuadrada", "redonda", "ovalada"}


def test_etiquetar_mascara_descarta_pequenas_cortadas_e_irregulares():
    pytest.importorskip("cv2")
    m = np.zeros((300, 300), np.uint8)
    m[:90, 100:140] = 255  # toca el borde superior: cortada
    m[200:208, 200:208] = 255  # 64 px: muy pequena
    m[100:180, 20:60] = 255  # una rectangular valida
    m[100:180, 60:100] = 255  # pegada a la anterior, mismo componente
    m[230:290, 200:240] = 255  # otra valida
    unas, descartes = ef.etiquetar_mascara(m)
    assert descartes["cortada_por_el_borde"] == 1 and descartes["muy_pequena"] == 1
    assert len(unas) == 2
    assert all(u["forma"] in {"cuadrada", "redonda", "ovalada"} and u["fiable"] for u in unas)
