import type { Weekday, WeeklyAvailability } from '@/shared/types'
import { timeToMinutes } from '@/shared/lib/availability'

const NOMBRE_DIA: Record<Weekday, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
}

/**
 * Por que se valida aqui y no solo en la base.
 *
 * `disponibilidad` tiene desde 0001 un check `hora_fin > hora_inicio`. Si se
 * mandara un horario invalido, Postgres lo rechazaria —la base no se corrompe—
 * pero el mensaje que llega al navegador es el del constraint: no dice que dia
 * esta mal ni que hacer. Esto lo dice.
 *
 * El editor ya marca en rojo el dia con el rango invertido, asi que esta regla
 * es la que impide guardarlo de todas formas.
 *
 * Devuelve `null` si la semana se puede guardar.
 */
export function motivoParaNoGuardar(semana: WeeklyAvailability): string | null {
  const invertidos: string[] = []
  const pausasFuera: string[] = []

  for (let dia = 0 as Weekday; dia <= 6; dia = (dia + 1) as Weekday) {
    const jornada = semana[dia]

    // Un dia cerrado no se valida: sus horas no se usan para nada, y exigirle
    // un rango correcto obligaria a arreglar un dia que no se trabaja.
    if (!jornada.enabled) continue

    if (timeToMinutes(jornada.end) <= timeToMinutes(jornada.start)) {
      invertidos.push(NOMBRE_DIA[dia])
      // Sin una jornada valida, comprobar si las pausas caen dentro no
      // significa nada.
      continue
    }

    const fuera = jornada.breaks.some(
      (pausa) =>
        timeToMinutes(pausa.end) <= timeToMinutes(pausa.start) ||
        timeToMinutes(pausa.start) < timeToMinutes(jornada.start) ||
        timeToMinutes(pausa.end) > timeToMinutes(jornada.end),
    )
    if (fuera) pausasFuera.push(NOMBRE_DIA[dia])
  }

  if (invertidos.length > 0) {
    return `La hora de cierre debe ser posterior a la de apertura (${invertidos.join(', ')}).`
  }
  if (pausasFuera.length > 0) {
    return `Hay pausas fuera de la jornada o con las horas invertidas (${pausasFuera.join(', ')}).`
  }
  return null
}
