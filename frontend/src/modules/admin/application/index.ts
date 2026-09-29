/**
 * Punto de entrada de la capa de aplicacion del modulo admin.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { listarReservas } from './listar-reservas.usecase'
export { confirmarReserva } from './confirmar-reserva.usecase'
export { esConfirmable, ESTADOS_FILTRABLES } from '../domain/reserva-gestion.types'
export type {
  ReservaGestion,
  FiltrosReservas,
  EstadoReserva,
} from '../domain/reserva-gestion.types'
export type { ReservaGestionRepository } from '../domain/reserva-gestion.repository'
