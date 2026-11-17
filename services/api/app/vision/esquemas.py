"""Contrato de datos de POST /vision/analizar.

El mismo shape lo consume el frontend (frontend/src/modules/analisis/domain).
Si cambia un campo aqui, hay que cambiarlo alla.
"""

from typing import Literal

from pydantic import BaseModel, Field

AVISO = "Observacion estetica orientativa. No es un diagnostico medico."

Dedo = Literal["pulgar", "indice", "medio", "anular", "menique"]
# unas_no_visibles: hay mano, pero ninguna una se ve (dedos doblados o cortados por el borde).
Motivo = Literal["sin_mano", "imagen_pequena", "unas_no_visibles"]
Forma = Literal["almendra", "cuadrada", "ovalada", "redonda", "stiletto"]


class Una(BaseModel):
    dedo: Dedo
    # Numero de mano dentro de la foto, desde 1. No se dice izquierda o derecha:
    # MediaPipe asume imagen espejada y en una foto normal da la etiqueta al reves.
    mano: int = Field(ge=1)
    # Cuatro esquinas del recorte sobre la foto original, en coordenadas
    # normalizadas 0..1 (x, y). Sirven para dibujar el recuadro encima.
    esquinas: list[tuple[float, float]] = Field(min_length=4, max_length=4)
    # JPEG de 224x224 como data URL, con el dedo apuntando hacia arriba.
    recorte: str
    # Forma segun una regla geometrica sobre el contorno de la una (no el juicio de
    # una profesional). None si no se pudo trazar un contorno creible.
    forma: Forma | None = None
    # largo / ancho de la una y ancho de su extremo / ancho maximo. None si forma es None.
    aspecto: float | None = None
    punta: float | None = None
    # False en almendra y stiletto: la regla las confunde con unas vistas de lado.
    forma_fiable: bool = False
    # Contorno de la una en coordenadas 0..1 del recorte (x, y). Vacio si no hay forma.
    contorno: list[tuple[float, float]] = Field(default_factory=list)


class Modelo(BaseModel):
    nombre: str
    version: str


class ResultadoAnalisis(BaseModel):
    # "ok": se detecto al menos una una. "no_concluyente": no se pudo, ver motivo.
    estado: Literal["ok", "no_concluyente"]
    motivo: Motivo | None = None
    manos: int = Field(ge=0)
    unas: list[Una]
    # Forma mas frecuente entre las unas con forma fiable. None si no hay una forma
    # que predomine (empate o ninguna una medida).
    forma_predominante: Forma | None = None
    aviso: str = AVISO
    modelo: Modelo


class ErrorApi(BaseModel):
    # Codigo estable para que el frontend decida el mensaje; "detalle" es solo
    # para humanos y los logs.
    codigo: Literal["imagen_invalida", "imagen_muy_grande", "modelo_no_disponible"]
    detalle: str
