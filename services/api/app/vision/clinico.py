"""Senal clinica orientativa por una: carga del clasificador, entrada y abstencion.

No es un diagnostico. El clasificador (.tflite exportado por
services/vision/entrenamiento con la tarea "estado_clinico") es opcional: sin
el, o si algo de lo que exige design.md no cuadra, cada una sale
no_concluyente / modelo_no_entrenado y el resto del analisis sigue igual.

Privacidad: nada de este modulo escribe en logs la imagen, el recorte, la
clase, la confianza ni los textos. Solo rutas de archivos del servidor y tipos
de excepcion.
"""

import hashlib
import json
import logging
import re
import threading
import tomllib
import warnings
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import get_args

import cv2
import numpy as np
from ai_edge_litert.interpreter import Interpreter

from .esquemas import AlternativaClinica, ClaseClinica, Clinico, Modelo, MotivoClinico, ReporteClinico

log = logging.getLogger(__name__)

TAREA = "estado_clinico"
CLASES_PUBLICAS: tuple[str, ...] = get_args(ClaseClinica)
OTRA = "otra"
SIN_SENALES = "sin_senales"
# Lista cerrada (design.md, decision 2): el modelo debe traer exactamente estas
# 9 etiquetas. Ni una mas (tampoco "melanoma") ni una menos.
CLASES_MODELO = frozenset((*CLASES_PUBLICAS, OTRA))
# Lado de entrada del modelo: el mismo recorte de 224 del servicio, que es el
# lado de services/vision/config.toml. Se comprueba contra el .tflite al cargar.
LADO = 224
N_ALTERNATIVAS = 2
# Media de los embeddings de las fotos de ajuste y umbral de coseno para el camino
# primer_plano. Lo escribe scripts/referencia_primer_plano.py junto al modelo.
ARCHIVO_REFERENCIA = "referencia_primer_plano.json"
# Salida del pooling global de MobileNetV3, la entrada de la capa densa final.
TENSOR_EMBEDDING = re.compile(r"/avg_pool(_\d+)?/Mean$")


def no_concluyente(motivo: MotivoClinico) -> Clinico:
    return Clinico(estado="no_concluyente", motivo=motivo, clase=None, confianza=None, alternativas=[], reporte=None)


SIN_MODELO = no_concluyente("modelo_no_entrenado")


class ClasificadorNoDisponible(RuntimeError):
    pass


@dataclass(frozen=True)
class ReferenciaUna:
    media: np.ndarray  # vector unitario
    umbral: float  # coseno minimo con la media para aceptar la foto como una


@dataclass(frozen=True)
class ClasificadorClinico:
    # Tensor (LADO, LADO, 3) float32 -> probabilidades (n_etiquetas,). Se inyecta
    # para poder probar la abstencion con un clasificador falso.
    predecir: Callable[[np.ndarray], np.ndarray]
    etiquetas: tuple[str, ...]
    umbral_no_concluyente: float | None
    umbral_sin_senales: float | None
    textos: dict[str, ReporteClinico]
    modelo: Modelo
    # Mismo tensor de entrada -> embedding (D,). None si el modelo no lo expone.
    embeber: Callable[[np.ndarray], np.ndarray] | None = None
    # None si no hay referencia valida para este modelo: sin ella no hay primer_plano.
    referencia: ReferenciaUna | None = None


def entrada(recorte_bgr: np.ndarray) -> np.ndarray:
    """Recorte BGR uint8 del servicio -> RGB float32 0-255, igual que
    entrenamiento.datos.cargar_imagen. Confundir BGR con RGB no da error: solo
    degrada el modelo sin que nadie lo note."""
    return cv2.cvtColor(recorte_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)


