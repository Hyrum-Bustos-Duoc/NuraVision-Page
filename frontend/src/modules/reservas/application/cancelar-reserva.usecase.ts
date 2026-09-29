import type { ReservaRepository } from '../domain/reserva.repository'
import type { Reserva } from '../domain/reserva.types'
import { esCancelable } from '../domain/reserva.reglas'

/**
 * Cancela una reserva propia.
 *
 * La comprobacion de estado se repite aqui aunque la politica de RLS ya la
 * haga: asi la interfaz puede explicar por que no se puede antes de salir a la
 * red, en vez de mostrar el mensaje generico de un UPDATE que no afecto filas.
 * La de la base sigue siendo la que manda.
 */
export async function cancelarReserva(
  repo: ReservaRepository,
  reserva: Reserva,
): Promise<Reserva> {
  if (!esCancelable(reserva)) {
    throw new Error(
      reserva.estado === 'cancelada'
        ? 'Esa reserva ya está cancelada.'
        : 'Una reserva completada ya no se puede cancelar.',
    )
  }

  return repo.cancelar(reserva.id)
}
