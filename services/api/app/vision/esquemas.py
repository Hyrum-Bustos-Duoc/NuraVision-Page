"""Contrato de datos de POST /vision/analizar.

El mismo shape lo consume el frontend (frontend/src/modules/analisis/domain).
Si cambia un campo aqui, hay que cambiarlo alla.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

AVISO = "Observacion estetica orientativa. No es un diagnostico medico."
# Texto exacto de design.md (reporte-clinico-unas). Lleva tildes porque se
# muestra tal cual en la pantalla.
AVISO_CLINICO = (
    "Señal orientativa para consultar con un profesional de la salud. "
    "No es un diagnóstico médico ni reemplaza una evaluación clínica."
)

Dedo = Literal["pulgar", "indice", "medio", "anular", "menique"]
# unas_no_visibles: hay mano, pero ninguna una se ve (dedos doblados o cortados por el borde).
Motivo = Literal["sin_mano", "imagen_pequena", "unas_no_visibles"]
Forma = Literal["almendra", "cuadrada", "ovalada", "redonda", "stiletto"]
# Ids publicos del clasificador clinico. "otra" existe en el modelo pero nunca
# sale del servicio. "sin_senales" (y no "normal" ni "sana"): el sistema puede
# decir que no ve las senales que conoce, nunca que una una esta sana.
ClaseClinica = Literal[
    "linea_beau", "linea_oscura", "acropaquia", "linea_mees",
    "onicolisis", "una_terry", "mancha_blanca", "sin_senales",
]
MotivoClinico = Literal[
    "modelo_no_entrenado",  # no hay clasificador clinico utilizable cargado
    "confianza_baja",  # bajo el umbral, o el modelo no tiene umbral
    "clase_otra",  # la clase predicha es "otra"
    "clasificacion_fallida",  # excepcion al clasificar ESTA una
]


class ReporteClinico(BaseModel):
    nombre: str = Field(min_length=1)
    # Lo que se ve, no lo que la persona padece.
    descripcion: str = Field(min_length=1)
    # Vacia solo en sin_senales; lo exige quien carga los textos (clinico.py).
    asociaciones: list[str]
    recomendacion: str = Field(min_length=1)


class AlternativaClinica(BaseModel):
    clase: ClaseClinica
    nombre: str
    confianza: float = Field(ge=0, le=1)


class Clinico(BaseModel):
    """Senal clinica orientativa de una una, o la abstencion con su motivo.

    Cuando no es concluyente no viaja ninguna suposicion (ni clase ni
    alternativas): si se expusieran, la abstencion dejaria de servir.
    """

    estado: Literal["ok", "no_concluyente"]
    motivo: MotivoClinico | None
    clase: ClaseClinica | None
    # Probabilidad bruta del softmax sobre las 9 clases (sin renormalizar al
    # quitar "otra"), redondeada a 3 decimales por quien la produce.
    confianza: float | None = Field(ge=0, le=1)
    alternativas: list[AlternativaClinica]
    reporte: ReporteClinico | None

    @model_validator(mode="after")
    def _invariantes(self) -> "Clinico":
        if self.estado == "no_concluyente":
            if self.motivo is None:
                raise ValueError("no_concluyente exige motivo")
            if self.clase is not None or self.confianza is not None or self.alternativas or self.reporte is not None:
                raise ValueError("no_concluyente no lleva clase, confianza, alternativas ni reporte")
            return self
        if self.motivo is not None:
            raise ValueError("ok no lleva motivo")
        if self.clase is None or self.confianza is None or self.reporte is None:
            raise ValueError("ok exige clase, confianza y reporte")
        if len(self.alternativas) != 2:
            raise ValueError("ok exige exactamente 2 alternativas")
        clases = [a.clase for a in self.alternativas]
        if self.clase in clases or clases[0] == clases[1]:
            raise ValueError("las alternativas no repiten la clase predicha ni entre si")
        # "otra" ya la impide ClaseClinica. "sin_senales" como alternativa de una
        # senal sugeriria que podria no haber nada y debilitaria la recomendacion
        # (QA 2026-11-12); decidir() la excluye, y el contrato no debe depender de eso.
        if "sin_senales" in clases:
            raise ValueError("sin_senales no es una alternativa")
        if self.alternativas[0].confianza < self.alternativas[1].confianza:
            raise ValueError("las alternativas van de mayor a menor confianza")
        return self


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
    # Siempre presente: sin clasificador clinico es no_concluyente/modelo_no_entrenado.
    clinico: Clinico


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
    aviso_clinico: str = AVISO_CLINICO
    # None si no hay clasificador clinico cargado. Obligatorio (sin default) para
    # que ningun camino de analizar() se olvide de decirlo.
    modelo_clinico: Modelo | None


class ErrorApi(BaseModel):
    # Codigo estable para que el frontend decida el mensaje; "detalle" es solo
    # para humanos y los logs.
    codigo: Literal["imagen_invalida", "imagen_muy_grande", "modelo_no_disponible"]
    detalle: str