def decidir(probs: np.ndarray, c: ClasificadorClinico) -> Clinico:
    """Reglas 3-6 de la decision 5 de design.md, en ese orden. Las 1 y 2 estan en clasificar()."""
    i = int(np.argmax(probs))
    clase, confianza = c.etiquetas[i], float(probs[i])
    if clase == OTRA:  # antes que la confianza: "otra" no se afirma ni con 0.99
        return no_concluyente("clase_otra")
    if c.umbral_no_concluyente is None or confianza < c.umbral_no_concluyente:
        return no_concluyente("confianza_baja")
    if clase == SIN_SENALES and (c.umbral_sin_senales is None or confianza < c.umbral_sin_senales):
        return no_concluyente("confianza_baja")
    # Ordenadas por la probabilidad bruta; sorted es estable, asi que un empate
    # se resuelve por el orden de etiquetas.json y el resultado es reproducible.
    # Nunca se ofrece "sin_senales" como alternativa de una senal: sugeriria que
    # la persona podria no tener nada y debilitaria la recomendacion (QA 2026-11-12).
    excluidas = {OTRA, SIN_SENALES, clase}
    candidatas = sorted(
        (j for j, e in enumerate(c.etiquetas) if e not in excluidas), key=lambda j: -float(probs[j])
    )[:N_ALTERNATIVAS]
    return Clinico(
        estado="ok",
        motivo=None,
        clase=clase,
        confianza=round(confianza, 3),
        alternativas=[
            AlternativaClinica(
                clase=c.etiquetas[j], nombre=c.textos[c.etiquetas[j]].nombre, confianza=round(float(probs[j]), 3)
            )
            for j in candidatas
        ],
        reporte=c.textos[clase],
    )


def clasificar(clasificador: ClasificadorClinico | None, recorte_bgr: np.ndarray) -> Clinico:
    """Bloque clinico de una una. Nunca lanza: un fallo aqui no tumba la forma ni las otras unas."""
    if clasificador is None:
        return SIN_MODELO
    try:
        probs = np.asarray(clasificador.predecir(entrada(recorte_bgr)), dtype=np.float64).reshape(-1)
        if probs.shape != (len(clasificador.etiquetas),) or not np.all(np.isfinite(probs)):
            raise ValueError("salida del clasificador con forma o valores invalidos")
        return decidir(probs, clasificador)
    except Exception as exc:  # cualquier fallo de esta una -> clasificacion_fallida, no 5xx
        # Solo el tipo: el mensaje podria arrastrar valores del tensor o de la salida.
        log.warning("Clasificacion clinica fallida en una una (%s)", type(exc).__name__)
        return no_concluyente("clasificacion_fallida")


def parece_una(clasificador: ClasificadorClinico | None, recorte_bgr: np.ndarray) -> bool:
    """True si el recorte se parece a las fotos de una sola una con que se entreno el modelo.

    Es la puerta del camino primer_plano. decidir() no basta: medido el
    2026-11-17, el modelo da una clase confiada a 19 de 44 fotos que no son unas
    (paisajes, objetos) y a 48 de 158 recortes de piel sin una. Esta puerta
    compara el embedding del recorte con la media de los de entrenamiento.
    Nunca lanza: ante un fallo responde False, y la foto sale sin_mano.
    """
    if clasificador is None or clasificador.embeber is None or clasificador.referencia is None:
        return False
    ref = clasificador.referencia
    try:
        e = np.asarray(clasificador.embeber(entrada(recorte_bgr)), dtype=np.float64).reshape(-1)
        if e.shape != ref.media.shape or not np.all(np.isfinite(e)):
            raise ValueError("embedding con forma o valores invalidos")
        norma = float(np.linalg.norm(e))
        return norma > 0 and float(e @ ref.media) / norma >= ref.umbral
    except Exception as exc:  # como clasificar(): solo el tipo, nunca valores
        log.warning("Comparacion de primer plano fallida (%s)", type(exc).__name__)
        return False


# --- carga -------------------------------------------------------------------


def cargar_textos(ruta: Path) -> dict[str, ReporteClinico]:
    """Lee el archivo de textos y exige una entrada valida por cada id publico."""
    try:
        datos = tomllib.loads(ruta.read_text(encoding="utf-8"))
    # RecursionError: un TOML muy anidado la lanza y tumbaria el arranque (QA 2026-11-12).
    except (OSError, tomllib.TOMLDecodeError, UnicodeDecodeError, RecursionError) as exc:
        raise ClasificadorNoDisponible(f"{ruta}: no se pudo leer ({type(exc).__name__})") from exc
    if datos.get("estado_revision") not in ("pendiente", "revisado"):
        raise ClasificadorNoDisponible(f"{ruta}: estado_revision debe ser 'pendiente' o 'revisado'")
    clases = datos.get("clases")
    if not isinstance(clases, dict) or set(clases) != set(CLASES_PUBLICAS):
        raise ClasificadorNoDisponible(f"{ruta}: [clases] debe tener exactamente los ids {sorted(CLASES_PUBLICAS)}")
    textos = {}
    for clase, t in clases.items():
        try:
            reporte = ReporteClinico.model_validate(t)
        except ValueError as exc:
            raise ClasificadorNoDisponible(f"{ruta}: texto de {clase} invalido") from exc
        if not reporte.asociaciones and clase != SIN_SENALES:
            raise ClasificadorNoDisponible(f"{ruta}: {clase} necesita al menos una asociacion")
        textos[clase] = reporte
    if datos["estado_revision"] == "pendiente":
        log.warning("Textos clinicos pendientes de revision profesional (%s)", ruta)
    return textos


