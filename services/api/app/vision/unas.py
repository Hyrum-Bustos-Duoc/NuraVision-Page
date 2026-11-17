"""Detecta manos con MediaPipe y recorta la zona de cada una.

MediaPipe entrega 21 puntos por mano, no el contorno de la una. Para cada dedo
se usan dos: la articulacion distal (DIP; IP en el pulgar) y la punta. La una
queda sobre ese ultimo tramo, asi que el recorte es una zona aproximada
centrada ahi, rotada para que el dedo apunte hacia arriba. Es suficiente para
mostrarla y para alimentar un clasificador despues, pero no es una segmentacion
precisa (para eso esta el dataset NailSegmentationDatasetV2, ver
services/vision/docs/preparacion-modelo.md).

Si MediaPipe no encuentra ninguna mano (lo normal en un primer plano de una una
o de la punta de un dedo), la foto entera se trata como un recorte de una sola
una, que es justo lo que vio el clasificador clinico al entrenar (Nail.zip). Solo
se acepta si clinico.parece_una() la reconoce; si no, sale sin_mano. En ese modo
no se mide la forma: medido el 2026-11-17 sobre 44 primeros planos simulados con
mascara real, el segmentador sin el recorte alineado al dedo dio IoU mediana
0,32 y trazo "una" en 144 de 158 recortes de piel sin ninguna.
"""

import base64
import io
import logging
import threading
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpp
from PIL import Image, ImageOps
from mediapipe.tasks.python import vision

from . import clinico
from . import forma as modulo_forma
from .esquemas import Modelo, ResultadoAnalisis, Una
from .segmentador import LADO as LADO_SEGMENTADOR
from .segmentador import Segmentador

log = logging.getLogger(__name__)

NOMBRE_MODELO = "mediapipe-hand-landmarker"
VERSION = "0.3.0"

# (articulacion distal, punta) de cada dedo, segun la numeracion de MediaPipe.
DEDOS = {
    "pulgar": (3, 4),
    "indice": (7, 8),
    "medio": (11, 12),
    "anular": (15, 16),
    "menique": (19, 20),
}

# Lado menor minimo de la foto. Mismo criterio que services/vision/config.toml:
# por debajo, la una ocupa tan pocos pixeles que no hay nada que analizar.
LADO_MINIMO = 224
# Para ir rapido: una foto de celular de 12 MP no mejora la deteccion.
LADO_MAXIMO = 1600
# Lado del recorte de salida, el que usan los clasificadores del modulo vision.
LADO_RECORTE = 224
# Lado del recorte, como multiplo del tramo articulacion-punta del dedo.
ESCALA_RECORTE = 1.2
# Cuanto se adelanta el centro del recorte desde el punto "punta" de MediaPipe,
# hacia fuera del dedo, como fraccion de ese mismo tramo. Ese punto cae hacia la
# mitad de la una, no en su extremo: con el centro en la punta o detras de ella,
# la una queda cortada por arriba.
# Ajustado el 2026-11-10 con UNA foto real de mano (indice y pulgar con esmalte)
# y con fotos del dataset de segmentacion. Hay que revisarlo con mas fotos de celular.
AVANCE_CENTRO = 0.1
# Tramos menores a esto (px) son ruido o un dedo de frente: no se recortan.
TRAMO_MINIMO_PX = 12
# Tope de pixeles por foto (64 MP cubre las camaras de 50 MP). Decodificada, una
# foto de 64 MP ocupa ~190 MB; sin tope, una bomba de pixeles tumba el servidor.
MAX_PIXELES = 64_000_000
# Pillow solo se usa para leer la cabecera; el tope lo pone MAX_PIXELES, no su
# aviso de "decompression bomb", que ademas ensucia los logs.
Image.MAX_IMAGE_PIXELS = None
# Fraccion minima del recorte que debe caer dentro de la foto. Si la mano esta
# cortada por el borde, MediaPipe igual "estima" los dedos fuera del cuadro y el
# recorte seria una franja de color estirada, no una una.
FRACCION_MINIMA_DENTRO = 0.8
# Mas permisivo que el valor por defecto (0.5), medido en
# services/vision/preparacion/probar_mediapipe.py. Si se sube, detecta menos.
CONFIANZA_DETECCION = 0.3
# Esquinas de la foto entera, en el mismo orden que esquinas_region con el dedo hacia arriba.
ESQUINAS_FOTO = [(0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]


class ModeloNoDisponible(RuntimeError):
    pass


class ImagenInvalida(ValueError):
    pass


@dataclass(frozen=True)
class Region:
    """Cuadrado orientado: centro, vector unitario hacia la punta y lado, en px."""

    centro: tuple[float, float]
    adelante: tuple[float, float]
    lado: float


# Un dedo cuenta como "con la una a la vista" si esta estirado. Medido en una sola
# foto (mano con indice y pulgar extendidos y tres dedos doblados):
#   estirados: punta/PIP 1.29, angulo del PIP 177 (indice); angulo del IP 172 (pulgar)
#   doblados:  punta/PIP 0.92-0.96, angulo del PIP 11-109
# Los umbrales quedan en medio, con holgura. Hay que revisarlos con mas fotos.
MIN_EXTENSION = 1.1  # distancia muneca-punta / distancia muneca-PIP
MIN_ANGULO_PIP = 120.0  # grados; 180 = dedo recto
MIN_ANGULO_IP_PULGAR = 140.0

# (MCP, PIP, DIP, punta) de los cuatro dedos largos, segun MediaPipe.
FALANGES = {"indice": (5, 6, 7, 8), "medio": (9, 10, 11, 12), "anular": (13, 14, 15, 16), "menique": (17, 18, 19, 20)}


def _angulo(vertice: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    u, v = a - vertice, b - vertice
    norma = float(np.linalg.norm(u) * np.linalg.norm(v))
    if norma == 0:
        return 0.0
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / norma, -1.0, 1.0))))


