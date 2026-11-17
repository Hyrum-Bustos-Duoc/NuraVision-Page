import type { AlternativaClinica, ClaseClinica, Clinico, UnaDetectada } from './analisis.types'

/**
 * Lo que envia el servicio sin clasificador cargado. clinicoDe lo devuelve tambien
 * para una una sin `clinico`: el contrato lo hace obligatorio y un servicio anterior
 * ya lo rechaza analisis.api.ts por no traer `calidad`, pero el JSON no se valida
 * entero y los datos de ejemplo de e2e (analisis-unas, reporte-clinico) lo omiten.
 */
export const CLINICO_NO_DISPONIBLE: Clinico = {
  estado: 'no_concluyente',
  motivo: 'modelo_no_entrenado',
  clase: null,
  confianza: null,
  alternativas: [],
  reporte: null,
}

/**
 * Respaldo del aviso si `aviso_clinico` llega ausente, vacio o sin ser texto. El
 * contrato lo hace obligatorio, pero el JSON llega sin validar y un resultado clinico
 * no debe pintarse nunca sin su aviso. Mismo texto que AVISO_CLINICO en
 * services/api/app/vision.
 */
export const AVISO_CLINICO_POR_DEFECTO =
  'Señal orientativa para consultar con un profesional de la salud. ' +
  'No es un diagnóstico médico ni reemplaza una evaluación clínica.'

/**
 * Aviso a pintar sobre el bloque clinico. Un texto vacio o solo espacios equivale a
 * no tener aviso, y `??` no lo cubre: por eso el respaldo se decide aqui. Recibe
 * unknown porque el JSON llega por red sin validar.
 */
export function avisoClinicoDe(aviso: unknown): string {
  return typeof aviso === 'string' && aviso.trim() !== '' ? aviso : AVISO_CLINICO_POR_DEFECTO
}

/**
 * Un `ok` que llega roto viola el contrato del servicio. Se trata como una
 * clasificacion fallida: es lo que es desde el punto de vista de quien mira la pantalla.
 */
const CLINICO_FALLIDO: Clinico = { ...CLINICO_NO_DISPONIBLE, motivo: 'clasificacion_fallida' }

/**
 * Un Record y no una lista: si ClaseClinica gana una clase, el compilador obliga a
 * anadirla aqui; con una lista, un ok valido de la clase nueva caeria en silencio a
 * clasificacion_fallida. `otra` no esta: nunca sale del servicio.
 */
const CLASES_CLINICAS: Record<ClaseClinica, true> = {
  linea_beau: true,
  linea_oscura: true,
  acropaquia: true,
  linea_mees: true,
  onicolisis: true,
  una_terry: true,
  mancha_blanca: true,
  sin_senales: true,
}

/**
 * Clases que el servicio puede enviar pero que nunca se muestran al usuario (decision
 * del dueno del producto, 2026-11-17). Como clase predicha, la una se presenta como no
 * concluyente con el mensaje generico, sin nombrarla; como alternativa, se quita de la
 * lista. A diferencia de NUNCA_ALTERNATIVA, no son un contrato roto.
 */
const CLASES_OCULTAS: readonly string[] = ['linea_mees', 'acropaquia']

const CLINICO_OCULTO: Clinico = { ...CLINICO_NO_DISPONIBLE, motivo: 'senal_no_mostrada' }

