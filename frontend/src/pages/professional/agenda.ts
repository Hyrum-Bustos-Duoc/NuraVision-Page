import type { ReservaGestion } from '@/modules/admin/domain/reserva-gestion.types'
import { getDayAvailability, minutesToTime, timeToMinutes } from '@/shared/lib/availability'
import type { Professional } from '@/shared/types'

/**
 * Calculo de la agenda de una profesional a partir de sus reservas reales.
 *
 * Sustituye, para el panel profesional, a `getSlotsForDate` y compania: esas
 * funciones rellenan los huecos con horas "reservadas" y "bloqueadas" sacadas
 * de `seededRandom` para que el prototipo se viera ocupado. En la agenda de una
 * persona real eso es inventar citas, asi que aqui una franja solo esta
 * ocupada si hay una reserva en la base que la cubre.
 */

const PASO_MIN = 30

/**
 * Las que ocupan la agenda, de la mas temprana a la mas tarde.
 *
 * Una cancelada no ocupa nada: dejarla haria ver como tomado un hueco que la
 * clienta libero. El repositorio las entrega de la mas reciente a la mas
 * antigua, que es el orden del historial y no el de una agenda.
 */
export function reservasDeAgenda(reservas: ReservaGestion[]): ReservaGestion[] {
  return reservas
    .filter((r) => r.estado !== 'cancelada')
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio))
}

export function duracionMin(reserva: ReservaGestion): number {
  return timeToMinutes(reserva.horaFin) - timeToMinutes(reserva.horaInicio)
}

/** Reserva del dia que se solapa con [inicio, fin), en minutos. */
function reservaQueCubre(
  reservas: ReservaGestion[],
  iso: string,
  inicio: number,
  fin: number,
): ReservaGestion | undefined {
  return reservas.find(
    (r) =>
      r.fecha === iso && timeToMinutes(r.horaInicio) < fin && timeToMinutes(r.horaFin) > inicio,
  )
}

export type Franja =
  | { tipo: 'reservada'; reserva: ReservaGestion }
  | { tipo: 'pausa' }
  | { tipo: 'libre' }
  | { tipo: 'fuera_horario' }

/**
 * Que hay en una franja de la grilla semanal.
 *
 * La reserva se mira antes que el horario: si hay una cita fuera de la jornada
 * declarada (la agendaron antes de cambiar el horario, o a mano), la
 * profesional tiene que verla igual. Esconderla porque "no deberia existir"
 * seria perder una clienta que va a llegar.
 */
export function estadoFranja(
  profesional: Professional,
  iso: string,
  hora: string,
  minutos: number,
  reservas: ReservaGestion[],
): Franja {
  const inicio = timeToMinutes(hora)
  const fin = inicio + minutos

  const reserva = reservaQueCubre(reservas, iso, inicio, fin)
  if (reserva) return { tipo: 'reservada', reserva }

  const dia = getDayAvailability(profesional, iso)
  if (!dia.enabled || fin <= timeToMinutes(dia.start) || inicio >= timeToMinutes(dia.end)) {
    return { tipo: 'fuera_horario' }
  }

  const enPausa = dia.breaks.some(
    (p) => inicio >= timeToMinutes(p.start) && inicio < timeToMinutes(p.end),
  )
  return enPausa ? { tipo: 'pausa' } : { tipo: 'libre' }
}

export interface BloqueDelDia {
  inicio: string
  fin: string
  minutos: number
  tipo: 'libre' | 'pausa'
  etiqueta: string
}

/**
 * Tramos libres y pausas de la jornada, sin las horas ya reservadas.
 *
 * Se recorre en pasos de 30 minutos, como el resto del calculo de horas, y se
 * unen los pasos contiguos con la misma etiqueta. Un dia sin jornada devuelve
 * lista vacia, que la vista pinta como "hoy no atiendes".
 */
export function bloquesDelDia(
  profesional: Professional,
  iso: string,
  reservas: ReservaGestion[],
): BloqueDelDia[] {
  const dia = getDayAvailability(profesional, iso)
  if (!dia.enabled) return []

  const bloques: BloqueDelDia[] = []
  const finJornada = timeToMinutes(dia.end)

  for (let m = timeToMinutes(dia.start); m < finJornada; m += PASO_MIN) {
    const fin = Math.min(m + PASO_MIN, finJornada)
    if (reservaQueCubre(reservas, iso, m, fin)) continue

    const pausa = dia.breaks.find((p) => m >= timeToMinutes(p.start) && m < timeToMinutes(p.end))
    const tipo: BloqueDelDia['tipo'] = pausa ? 'pausa' : 'libre'
    const etiqueta = pausa ? pausa.label || 'Pausa' : 'libre'
    const previo = bloques[bloques.length - 1]

    if (previo && previo.etiqueta === etiqueta && timeToMinutes(previo.fin) === m) {
      previo.fin = minutesToTime(fin)
      previo.minutos += fin - m
      continue
    }

    bloques.push({ inicio: minutesToTime(m), fin: minutesToTime(fin), minutos: fin - m, tipo, etiqueta })
  }

  return bloques
}

/** Minutos de jornada efectiva del dia: de apertura a cierre, menos las pausas. */
export function minutosDeJornada(profesional: Professional, iso: string): number {
  const dia = getDayAvailability(profesional, iso)
  if (!dia.enabled) return 0
  const pausas = dia.breaks.reduce(
    (suma, p) => suma + (timeToMinutes(p.end) - timeToMinutes(p.start)),
    0,
  )
  return timeToMinutes(dia.end) - timeToMinutes(dia.start) - pausas
}
