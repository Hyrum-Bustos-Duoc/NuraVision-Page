/**
 * Punto de entrada de la capa de aplicacion del modulo reservas.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { crearReserva } from './crear-reserva.usecase'
export { listarMisReservas } from './listar-mis-reservas.usecase'
export { obtenerMiReserva } from './obtener-mi-reserva.usecase'
export { cancelarReserva } from './cancelar-reserva.usecase'
export { reprogramarReserva } from './reprogramar-reserva.usecase'
export { esCancelable, esReprogramable, estaViva } from '../domain/reserva.reglas'
export type { NuevaReserva, Reserva, EstadoReserva } from '../domain/reserva.types'
export type { ReservaRepository } from '../domain/reserva.repository'