def dedo_estirado(pts: np.ndarray, dedo: str) -> bool:
    """True si el dedo esta estirado, es decir, su una puede verse de frente o de lado.

    MediaPipe devuelve los 21 puntos de la mano aunque un dedo este doblado y su
    punta quede escondida: sin esta comprobacion se "recortarian" unas que no se ven.
    `pts` son los 21 puntos en pixeles, forma (21, 2).
    """
    if dedo == "pulgar":
        # IP en el 3, punta en el 4. Doblado sobre la palma, la punta se acerca al menique.
        estirado = _angulo(pts[3], pts[2], pts[4]) >= MIN_ANGULO_IP_PULGAR
        se_aleja = np.linalg.norm(pts[4] - pts[17]) > np.linalg.norm(pts[3] - pts[17])
        return bool(estirado and se_aleja)
    mcp, pip, dip, punta = FALANGES[dedo]
    muneca = pts[0]
    extension = np.linalg.norm(pts[punta] - muneca) / max(float(np.linalg.norm(pts[pip] - muneca)), 1e-6)
    return bool(extension >= MIN_EXTENSION and _angulo(pts[pip], pts[mcp], pts[dip]) >= MIN_ANGULO_PIP)


def region_una(articulacion: tuple[float, float], punta: tuple[float, float]) -> Region | None:
    """Region de la una a partir de dos puntos en pixeles; None si el tramo es degenerado."""
    vx, vy = punta[0] - articulacion[0], punta[1] - articulacion[1]
    largo = float(np.hypot(vx, vy))
    if largo < TRAMO_MINIMO_PX:
        return None
    centro = (punta[0] + AVANCE_CENTRO * vx, punta[1] + AVANCE_CENTRO * vy)
    return Region(centro, (vx / largo, vy / largo), largo * ESCALA_RECORTE)


def fraccion_dentro(region: Region, ancho: int, alto: int) -> float:
    """Que fraccion del cuadrado orientado cae dentro de la foto (muestreo 9x9)."""
    ux, uy = region.adelante
    rx, ry = -uy, ux
    pasos = np.linspace(-1.0, 1.0, 9) * region.lado / 2
    a, b = np.meshgrid(pasos, pasos)
    x = region.centro[0] + a * rx + b * ux
    y = region.centro[1] + a * ry + b * uy
    return float(np.mean((x >= 0) & (x < ancho) & (y >= 0) & (y < alto)))


