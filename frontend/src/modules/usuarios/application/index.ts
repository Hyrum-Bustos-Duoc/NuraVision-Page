/**
 * Punto de entrada de la capa de aplicacion del modulo usuarios.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { listarUsuarios } from './listar-usuarios.usecase'
export { actualizarPerfil } from './actualizar-perfil.usecase'
export { crearCuenta } from './crear-cuenta.usecase'
export { eliminarUsuario } from './eliminar-usuario.usecase'

export type { Usuario, DatosPerfil, NuevaCuenta, UsuarioRol } from '../domain/usuario.types'
export { ETIQUETA_ROL, ROLES } from '../domain/usuario.types'
