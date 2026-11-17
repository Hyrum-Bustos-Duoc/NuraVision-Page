import type { Clinico, UnaDetectada } from './analisis.types'

/**
 * Lo que vale `clinico` cuando el servicio no lo envia (version anterior al reporte
 * clinico). Equivale a un servicio sin clasificador cargado.
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
 * Respaldo del aviso si llega un bloque clinico sin `aviso_clinico`. El servicio
 * siempre lo envia junto con `clinico`, pero el tipo lo declara opcional y un
 * resultado clinico no debe pintarse nunca sin su aviso. Mismo texto que
 * AVISO_CLINICO en services/api/app/vision.
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
 * Clases que el servicio nunca envia como alternativa (ademas de la predicha). La spec
 * prohibe mostrarlas, y si llegan el bloque entero es sospechoso: no se filtran, se
 * descarta el ok.
 */
const NUNCA_ALTERNATIVA: readonly string[] = ['sin_senales', 'otra']

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

/** No exige exactamente 2: la UI no depende del numero, solo de que cada una se pueda pintar. */
function alternativasValidas(alternativas: unknown, clase: string): boolean {
  return (
    Array.isArray(alternativas) &&
    alternativas.every(
      (a) =>
        esObjeto(a) &&
        typeof a.clase === 'string' &&
        a.clase !== clase &&
        !NUNCA_ALTERNATIVA.includes(a.clase) &&
        esTexto(a.nombre) &&
        typeof a.confianza === 'number',
    )
  )
}

/**
 * Unico punto que resuelve la ausencia o rotura de `clinico`. La UI no usa `?.` sobre
 * el y ramifica solo por estado ('ok' y 'senal_inespecifica' pintan reporte), asi que
 * aqui se comprueba la forma completa de un `ok`: clase de texto, reporte con nombre, descripcion y recomendacion de texto
 * no vacio y asociaciones como lista de textos, y alternativas como lista de objetos
 * con clase, nombre de texto y confianza numerica, sin sin_senales, otra ni la clase
 * predicha. Cualquier fallo da CLINICO_FALLIDO. Las comprobaciones parecen redundantes
 * para TS, pero el JSON llega por red (analisis.api.ts solo lo castea) y la union no
 * lo valida; un dato roto que llegue a la UI tumba la pagina entera.
 *
 * Despues de validar aplica CLASES_OCULTAS: una clase oculta da CLINICO_OCULTO y una
 * alternativa oculta se quita.
 *
 * Una `senal_inespecifica` se reconstruye con solo su reporte y p_alguna_senal: si el
 * servicio colara una clase o alternativas, no llegan a la UI. Un reporte roto o con
 * asociaciones (delatarian la senal) da CLINICO_FALLIDO.
 *
 * Un `no_concluyente` se devuelve tal cual: la UI solo lee su motivo, y un motivo
 * desconocido ya tiene mensaje generico.
 */
export function clinicoDe(una: UnaDetectada): Clinico {
  const c = una.clinico
  if (!c) return CLINICO_NO_DISPONIBLE
  if (c.estado === 'senal_inespecifica') {
    if (!reporteValido(c.reporte) || c.reporte.asociaciones.length > 0) return CLINICO_FALLIDO
    const { reporte, p_alguna_senal } = c
    return { estado: 'senal_inespecifica', motivo: null, clase: null, confianza: null, alternativas: [], reporte, p_alguna_senal }
  }
  if (c.estado !== 'ok') return c
  const valido =
    typeof c.clase === 'string' && reporteValido(c.reporte) && alternativasValidas(c.alternativas, c.clase)
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
