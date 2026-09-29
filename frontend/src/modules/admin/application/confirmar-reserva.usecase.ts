import type { ReservaGestionRepository } from '../domain/reserva-gestion.repository'
import type { ReservaGestion } from '../domain/reserva-gestion.types'
import { esConfirmable } from '../domain/reserva-gestion.types'

/**
 * Confirma una reserva pendiente.
 *
 * La comprobacion de estado se repite aqui aunque la base deba hacerla: asi la
 * interfaz puede explicar por que no aplica sin salir a la red. La de la base
 * sigue siendo la que manda.
 */
export async function confirmarReserva(
  repo: ReservaGestionRepository,
  reserva: ReservaGestion,
): Promise<ReservaGestion> {
  if (!esConfirmable(reserva)) {
    throw new Error(
      reserva.estado === 'confirmada'
        ? 'Esa reserva ya está confirmada.'
        : `Una reserva ${reserva.estado} ya no se puede confirmar.`,
    )
  }

  return repo.confirmar(reserva.id)
}
