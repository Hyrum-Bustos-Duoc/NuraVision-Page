import type { ReservaRepository } from '../domain/reserva.repository'
import type { Reserva } from '../domain/reserva.types'
import { esReprogramable } from '../domain/reserva.reglas'

const HORA_RE = /^\d{2}:\d{2}$/
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const MINUTOS_POR_DIA = 24 * 60

/**
 * Cambia el bloque horario de una reserva propia.
 *
 * `horaFin` no se recibe: se calcula con la duracion que la reserva ya tenia,
 * de modo que reprogramar mueva el bloque sin cambiar cuanto dura. Recibirla
 * por parametro abriria la puerta a que la interfaz alargara una reserva sin
 * que nadie lo revise.
 */
export async function reprogramarReserva(
  repo: ReservaRepository,
  reserva: Reserva,
  fecha: string,
  horaInicio: string,
): Promise<Reserva> {
  if (!esReprogramable(reserva)) {
    throw new Error(
      reserva.estado === 'cancelada'
        ? 'Esa reserva está cancelada. Reserva una hora nueva.'
        : 'Una reserva completada ya no se puede reprogramar.',
    )
  }

  if (!FECHA_RE.test(fecha)) throw new Error('La fecha elegida no es válida.')
  if (!HORA_RE.test(horaInicio)) throw new Error('La hora elegida no es válida.')

  const duracion = duracionEnMinutos(reserva)

  // Un bloque que cruza la medianoche rompe la restriccion `hora_fin >
  // hora_inicio` de 0003, y el error de la base no diria que paso.
  //
  // La comprobacion va en minutos y no sobre el texto de la hora: `sumarMinutos`
  // no da la vuelta al reloj, asi que las 23:30 mas una hora producen "24:30",
  // que como texto sigue siendo mayor que "23:30" —la comparacion nunca se
  // cumpliria— y que Postgres rechaza por estar fuera del rango de `time`.
  if (aMinutos(horaInicio) + duracion > MINUTOS_POR_DIA) {
    throw new Error('Esa hora dejaría la reserva cruzando la medianoche. Elige una más temprana.')
  }

  return repo.reprogramar(reserva.id, fecha, horaInicio, sumarMinutos(horaInicio, duracion))
}

function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

function sumarMinutos(hora: string, minutos: number): string {
  const total = aMinutos(hora) + minutos
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function duracionEnMinutos(reserva: Reserva): number {
  return aMinutos(reserva.horaFin) - aMinutos(reserva.horaInicio)
}
