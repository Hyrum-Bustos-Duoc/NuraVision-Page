"""Contrato de datos de POST /vision/analizar.

El mismo shape lo consume el frontend (frontend/src/modules/analisis/domain).
Si cambia un campo aqui, hay que cambiarlo alla.
"""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, model_validator

AVISO = "Observacion estetica orientativa. No es un diagnostico medico."
# Texto exacto de design.md (reporte-clinico-unas). Lleva tildes porque se
# muestra tal cual en la pantalla.
AVISO_CLINICO = (
    "Señal orientativa para consultar con un profesional de la salud. "
    "No es un diagnóstico médico ni reemplaza una evaluación clínica."
)

Dedo = Literal["pulgar", "indice", "medio", "anular", "menique"]
# sin_mano: no hay mano y la foto tampoco parece un primer plano de una una.
# unas_no_visibles: hay mano, pero ninguna una se ve (dedos doblados o cortados por el borde).
Motivo = Literal["sin_mano", "imagen_pequena", "unas_no_visibles"]
# mano_completa: MediaPipe encontro la mano y cada una sale de sus puntos.
# primer_plano: no hubo mano, pero la foto entera se parece a las fotos de una sola
# una con que se entreno el clasificador clinico (ver unas.py). Se desconoce el dedo.
Modo = Literal["mano_completa", "primer_plano"]
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
    "foto_insuficiente",  # recorte bajo la calidad_minima del modelo; no se le pregunta
    "confianza_baja",  # bajo el umbral, o el modelo no tiene umbral
    "clase_otra",  # la clase predicha es "otra"
    "clase_no_fiable",  # la clase predicha esta en clases_no_fiables del modelo; no se nombra
    "clasificacion_fallida",  # excepcion al clasificar ESTA una
]


# Lo que String.prototype.trim() quita (ECMA-262, WhiteSpace + LineTerminator):
# tab, VT, FF, espacio, NBSP, BOM, los Zs y LF, CR, U+2028, U+2029. Ni str.strip()
# ni strip_whitespace de Pydantic coinciden: ninguno quita el BOM, y los dos quitan
# U+0085 (str.strip() tambien U+001C-U+001F). Se usa este
# conjunto para que servicio y front (esTexto en domain/clinico.ts) rechacen lo
# mismo. U+200B (ZWSP) y U+180E no estan en ninguno de los dos: no son espacio.
ESPACIOS_JS = (
    "\t\v\f \xa0\ufeff"
    "\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u202f\u205f\u3000"
    "\n\r\u2028\u2029"
)


def _recortar_como_js(v: str) -> str:
    v = v.strip(ESPACIOS_JS)
    if not v:
        raise ValueError("texto vacio tras quitar espacios")
    return v


# Texto que se muestra: sin espacios sobrantes y no vacio. Un textos_clinicos.toml
# con nombre = "   " o asociaciones = [""] debe fallar al cargar, no salir como
# un hueco en pantalla; el front trata esos textos como contrato roto (QA 2026-11-17).
Texto = Annotated[str, AfterValidator(_recortar_como_js)]


class ReporteClinico(BaseModel):
    nombre: Texto
    # Lo que se ve, no lo que la persona padece.
    descripcion: Texto
    # Vacia solo en sin_senales; lo exige quien carga los textos (clinico.py).
    asociaciones: list[Texto]
    recomendacion: Texto


class AlternativaClinica(BaseModel):
    clase: ClaseClinica
    nombre: Texto
    confianza: float = Field(ge=0, le=1)


class CalidadUna(BaseModel):
    """Medicion (no interpretacion) del recorte que ve el clasificador clinico.

    Solo brillo y lado: son lo que el modelo usa para decidir foto_insuficiente.
    La nitidez se probo y no separo fotos buenas de malas (services/vision,
    degradaciones.py), asi que no se mide.
    """

    # Media del gris BT.601 (0-255) del recorte de 224, como degradaciones.brillo.
    brillo: float = Field(ge=0, le=255)
    # Lado, en pixeles de la foto (ya reducida a LADO_MAXIMO), de la zona de la que
    # sale el recorte. En primer_plano, el lado menor de la foto.
    lado_origen: int = Field(ge=0)


