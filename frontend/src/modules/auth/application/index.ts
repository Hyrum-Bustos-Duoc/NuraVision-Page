/**
 * Punto de entrada de la capa de aplicacion del modulo auth.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { registrar } from './registrar.usecase'
export { iniciarSesion } from './iniciar-sesion.usecase'
export { cerrarSesion } from './cerrar-sesion.usecase'
export type {
  Credenciales,
  DatosRegistro,
  ResultadoRegistro,
  UsuarioAuth,
} from '../domain/auth.types'
export type { AuthRepository } from '../domain/auth.repository'
