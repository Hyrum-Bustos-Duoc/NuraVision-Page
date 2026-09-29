import type { ReservaRepository } from '../domain/reserva.repository'
import type { Reserva } from '../domain/reserva.types'

/**
 * Una reserva propia por su id.
 *
 * Devuelve `null` tanto si no existe como si es de otra persona: la politica
 * de RLS no los distingue, y la interfaz tampoco debe hacerlo.
 */
export async function obtenerMiReserva(
  repo: ReservaRepository,
  id: string,
): Promise<Reserva | null> {
  return repo.obtenerMiaPorId(id)
}
