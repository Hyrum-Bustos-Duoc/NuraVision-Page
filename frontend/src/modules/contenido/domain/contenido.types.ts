/**
 * Contenido editable del sitio (Panel -> Contenido).
 *
 * Los titulos con una palabra destacada se escriben con asteriscos:
 * "Belleza en el estudio, *cuidado* en casa". Un salto de linea en el texto
 * es un salto de linea en pantalla. Ver `fragmentosConEnfasis`.
 */

export interface Enlace {
  eyebrow: string
  titulo: string
  enlace: string
}

export interface Paso {
  titulo: string
  detalle: string
}

export interface ImagenesSitio {
  /** Portada: tarjeta "El estudio". */
  portadaEstudio: string | null
  /** Portada: tarjeta "La tienda". */
  portadaTienda: string | null
  /** Banda NuraVision IA. */
  bandaIA: string | null
  /** Panel derecho del inicio de sesion. */
  login: string | null
}

export type ClaveImagen = keyof ImagenesSitio

/** Consejos de una opcion del analisis IA. El id no se edita: lo usa el codigo. */
export interface OpcionAnalisisEditable {
  label: string
  tips: { titulo: string; detalle: string }[]
}

export interface ContenidoSitio {
  anuncios: string[]
  imagenes: ImagenesSitio
  portada: {
    etiqueta: string
    titulo: string
    descripcion: string
    botonReservar: string
    botonTienda: string
    tarjetaEstudio: Enlace
    tarjetaTienda: Enlace
  }
  servicios: Enlace
  tienda: Enlace & { entregas: Paso[] }
  bandaIA: {
    eyebrow: string
    titulo: string
    pasos: Paso[]
    hallazgos: string[]
    boton: string
    aviso: string
  }
  comoFunciona: { titulo: string; pasos: Paso[] }
  equipo: Enlace
  ctaFinal: { titulo: string; descripcion: string; boton: string }
  login: { cita: string; firma: string }
  footer: {
    newsletterTitulo: string
    newsletterDestacado: string
    direccion: string
    horario: string
    telefono: string
    email: string
  }
  /** Por id de opcion: manos, piel, cuero. */
  analisis: Record<string, OpcionAnalisisEditable>
}