class Clinico(BaseModel):
    """Senal clinica orientativa de una una, o la abstencion con su motivo.

    Cuando no es concluyente no viaja ninguna suposicion (ni clase ni
    alternativas): si se expusieran, la abstencion dejaria de servir.
    senal_inespecifica: el modelo no puede nombrar una clase, pero la suma de
    las 7 senales supera umbral_alguna_senal. Se dice que se ve alguna senal, sin
    decir cual: ni clase, ni alternativas, ni motivo (el motivo delataria si la
    clase era una no fiable).
    """

    estado: Literal["ok", "no_concluyente", "senal_inespecifica"]
    motivo: MotivoClinico | None
    clase: ClaseClinica | None
    # Probabilidad bruta del softmax sobre las 9 clases (sin renormalizar al
    # quitar "otra"), redondeada a 3 decimales por quien la produce.
    confianza: float | None = Field(ge=0, le=1)
    alternativas: list[AlternativaClinica]
    reporte: ReporteClinico | None
    # Suma de las probabilidades brutas de las 7 senales, redondeada a 3 decimales.
    # Solo en senal_inespecifica, donde hace de confianza del hallazgo.
    p_alguna_senal: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def _invariantes(self) -> "Clinico":
        if self.estado != "senal_inespecifica" and self.p_alguna_senal is not None:
            raise ValueError("p_alguna_senal solo va en senal_inespecifica")
        if self.estado == "senal_inespecifica":
            if self.p_alguna_senal is None or self.reporte is None:
                raise ValueError("senal_inespecifica exige p_alguna_senal y reporte")
            if self.motivo is not None or self.clase is not None or self.confianza is not None or self.alternativas:
                raise ValueError("senal_inespecifica no lleva motivo, clase, confianza ni alternativas")
            # Una asociacion es una causa posible de UNA senal: delataria cual se vio.
            if self.reporte.asociaciones:
                raise ValueError("el reporte de senal_inespecifica no lleva asociaciones")
            return self
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
    # None en primer_plano: sin la mano no se sabe de que dedo es.
    dedo: Dedo | None
    # Numero de mano dentro de la foto, desde 1. No se dice izquierda o derecha:
    # MediaPipe asume imagen espejada y en una foto normal da la etiqueta al reves.
    # None en primer_plano.
    mano: int | None = Field(ge=1)
    # Cuatro esquinas del recorte sobre la foto original, en coordenadas
    # normalizadas 0..1 (x, y). Sirven para dibujar el recuadro encima. En
    # primer_plano son las de la foto entera.
    esquinas: list[tuple[float, float]] = Field(min_length=4, max_length=4)
    # JPEG de 224x224 como data URL. En mano_completa, con el dedo apuntando hacia
    # arriba; en primer_plano, la foto entera con bandas negras y sin girar.
    recorte: str
    # Forma segun una regla geometrica sobre el contorno de la una (no el juicio de
    # una profesional). None si no se pudo trazar un contorno creible, y siempre en
    # primer_plano (el segmentador necesita el recorte alineado con el dedo).
    forma: Forma | None = None
    # largo / ancho de la una y ancho de su extremo / ancho maximo. None si forma es None.
    aspecto: float | None = None
    punta: float | None = None
    # False en almendra y stiletto: la regla las confunde con unas vistas de lado.
    forma_fiable: bool = False
    # Contorno de la una en coordenadas 0..1 del recorte (x, y). Vacio si no hay forma.
    contorno: list[tuple[float, float]] = Field(default_factory=list)
    # Siempre presente, tambien sin clasificador clinico: es una medicion del recorte.
    calidad: CalidadUna
    # Siempre presente: sin clasificador clinico es no_concluyente/modelo_no_entrenado.
    clinico: Clinico


class Modelo(BaseModel):
    nombre: str
    version: str


class ResultadoAnalisis(BaseModel):
    # "ok": se detecto al menos una una. "no_concluyente": no se pudo, ver motivo.
    estado: Literal["ok", "no_concluyente"]
    motivo: Motivo | None = None
    # Como se obtuvieron las unas. None solo en no_concluyente. Obligatorio (sin
    # default) para que ningun camino de analizar() se olvide de decirlo.
    modo: Modo | None
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

    @model_validator(mode="after")
    def _invariantes(self) -> "ResultadoAnalisis":
        if (self.estado == "ok") != (self.modo is not None) or (self.estado == "ok") != bool(self.unas):
            raise ValueError("ok exige modo y unas; no_concluyente no lleva ninguno")
        if self.modo == "primer_plano":
            # Una sola: el clasificador ve la foto entera, no sabe separar varias unas.
            if self.manos != 0 or len(self.unas) != 1:
                raise ValueError("primer_plano lleva 0 manos y exactamente 1 una")
            u = self.unas[0]
            if u.dedo is not None or u.mano is not None or u.forma is not None:
                raise ValueError("primer_plano no lleva dedo, mano ni forma")
        elif any(u.dedo is None or u.mano is None for u in self.unas):
            raise ValueError("mano_completa exige dedo y mano en cada una")
        return self


class ErrorApi(BaseModel):
    # Codigo estable para que el frontend decida el mensaje; "detalle" es solo
    # para humanos y los logs.
    codigo: Literal["imagen_invalida", "imagen_muy_grande", "modelo_no_disponible"]
    detalle: str
