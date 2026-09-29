import type { Reserva } from './reserva.types'

/**
 * Reglas de negocio sobre el estado de una reserva.
 *
 * Viven en el dominio porque las necesitan tanto los casos de uso como la
 * interfaz —que debe ocultar los botones que no van a funcionar—, y duplicarlas
 * en los dos sitios garantizaba que tarde o temprano dejaran de coincidir.
 *
 * Son un espejo de la politica de 0005_reservas_update_policy.sql. La de la
 * base es la que manda; esta copia solo existe para poder explicar el motivo
 * en pantalla antes de intentarlo.
 */

/** Una reserva sigue viva mientras no se cancelo ni se completo. */
export function estaViva(reserva: Reserva): boolean {
  return reserva.estado === 'pendiente' || reserva.estado === 'confirmada'
}

export function esCancelable(reserva: Reserva): boolean {
  return estaViva(reserva)
}

export function esReprogramable(reserva: Reserva): boolean {
  return estaViva(reserva)
}
