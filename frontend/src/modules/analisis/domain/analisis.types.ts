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
  modelo: { nombre: string; version: string }
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