def esquinas_region(region: Region) -> list[tuple[float, float]]:
    """Las cuatro esquinas del cuadrado orientado, en px."""
    ux, uy = region.adelante
    rx, ry = -uy, ux  # perpendicular: hacia la "derecha" cuando el dedo apunta arriba
    mitad = region.lado / 2
    cx, cy = region.centro
    return [
        (cx + sx * mitad * rx + sy * mitad * ux, cy + sx * mitad * ry + sy * mitad * uy)
        for sx, sy in ((-1, 1), (1, 1), (1, -1), (-1, -1))
    ]


def matriz_recorte(region: Region, salida: int = LADO_RECORTE) -> np.ndarray:
    """Matriz afin 2x3 que lleva la region a un cuadrado salida x salida con el dedo hacia arriba."""
    ux, uy = region.adelante
    rx, ry = -uy, ux
    cx, cy = region.centro
    k = salida / region.lado
    mitad = salida / 2
    return np.array(
        [
            [k * rx, k * ry, mitad - k * (cx * rx + cy * ry)],
            [-k * ux, -k * uy, mitad + k * (cx * ux + cy * uy)],
        ],
        dtype=np.float64,
    )


def decodificar(contenido: bytes) -> np.ndarray:
    """Bytes -> imagen BGR. Aplica la orientacion EXIF (las fotos de celular la traen)."""
    if not (
        contenido.startswith(b"\xff\xd8\xff")
        or contenido.startswith(b"\x89PNG\r\n\x1a\n")
        or (contenido[:4] == b"RIFF" and contenido[8:12] == b"WEBP")
    ):
        raise ImagenInvalida("El archivo no es JPEG, PNG ni WebP.")
    # Las dimensiones se leen de la cabecera ANTES de decodificar: un PNG liso de
    # 20000x20000 pesa ~1 MB, pasa el limite de subida y decodificado ocupa 1,3 GB.
    try:
        with Image.open(io.BytesIO(contenido)) as cabecera:
            ancho, alto = cabecera.size
    except Exception as exc:  # Pillow lanza varios tipos segun el formato roto
        raise ImagenInvalida("No se pudo leer la imagen.") from exc
    if ancho * alto > MAX_PIXELES:
        raise ImagenInvalida(
            f"La imagen tiene {ancho}x{alto} pixeles; el maximo es {MAX_PIXELES // 1_000_000} megapixeles."
        )
    con_alfa = not contenido.startswith(b"\xff\xd8\xff")  # PNG y WebP pueden traer transparencia
    # IMREAD_UNCHANGED conserva el canal alfa pero ignora la orientacion EXIF, asi
    # que solo se usa donde puede haber transparencia; los JPEG (las fotos de
    # celular, con EXIF) siguen por IMREAD_COLOR.
    modo = cv2.IMREAD_UNCHANGED if con_alfa else cv2.IMREAD_COLOR
    imagen = cv2.imdecode(np.frombuffer(contenido, np.uint8), modo)
    if imagen is None:
        raise ImagenInvalida("No se pudo leer la imagen.")
    return _a_bgr8(imagen)


def _a_bgr8(imagen: np.ndarray) -> np.ndarray:
    """Cualquier imagen leida por OpenCV -> BGR de 8 bits, con la transparencia sobre fondo blanco.

    Sin esto, los pixeles transparentes de un PNG se leen como negro y el recorte
    sale con fondo negro (un recorte de una mano recortada de su fondo, por ejemplo).
    """
    if imagen.dtype != np.uint8:  # PNG de 16 bits
        imagen = cv2.convertScaleAbs(imagen, alpha=255.0 / np.iinfo(imagen.dtype).max)
    if imagen.ndim == 2:
        return cv2.cvtColor(imagen, cv2.COLOR_GRAY2BGR)
    if imagen.shape[2] == 4:
        alfa = imagen[:, :, 3:4].astype(np.float32) / 255.0
        mezcla = imagen[:, :, :3].astype(np.float32) * alfa + 255.0 * (1.0 - alfa)
        return mezcla.round().astype(np.uint8)
    return imagen


