import type { DatosPerfil, NuevaCuenta, Usuario } from './usuario.types'

/** Puerto de lectura y correccion de perfiles. Todo pasa por RLS. */
export interface UsuarioRepository {
  /** Perfiles, los mas recientes primero. Vacio si la sesion no es del personal. */
  listar(): Promise<Usuario[]>

  /**
   * Corrige un perfil.
   *
   * Devuelve la fila tal como quedo. Si RLS rechaza la escritura, PostgREST NO
   * da error: responde 200 con una lista vacia, asi que quien llama tiene que
   * poder distinguir "guardado" de "denegado".
   */
  actualizar(id: string, datos: DatosPerfil): Promise<Usuario>

  /**
   * Borra la fila de `perfiles`, y solo esa.
   *
   * NO elimina la cuenta de acceso: eso vive en `auth.users` y necesita la
   * service_role key. Para el borrado de verdad esta `CuentasRepository`.
   */
  eliminarPerfil(id: string): Promise<void>
}

/**
 * Puerto de las operaciones que exigen la service_role key.
 *
 * Existe aparte del de arriba a proposito: estas no van contra PostgREST sino
 * contra una Edge Function, y pueden fallar por un motivo que las otras no
 * tienen —que la funcion no este desplegada—. Separarlas deja claro en el tipo
 * cual es cual.
 */
export interface CuentasRepository {
  /** Crea la cuenta de acceso. Devuelve su uuid. */
  crear(datos: NuevaCuenta): Promise<string>
  /** Elimina la cuenta de acceso y, con ella, la posibilidad de entrar. */
  eliminar(userId: string): Promise<void>
}
