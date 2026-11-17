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
   * Siempre presente, tambien sin clasificador clinico. analisis.api.ts rechaza la
   * respuesta si falta o esta fuera de rango, asi que aqui ya llega valida.
   */
  calidad: CalidadUna
  /**
   * Opcional solo para tolerar un servicio anterior al reporte clinico, que no lo
   * envia. No se lee directo: se pasa por clinicoDe(), que resuelve la ausencia.
   */
  clinico?: Clinico
}

/**
 * Medicion (no interpretacion) del recorte que ve el clasificador clinico: lo que el
 * servicio usa para decidir foto_insuficiente. No se muestra en la UI.
 */
export interface CalidadUna {
  /** Media del gris del recorte, 0..255. */
  brillo: number
  /** Lado en pixeles de la zona de la foto de la que sale el recorte. Entero >= 0. */
  lado_origen: number
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
  /** Recorte demasiado oscuro o pequeno: el servicio no llega a preguntar al modelo. */
  | 'foto_insuficiente'
  | 'confianza_baja'
  | 'clase_otra'
  /** La clase predicha es una que el modelo no nombra. El motivo no dice cual. */
  | 'clase_no_fiable'
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
 * estado === 'ok' (o 'senal_inespecifica') el compilador no deja leer reporte ni
 * clase. En no concluyente y en senal_inespecifica no viaja ninguna suposicion de
 * clase, porque exponerla anularia la abstencion.
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
  | {
      /**
       * El modelo no puede nombrar una senal, pero la suma de las 7 supera su umbral:
       * se dice que se ve alguna, sin decir cual. Sin motivo (delataria si la clase era
       * una no fiable) y con un reporte generico sin asociaciones (una causa delataria
       * la senal).
       */
      estado: 'senal_inespecifica'
      motivo: null
      clase: null
      confianza: null
      alternativas: []
      reporte: ReporteClinico
      /** Suma de las probabilidades de las 7 senales, 0..1. No se muestra en la UI. */
      p_alguna_senal: number
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