function esTexto(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

export function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function reporteValido(r: unknown): boolean {
  return (
    esObjeto(r) &&
    esTexto(r.nombre) &&
    esTexto(r.descripcion) &&
    esTexto(r.recomendacion) &&
    Array.isArray(r.asociaciones) &&
    r.asociaciones.every(esTexto)
  )
}

/** hasOwn y no `in`: `in` acepta 'toString' y el resto de Object.prototype. */
function esClaseClinica(v: unknown): v is ClaseClinica {
  return typeof v === 'string' && Object.hasOwn(CLASES_CLINICAS, v)
}

/** Field(ge=0, le=1) de Pydantic. El rango ya excluye NaN e Infinity. */
function esProbabilidad(v: unknown): v is number {
  return typeof v === 'number' && v >= 0 && v <= 1
}

/**
 * El nombre se exige no vacio aunque Pydantic no lo haga: la UI lo pinta. sin_senales
 * como alternativa de una senal sugeriria que podria no haber nada (QA 2026-11-12).
 */
function alternativaValida(a: unknown, clase: ClaseClinica): a is AlternativaClinica {
  return (
    esObjeto(a) &&
    esClaseClinica(a.clase) &&
    a.clase !== clase &&
    a.clase !== 'sin_senales' &&
    esTexto(a.nombre) &&
    esProbabilidad(a.confianza)
  )
}

/**
 * Mismas invariantes que Clinico._invariantes en esquemas.py: exactamente 2, distintas
 * entre si y de la predicha, de mayor a menor confianza. La UI no depende del numero
 * ni del orden, pero un ok que los incumple viene de un servicio roto y no se pinta.
 */
function alternativasValidas(alternativas: unknown, clase: ClaseClinica): boolean {
  if (!Array.isArray(alternativas) || alternativas.length !== 2) return false
  const [a, b] = alternativas
  return (
    alternativaValida(a, clase) &&
    alternativaValida(b, clase) &&
    a.clase !== b.clase &&
    a.confianza >= b.confianza
  )
}

/**
 * Unico punto que resuelve la ausencia o rotura de `clinico`. La UI no usa `?.` sobre
 * el y ramifica solo por estado ('ok' y 'senal_inespecifica' pintan reporte), asi que
 * aqui se comprueba un `ok` con las mismas invariantes que Pydantic: motivo null,
 * clase de ClaseClinica, confianza 0..1, reporte con nombre, descripcion y
 * recomendacion de texto no vacio y asociaciones como lista de textos, y alternativas
 * segun alternativasValidas. Cualquier fallo da CLINICO_FALLIDO. Las comprobaciones
 * parecen redundantes para TS, pero el JSON llega por red (analisis.api.ts solo lo
 * castea) y la union no lo valida; un dato roto que llegue a la UI tumba la pagina
 * entera.
 *
 * Despues de validar aplica CLASES_OCULTAS: una clase oculta da CLINICO_OCULTO y una
 * alternativa oculta se quita.
 *
 * Una `senal_inespecifica` se reconstruye con solo su reporte y p_alguna_senal: si el
 * servicio colara una clase o alternativas, no llegan a la UI. Un reporte roto o con
 * asociaciones (delatarian la senal), o un p_alguna_senal fuera de 0..1, da
 * CLINICO_FALLIDO.
 *
 * Un `no_concluyente` se devuelve tal cual: la UI solo lee su motivo, y un motivo
 * desconocido ya tiene mensaje generico.
 */
export function clinicoDe(una: UnaDetectada): Clinico {
  const c = una.clinico
  // El tipo dice que siempre llega; el JSON sin validar no lo garantiza (ver
  // CLINICO_NO_DISPONIBLE). Sin esta guarda, `c.estado` sobre undefined tumba la pagina.
  if (!c) return CLINICO_NO_DISPONIBLE
  if (c.estado === 'senal_inespecifica') {
    const valido =
      reporteValido(c.reporte) && c.reporte.asociaciones.length === 0 && esProbabilidad(c.p_alguna_senal)
    if (!valido) return CLINICO_FALLIDO
    const { reporte, p_alguna_senal } = c
    return { estado: 'senal_inespecifica', motivo: null, clase: null, confianza: null, alternativas: [], reporte, p_alguna_senal }
  }
  if (c.estado !== 'ok') return c
  const valido =
    c.motivo === null &&
    esClaseClinica(c.clase) &&
    esProbabilidad(c.confianza) &&
    reporteValido(c.reporte) &&
    alternativasValidas(c.alternativas, c.clase)
  if (!valido) return CLINICO_FALLIDO
  if (CLASES_OCULTAS.includes(c.clase)) return CLINICO_OCULTO
  const alternativas = c.alternativas.filter((a) => !CLASES_OCULTAS.includes(a.clase))
  return alternativas.length === c.alternativas.length ? c : { ...c, alternativas }
}

/**
 * Recibe string y no MotivoClinico: la union de TS no protege contra un motivo
 * nuevo que llegue por red, y la pantalla no debe fallar por eso.
 */
export function mensajeMotivoClinico(motivo: string): string {
  // senal_no_mostrada cae a proposito en el generico: un mensaje propio delataria
  // que hubo una senal que no se nombra.
  switch (motivo) {
    case 'modelo_no_entrenado':
      return 'El reporte clínico aún no está disponible.'
    case 'foto_insuficiente':
      return 'La foto de esta uña está muy oscura o se ve muy pequeña para revisarla. Toma otra foto con buena luz, acercando la cámara a la uña.'
    case 'confianza_baja':
      return 'No pudimos sacar una conclusión con suficiente seguridad para esta uña. Prueba con una foto más nítida y con buena luz.'
    case 'clase_otra':
      return 'Lo que vemos en esta uña no coincide con las señales que sabemos reconocer. Si notas algo que te preocupa, consulta con un profesional.'
    // No dice que hubo una senal ni cual: solo que el sistema no puede afirmar nada.
    case 'clase_no_fiable':
      return 'Con esta foto no podemos afirmar nada sobre esta uña. Si notas algo que te preocupa, consulta con un profesional.'
    case 'clasificacion_fallida':
      return 'No pudimos revisar esta uña. Intenta analizar la foto de nuevo.'
    default:
      return 'No pudimos obtener un resultado concluyente para esta uña.'
  }
}

export interface ResumenMano {
  /** null en primer_plano: la una no pertenece a una mano detectada. */
  mano: number | null
  total: number
  /**
   * ok con una clase distinta de sin_senales, o senal_inespecifica: en los dos casos
   * hay algo que conviene consultar, aunque en el segundo no se sepa que.
   */
  conSenal: number
  /** ok con sin_senales. */
  sinSenales: number
  /** Todo lo que no es ok ni senal_inespecifica, incluido un estado desconocido. */
  noConcluyentes: number
}

export type ResumenClinico =
  | { disponible: false }
  | { disponible: true; manos: ResumenMano[] }

/**
 * Resumen por mano, en el orden en que aparece cada mano. No disponible cuando
 * ninguna una tiene clasificador (todas modelo_no_entrenado o sin `clinico`): en ese
 * caso no hay nada que resumir y la UI lo dice una sola vez.
 */
export function resumenClinico(unas: UnaDetectada[]): ResumenClinico {
  const clinicos = unas.map(clinicoDe)
  const sinModelo = clinicos.every((c) => c.estado !== 'ok' && c.motivo === 'modelo_no_entrenado')
  if (unas.length === 0 || sinModelo) return { disponible: false }

  const porMano = new Map<number | null, ResumenMano>()
  unas.forEach((una, i) => {
    const c = clinicos[i]
    const r = porMano.get(una.mano) ?? { mano: una.mano, total: 0, conSenal: 0, sinSenales: 0, noConcluyentes: 0 }
    r.total++
    if (c.estado === 'senal_inespecifica') r.conSenal++
    else if (c.estado !== 'ok') r.noConcluyentes++
    else if (c.clase === 'sin_senales') r.sinSenales++
    else r.conSenal++
    porMano.set(una.mano, r)
  })
  return { disponible: true, manos: [...porMano.values()] }
}
