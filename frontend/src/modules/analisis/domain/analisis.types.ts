/**
 * Contrato de POST /vision/analizar. Espeja services/api/app/vision/esquemas.py:
 * si cambia alla, cambia aqui.
 */

export type Dedo = 'pulgar' | 'indice' | 'medio' | 'anular' | 'menique'

export type Forma = 'almendra' | 'cuadrada' | 'ovalada' | 'redonda' | 'stiletto'

/**
 * Como se obtuvieron las unas. mano_completa: se encontro la mano y cada una sale de
 * sus puntos. primer_plano: no hubo mano, pero la foto entera parece una sola una vista
 * de cerca; se analiza como una una sin dedo, sin mano y sin forma.
 */
export type Modo = 'mano_completa' | 'primer_plano'

export interface UnaDetectada {
  /** null en primer_plano: sin la mano no se sabe de que dedo es. */
  dedo: Dedo | null
  /** Numero de mano dentro de la foto, desde 1. null en primer_plano. */
  mano: number | null
  /**
   * Cuatro esquinas del recorte sobre la foto original, normalizadas 0..1. En
   * primer_plano son las de la foto entera.
   */
  esquinas: [number, number][]
  /**
   * JPEG de 224x224 como data URL. En mano_completa, con el dedo hacia arriba; en
   * primer_plano, la foto entera con bandas negras y sin girar.
   */
  recorte: string
  /**
   * Forma segun una regla geometrica sobre el contorno de la una, no el juicio de una
   * profesional. null si no se pudo trazar un contorno creible, y siempre en primer_plano.
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
      /**
       * El servicio envia 2; clinicoDe quita las de CLASES_OCULTAS, asi que pueden
       * quedar menos. La UI no depende del numero.
       */
      alternativas: AlternativaClinica[]
      reporte: ReporteClinico
    }
  | {
      estado: 'no_concluyente'
      /**
       * senal_no_mostrada no llega del servicio: lo pone clinicoDe cuando la clase
       * predicha es una que no se muestra (CLASES_OCULTAS en clinico.ts).
       */
      motivo: MotivoClinico | 'senal_no_mostrada'
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
  /**
   * null en no_concluyente. Opcional solo para tolerar un servicio anterior al modo
   * primer_plano, que no lo envia; su ausencia equivale a mano_completa.
   */
  modo?: Modo | null
  /** 0 en primer_plano. */
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

/**
 * Rotulo de una una en la tarjeta y en el reporte: el dedo, y la mano solo si hay
 * varias. null en primer_plano, donde no se sabe el dedo: la UI omite el rotulo en
 * vez de pintarlo vacio.
 */
export function rotuloUna({ dedo, mano }: UnaDetectada, variasManos: boolean): string | null {
  if (dedo === null) return null
  return variasManos && mano !== null ? `${ETIQUETA_DEDO[dedo]} · mano ${mano}` : ETIQUETA_DEDO[dedo]
}

export const ETIQUETA_FORMA: Record<Forma, string> = {
  almendra: 'Almendra',
  cuadrada: 'Cuadrada',
  ovalada: 'Ovalada',
  redonda: 'Redonda',
  stiletto: 'Stiletto',
}
