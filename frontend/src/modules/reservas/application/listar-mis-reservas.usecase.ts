import type { ReservaRepository } from '../domain/reserva.repository'
import type { Reserva } from '../domain/reserva.types'

/**
 * Reservas de la persona con sesion iniciada.
 *
 * El filtro por cuenta no esta aqui: lo aplica la base con `auth.uid()`
 * (0004_auth_reservas_policy.sql). Este caso de uso existe para que la UI no
 * dependa del repositorio, y para dejar escrito el orden en que se muestran.
 */
export async function listarMisReservas(repo: ReservaRepository): Promise<Reserva[]> {
  return repo.listarMias()
}
