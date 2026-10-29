/**
 * Punto de entrada de la capa de aplicacion del modulo admin.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { listarReservas } from './listar-reservas.usecase'
export { confirmarReserva } from './confirmar-reserva.usecase'
export { obtenerIndicadores } from './obtener-indicadores.usecase'
export {
  esConfirmable,
  ESTADOS_FILTRABLES,
  ETIQUETA_ESTADO,
} from '../domain/reserva-gestion.types'
export {
  problemaDelRango,
  rangoDelDashboard,
  rangoDelPreset,
  resumirDashboard,
  tasaCancelacion,
} from '../domain/indicadores.reglas'
export type { PresetRango } from '../domain/indicadores.reglas'
export type {
  ReservaGestion,
  FiltrosReservas,
  EstadoReserva,
} from '../domain/reserva-gestion.types'
export type { Indicadores, RangoFechas } from '../domain/indicadores.types'
export type { ReservaGestionRepository } from '../domain/reserva-gestion.repository'