def _umbral(metadatos: dict, clave: str) -> float | None:
    # La clave debe existir aunque valga null: un metadatos.json sin ella es de
    # una exportacion anterior a la tarea 2.3, que no calibro ese umbral.
    if clave not in metadatos:
        raise ClasificadorNoDisponible(f"metadatos.json sin {clave}")
    valor = metadatos[clave]
    if valor is None:
        return None
    if isinstance(valor, bool) or not isinstance(valor, int | float) or not 0 <= valor <= 1:
        raise ClasificadorNoDisponible(f"metadatos.json: {clave} debe ser null o un numero entre 0 y 1")
    return float(valor)


def _interprete(
    ruta: Path, n_clases: int
) -> tuple[Callable[[np.ndarray], np.ndarray], Callable[[np.ndarray], np.ndarray] | None]:
    """(predecir, embeber). embeber es None si no se encuentra el tensor del embedding."""
    try:
        # preserve_all_tensors deja leer el embedding despues de invoke(); sin el,
        # su memoria la reutilizan las capas siguientes. Cuesta ~23 MB y ningun
        # milisegundo (medido el 2026-11-17). Su aviso de "solo para depurar" se
        # silencia para no ensuciar el log en cada arranque.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            it = Interpreter(model_path=str(ruta), experimental_preserve_all_tensors=True)
        it.allocate_tensors()
    except (ValueError, RuntimeError) as exc:
        raise ClasificadorNoDisponible(f"{ruta}: no es un modelo TFLite valido ({type(exc).__name__})") from exc
    ent, sal = it.get_input_details()[0], it.get_output_details()[0]
    if tuple(ent["shape"]) != (1, LADO, LADO, 3) or tuple(sal["shape"]) != (1, n_clases):
        raise ClasificadorNoDisponible(
            f"{ruta}: entrada {tuple(ent['shape'])} y salida {tuple(sal['shape'])}; "
            f"se esperaba (1, {LADO}, {LADO}, 3) y (1, {n_clases})"
        )
    # Un modelo cuantizado a mano (int8/uint8) carga bien y luego falla en cada una:
    # el servicio entrega float32, asi que se rechaza ya al cargar (QA 2026-11-12).
    if ent["dtype"] != np.float32 or sal["dtype"] != np.float32:
        raise ClasificadorNoDisponible(f"{ruta}: el modelo debe tener entrada y salida float32")
    # Un interprete de LiteRT no admite llamadas concurrentes y FastAPI atiende en varios hilos.
    candado = threading.Lock()

    def predecir(x: np.ndarray) -> np.ndarray:
        with candado:
            it.set_tensor(ent["index"], x[None])
            it.invoke()
            return it.get_tensor(sal["index"])[0].copy()

    candidatos = [
        d["index"]
        for d in it.get_tensor_details()
        if TENSOR_EMBEDDING.search(d["name"]) and len(d["shape"]) == 2 and d["shape"][0] == 1
    ]
    if len(candidatos) != 1:
        log.info("%s: sin tensor de embedding reconocible, no habra primer plano", ruta)
        return predecir, None
    i_emb = candidatos[0]

    def embeber(x: np.ndarray) -> np.ndarray:
        with candado:
            it.set_tensor(ent["index"], x[None])
            it.invoke()
            return it.get_tensor(i_emb)[0].copy()

    return predecir, embeber


