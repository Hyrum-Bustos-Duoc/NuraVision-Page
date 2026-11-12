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
 * Un `ok` que llega roto (sin reporte, sin clase o con alternativas que no son lista)
 * viola el contrato del servicio. Se trata como una clasificacion fallida: es lo que
 * es desde el punto de vista de quien mira la pantalla.
 */
const CLINICO_FALLIDO: Clinico = { ...CLINICO_NO_DISPONIBLE, motivo: 'clasificacion_fallida' }

/**
 * Unico punto que resuelve la ausencia o rotura de `clinico`. La UI no usa `?.` sobre
 * el y ramifica solo por estado === 'ok', asi que aqui se garantiza que un `ok` trae
 * todo lo que la UI lee. Las comprobaciones parecen redundantes para TS, pero el
 * JSON llega por red y la union no lo valida.
 */
export function clinicoDe(una: UnaDetectada): Clinico {
  const c = una.clinico
  if (!c) return CLINICO_NO_DISPONIBLE
  if (c.estado !== 'ok') return c
  const roto = c.reporte == null || typeof c.clase !== 'string' || !Array.isArray(c.alternativas)
  return roto ? CLINICO_FALLIDO : c
}

/**
 * Recibe string y no MotivoClinico: la union de TS no protege contra un motivo
 * nuevo que llegue por red, y la pantalla no debe fallar por eso.
 */
export function mensajeMotivoClinico(motivo: string): string {
  switch (motivo) {
    case 'modelo_no_entrenado':
      return 'El reporte clínico aún no está disponible.'
    case 'confianza_baja':
      return 'No pudimos sacar una conclusión con suficiente seguridad para esta uña. Prueba con una foto más nítida y con buena luz.'
    case 'clase_otra':
      return 'Lo que vemos en esta uña no coincide con las señales que sabemos reconocer. Si notas algo que te preocupa, consulta con un profesional.'
    case 'clasificacion_fallida':
      return 'No pudimos revisar esta uña. Intenta analizar la foto de nuevo.'
    default:
      return 'No pudimos obtener un resultado concluyente para esta uña.'
  }
}

export interface ResumenMano {
  mano: number
  total: number
  /** ok con una clase distinta de sin_senales. */
  conSenal: number
  /** ok con sin_senales. */
  sinSenales: number
  /** Todo lo que no es estado === 'ok', incluido un estado desconocido. */
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

  const porMano = new Map<number, ResumenMano>()
  unas.forEach((una, i) => {
    const c = clinicos[i]
    const r = porMano.get(una.mano) ?? { mano: una.mano, total: 0, conSenal: 0, sinSenales: 0, noConcluyentes: 0 }
    r.total++
    if (c.estado !== 'ok') r.noConcluyentes++
    else if (c.clase === 'sin_senales') r.sinSenales++
    else r.conSenal++
    porMano.set(una.mano, r)
  })
  return { disponible: true, manos: [...porMano.values()] }
}
