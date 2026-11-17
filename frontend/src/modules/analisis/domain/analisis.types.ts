/**
 * Contrato de POST /vision/analizar. Espeja services/api/app/vision/esquemas.py:
 * si cambia alla, cambia aqui.
 */

export type Dedo = 'pulgar' | 'indice' | 'medio' | 'anular' | 'menique'

export type Forma = 'almendra' | 'cuadrada' | 'ovalada' | 'redonda' | 'stiletto'

export interface UnaDetectada {
  dedo: Dedo
  /** Numero de mano dentro de la foto, desde 1. */
  mano: number
  /** Cuatro esquinas del recorte sobre la foto original, normalizadas 0..1. */
  esquinas: [number, number][]
  /** JPEG de 224x224 como data URL, con el dedo hacia arriba. */
  recorte: string
  /**
   * Forma segun una regla geometrica sobre el contorno de la una, no el juicio de una
   * profesional. null si no se pudo trazar un contorno creible.
   */
  forma: Forma | null
  /** Largo / ancho de la una. null si forma es null. */
  aspecto: number | null
  /** Ancho del extremo / ancho maximo. null si forma es null. */
  punta: number | null
  /** false en almendra y stiletto: la regla las confunde con unas vistas de lado. */
  forma_fiable: boolean
  /** Contorno de la una en coordenadas 0..1 del recorte. Vacio si no hay forma. */
  contorno: [number, number][]
  /**
   * Opcional solo para tolerar un servicio anterior al reporte clinico, que no lo
   * envia. No se lee directo: se pasa por clinicoDe(), que resuelve la ausencia.
   */
  clinico?: Clinico
}

/**
 * Ids publicos del clasificador clinico. `otra` existe en el modelo pero nunca sale
 * del servicio. El frontend no traduce estos ids: los nombres llegan en
 * reporte.nombre y alternativas[].nombre.
 */
export type ClaseClinica =
  | 'linea_beau'
  | 'linea_oscura'
  | 'acropaquia'
  | 'linea_mees'
  | 'onicolisis'
  | 'una_terry'
  | 'mancha_blanca'
  | 'sin_senales'

export type MotivoClinico =
  | 'modelo_no_entrenado'
  | 'confianza_baja'
  | 'clase_otra'
  | 'clasificacion_fallida'

export interface ReporteClinico {
  nombre: string
  descripcion: string
  asociaciones: string[]
  recomendacion: string
}

export interface AlternativaClinica {
  clase: ClaseClinica
  nombre: string
  /** Probabilidad bruta del softmax (9 clases). No se muestra en la UI. */
  confianza: number
}

/**
 * Union discriminada que reproduce las invariantes del servicio: sin comprobar
 * estado === 'ok' el compilador no deja leer reporte ni clase. En no concluyente no
 * viaja ninguna suposicion, porque exponerla anularia la abstencion.
 */
export type Clinico =
  | {
      estado: 'ok'
      motivo: null
      clase: ClaseClinica
      /** Probabilidad bruta del softmax (9 clases). No se muestra en la UI. */
      confianza: number
      alternativas: [AlternativaClinica, AlternativaClinica]
      reporte: ReporteClinico
    }
  | {
      estado: 'no_concluyente'
      motivo: MotivoClinico
      clase: null
      confianza: null
      alternativas: []
      reporte: null
    }

export interface Modelo {
  nombre: string
  version: string
}

export type MotivoNoConcluyente = 'sin_mano' | 'imagen_pequena' | 'unas_no_visibles'

export interface ResultadoAnalisis {
  estado: 'ok' | 'no_concluyente'
  motivo: MotivoNoConcluyente | null
  manos: number
  unas: UnaDetectada[]
  /** Forma fiable mas repetida; null si hay empate o ninguna una se pudo medir. */
  forma_predominante: Forma | null
  aviso: string
  modelo: Modelo
  /** Opcional por la misma razon que UnaDetectada.clinico: servicio anterior. */
  aviso_clinico?: string
  /** null cuando el servicio no tiene clasificador clinico cargado. */
  modelo_clinico?: Modelo | null
}

/** Codigos de error del API, mas los que se originan en el navegador. */
export type CodigoErrorAnalisis =
  | 'imagen_invalida'
  | 'imagen_muy_grande'
  | 'modelo_no_disponible'
  | 'servicio_no_disponible'
  | 'cancelado'

export class ErrorAnalisis extends Error {
  readonly codigo: CodigoErrorAnalisis

  constructor(codigo: CodigoErrorAnalisis, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorAnalisis'
    this.codigo = codigo
  }
}

export const ETIQUETA_DEDO: Record<Dedo, string> = {
  pulgar: 'Pulgar',
  indice: 'Índice',
  medio: 'Medio',
  anular: 'Anular',
  menique: 'Meñique',
}

export const ETIQUETA_FORMA: Record<Forma, string> = {
  almendra: 'Almendra',
  cuadrada: 'Cuadrada',
  ovalada: 'Ovalada',
  redonda: 'Redonda',
  stiletto: 'Stiletto',
}