def recorte_primer_plano(imagen: np.ndarray) -> np.ndarray:
    """Foto BGR entera -> cuadrado BGR de LADO_RECORTE con bandas negras, sin girar.

    Es la normalizacion de entrenamiento.datos.cargar_imagen (ImageOps.pad): ni
    estirar ni recortar, para que el clasificador vea lo mismo que al entrenar.
    """
    rgb = Image.fromarray(cv2.cvtColor(imagen, cv2.COLOR_BGR2RGB))
    cuadrado = np.asarray(ImageOps.pad(rgb, (LADO_RECORTE, LADO_RECORTE)))
    return cv2.cvtColor(cuadrado, cv2.COLOR_RGB2BGR)


def _como_data_url(imagen: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", imagen, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        raise ImagenInvalida("No se pudo codificar el recorte.")
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _forma_predominante(unas: list[Una]) -> str | None:
    """La forma fiable mas repetida; con empate no se elige ninguna."""
    cuentas = Counter(u.forma for u in unas if u.forma and u.forma_fiable)
    if not cuentas:
        return None
    (forma, n), *resto = cuentas.most_common()
    return None if resto and resto[0][1] == n else forma


class AnalizadorUnas:
    def __init__(
        self,
        ruta_modelo: Path,
        ruta_segmentador: Path | None = None,
        clasificador: "clinico.ClasificadorClinico | None" = None,
    ):
        if not ruta_modelo.is_file():
            raise ModeloNoDisponible(
                f"Falta {ruta_modelo}. Descargalo con services/api/scripts/descargar_modelo.sh"
            )
        opciones = vision.HandLandmarkerOptions(
            base_options=mpp.BaseOptions(model_asset_path=str(ruta_modelo)),
            num_hands=2,
            min_hand_detection_confidence=CONFIANZA_DETECCION,
            running_mode=vision.RunningMode.IMAGE,
        )
        self._detector = vision.HandLandmarker.create_from_options(opciones)
        # El segmentador es opcional: sin el, el servicio recorta las unas igual y
        # simplemente no dice su forma.
        self._segmentador: Segmentador | None = None
        if ruta_segmentador is not None and ruta_segmentador.is_file():
            try:
                self._segmentador = Segmentador(ruta_segmentador)
            except (ValueError, cv2.error) as exc:
                # Un XML danado no debe tumbar tambien la deteccion de manos.
                log.warning("Segmentador ignorado, las unas saldran sin forma: %s", exc)
        # Opcional como el segmentador; lo carga quien crea el analizador
        # (clinico.cargar_opcional) para poder inyectar uno falso en los tests.
        self._clasificador = clasificador
        # El detector es uno solo y FastAPI atiende en varios hilos.
        self._candado = threading.Lock()

    def analizar(self, contenido: bytes) -> ResultadoAnalisis:
        modelo = Modelo(nombre=NOMBRE_MODELO, version=VERSION)
        modelo_clinico = self._clasificador.modelo if self._clasificador else None
        imagen = decodificar(contenido)
        alto, ancho = imagen.shape[:2]

        if min(alto, ancho) < LADO_MINIMO:
            return ResultadoAnalisis(
                estado="no_concluyente",
                motivo="imagen_pequena",
                modo=None,
                manos=0,
                unas=[],
                modelo=modelo,
                modelo_clinico=modelo_clinico,
            )
        if max(alto, ancho) > LADO_MAXIMO:
            f = LADO_MAXIMO / max(alto, ancho)
            imagen = cv2.resize(imagen, (round(ancho * f), round(alto * f)), interpolation=cv2.INTER_AREA)
            alto, ancho = imagen.shape[:2]

        rgb = np.ascontiguousarray(cv2.cvtColor(imagen, cv2.COLOR_BGR2RGB))
        with self._candado:
            resultado = self._detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))

        unas: list[Una] = []
        for n_mano, puntos in enumerate(resultado.hand_landmarks, start=1):
            pts = np.array([[p.x * ancho, p.y * alto] for p in puntos])
            for dedo, (i_dip, i_punta) in DEDOS.items():
                if not dedo_estirado(pts, dedo):
                    continue
                dip = (puntos[i_dip].x * ancho, puntos[i_dip].y * alto)
                punta = (puntos[i_punta].x * ancho, puntos[i_punta].y * alto)
                region = region_una(dip, punta)
                if region is None:
                    continue
                if fraccion_dentro(region, ancho, alto) < FRACCION_MINIMA_DENTRO:
                    continue
                recorte = cv2.warpAffine(
                    imagen,
                    matriz_recorte(region),
                    (LADO_RECORTE, LADO_RECORTE),
                    flags=cv2.INTER_AREA,
                    borderMode=cv2.BORDER_REPLICATE,
                )
                medida = self._medir_forma(imagen, region)
                unas.append(
                    Una(
                        dedo=dedo,
                        mano=n_mano,
                        esquinas=[(x / ancho, y / alto) for x, y in esquinas_region(region)],
                        recorte=_como_data_url(recorte),
                        clinico=clinico.clasificar(self._clasificador, recorte),
                        **(
                            {
                                "forma": medida.forma,
                                "aspecto": medida.aspecto,
                                "punta": medida.punta,
                                "forma_fiable": medida.fiable,
                                "contorno": medida.contorno,
                            }
                            if medida
                            else {}
                        ),
                    )
                )

        manos = len(resultado.hand_landmarks)
        if manos == 0:
            # Solo sin mano: con mano a la vista, la foto entera no es una sola una.
            recorte = recorte_primer_plano(imagen)
            if clinico.parece_una(self._clasificador, recorte):
                una = Una(
                    dedo=None,
                    mano=None,
                    esquinas=ESQUINAS_FOTO,
                    recorte=_como_data_url(recorte),
                    clinico=clinico.clasificar(self._clasificador, recorte),
                )
                return ResultadoAnalisis(
                    estado="ok",
                    modo="primer_plano",
                    manos=0,
                    unas=[una],
                    modelo=modelo,
                    modelo_clinico=modelo_clinico,
                )
        if not unas:
            # Con mano detectada pero sin una usable, decir "no hay mano" seria falso.
            motivo = "unas_no_visibles" if manos else "sin_mano"
            return ResultadoAnalisis(
                estado="no_concluyente",
                motivo=motivo,
                modo=None,
                manos=manos,
                unas=[],
                modelo=modelo,
                modelo_clinico=modelo_clinico,
            )
        # Sin resultado clinico agregado por foto ni por mano: cada una lleva el suyo.
        return ResultadoAnalisis(
            estado="ok",
            modo="mano_completa",
            manos=manos,
            unas=unas,
            forma_predominante=_forma_predominante(unas),
            modelo=modelo,
            modelo_clinico=modelo_clinico,
        )

    @property
    def clasifica(self) -> bool:
        """True si hay clasificador clinico; sin el, las unas salen con modelo_no_entrenado."""
        return self._clasificador is not None

    @property
    def mide_forma(self) -> bool:
        """True si hay segmentador cargado; sin el, las unas salen con forma=None."""
        return self._segmentador is not None

    def _medir_forma(self, imagen: np.ndarray, region) -> "modulo_forma.MedidaForma | None":
        if self._segmentador is None:
            return None
        # El segmentador se entreno con recortes de este mismo lado y esta misma geometria.
        chico = cv2.warpAffine(
            imagen,
            matriz_recorte(region, LADO_SEGMENTADOR),
            (LADO_SEGMENTADOR, LADO_SEGMENTADOR),
            flags=cv2.INTER_AREA,
            borderMode=cv2.BORDER_REPLICATE,
        )
        mascara = self._segmentador.segmentar(chico)
        return None if mascara is None else modulo_forma.medir(mascara)
