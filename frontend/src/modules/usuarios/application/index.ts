/**
 * Punto de entrada de la capa de aplicacion del modulo usuarios.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { listarUsuarios } from './listar-usuarios.usecase'
export { actualizarPerfil } from './actualizar-perfil.usecase'
export { crearCuenta } from './crear-cuenta.usecase'
export { eliminarUsuario } from './eliminar-usuario.usecase'
export {
  actualizarMiPerfil,
  obtenerMiPerfil,
  recuperarBorradorPerfil,
  type ResultadoGuardarPerfil,
} from './mi-perfil.usecase'

export type { Usuario, DatosPerfil, DatosPersonales, NuevaCuenta, UsuarioRol } from '../domain/usuario.types'
export type { BorradorPerfil, CampoPerfil, ErroresPerfil } from '../domain/usuario.reglas'
export { validarPerfilPropio } from '../domain/usuario.reglas'
export { ETIQUETA_ROL, ROLES } from '../domain/usuario.types'
export {
  VENTANA_CUMPLEANOS_DIAS,
  diasHastaCumpleanos,
  etiquetaDiasRestantes,
  proximosCumpleanos,
} from '../domain/cumpleanos'
