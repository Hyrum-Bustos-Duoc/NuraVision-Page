import type { ReservaGestionRepository } from '../domain/reserva-gestion.repository'
import type { FiltrosReservas, ReservaGestion } from '../domain/reserva-gestion.types'

/**
 * Reservas del estudio que cumplen los filtros.
 *
 * Recibe el repositorio por inyeccion en vez de importarlo, asi que no sabe
 * que detras hay Supabase. En un test se le pasa un doble en memoria y este
 * archivo no cambia.
 */
export async function listarReservas(
  repo: ReservaGestionRepository,
  filtros: FiltrosReservas = {},
): Promise<ReservaGestion[]> {
  return repo.listar(filtros)
}