def _referencia(carpeta: Path, embeber: Callable[[np.ndarray], np.ndarray] | None) -> ReferenciaUna | None:
    """Lee ARCHIVO_REFERENCIA. Cualquier problema la deja en None (sin primer_plano) y no
    impide cargar el clasificador: el camino de mano completa no la necesita."""
    ruta = carpeta / ARCHIVO_REFERENCIA
    if embeber is None:
        return None
    if not ruta.is_file():
        log.info("Sin %s: no habra analisis de primer plano", ruta)
        return None
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        sha = hashlib.sha256((carpeta / "modelo.tflite").read_bytes()).hexdigest()
        # El embedding cambia con cualquier reentrenamiento: una referencia de otro
        # modelo aceptaria o rechazaria fotos al azar sin que nada falle.
        if datos.get("modelo_sha256") != sha:
            raise ValueError("es de otro modelo.tflite")
        media = np.asarray(datos["media"], dtype=np.float64)
        umbral = datos["umbral_coseno"]
        dimension = embeber(np.zeros((LADO, LADO, 3), np.float32)).shape
        if media.shape != dimension or not np.all(np.isfinite(media)) or not np.linalg.norm(media) > 0:
            raise ValueError(f"media debe tener forma {dimension}, valores finitos y norma no nula")
        if isinstance(umbral, bool) or not isinstance(umbral, int | float) or not 0 < umbral <= 1:
            raise ValueError("umbral_coseno debe estar en (0, 1]")
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RecursionError) as exc:
        log.warning("Referencia de primer plano ignorada (%s): %s", ruta, exc)
        return None
    return ReferenciaUna(media=media / np.linalg.norm(media), umbral=float(umbral))


def cargar(carpeta: Path, ruta_textos: Path) -> ClasificadorClinico:
    """Carpeta con modelo.tflite, etiquetas.json y metadatos.json (la de `exportado/`).

    Valida todo lo barato antes de abrir el .tflite, para que un modelo de otra
    tarea se rechace por su nombre y no por un error de forma.
    """
    try:
        etiquetas_json = json.loads((carpeta / "etiquetas.json").read_text(encoding="utf-8"))
        metadatos = json.loads((carpeta / "metadatos.json").read_text(encoding="utf-8"))
    # RecursionError: un JSON muy anidado la lanza en Python < 3.14 y tumbaria el arranque.
    except (OSError, ValueError, RecursionError) as exc:
        raise ClasificadorNoDisponible(f"{carpeta}: etiquetas.json o metadatos.json ilegible ({type(exc).__name__})") from exc
    if not isinstance(metadatos, dict) or metadatos.get("tarea") != TAREA:
        raise ClasificadorNoDisponible(f"{carpeta}: metadatos.tarea no es '{TAREA}'")
    try:
        # Formato de entrenamiento.modelo._exportar: {"0": "clase", "1": ...}.
        etiquetas = tuple(etiquetas_json[str(i)] for i in range(len(etiquetas_json)))
    except (KeyError, TypeError) as exc:
        raise ClasificadorNoDisponible(f"{carpeta}: etiquetas.json no va de 0 a n-1") from exc
    # Un valor que no es texto (lista, dict) no es hashable: set() lanzaria TypeError.
    if not all(isinstance(e, str) for e in etiquetas):
        raise ClasificadorNoDisponible(f"{carpeta}: etiquetas.json trae valores que no son texto")
    if len(etiquetas) != len(CLASES_MODELO) or set(etiquetas) != CLASES_MODELO:
        raise ClasificadorNoDisponible(f"{carpeta}: las etiquetas no son exactamente los 9 ids de estado_clinico")
    umbral_nc = _umbral(metadatos, "umbral_no_concluyente")
    umbral_ss = _umbral(metadatos, "umbral_sin_senales")
    try:
        modelo = Modelo(nombre=str(metadatos["model"]["name"]), version=str(metadatos["model"]["version"]))
    except (KeyError, TypeError) as exc:
        raise ClasificadorNoDisponible(f"{carpeta}: metadatos.json sin model.name / model.version") from exc
    textos = cargar_textos(ruta_textos)
    predecir, embeber = _interprete(carpeta / "modelo.tflite", len(etiquetas))
    return ClasificadorClinico(
        predecir=predecir,
        etiquetas=etiquetas,
        umbral_no_concluyente=umbral_nc,
        umbral_sin_senales=umbral_ss,
        textos=textos,
        modelo=modelo,
        embeber=embeber,
        referencia=_referencia(carpeta, embeber),
    )


def cargar_opcional(carpeta: Path, ruta_textos: Path) -> ClasificadorClinico | None:
    """Como cargar(), pero sin clasificador devuelve None y deja el motivo en el log."""
    if not carpeta.is_dir():
        # Estado normal hasta que el equipo entrene y copie el modelo (tarea U.5).
        log.info("Sin clasificador clinico en %s: las unas saldran con modelo_no_entrenado", carpeta)
        return None
    try:
        return cargar(carpeta, ruta_textos)
    except ClasificadorNoDisponible as exc:
        log.warning("Clasificador clinico ignorado, las unas saldran con modelo_no_entrenado: %s", exc)
        return None
