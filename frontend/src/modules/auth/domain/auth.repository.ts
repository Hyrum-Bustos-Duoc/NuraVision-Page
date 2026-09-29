import type { Credenciales, DatosRegistro, ResultadoRegistro, UsuarioAuth } from './auth.types'

/**
 * Puerto de autenticacion.
 *
 * La aplicacion habla con esta interfaz, no con `supabase.auth`. Eso mantiene
 * la direccion de las dependencias (infraestructura -> dominio) y deja el
 * cambio de proveedor como un reemplazo de una sola clase.
 */
export interface AuthRepository {
  registrar(datos: DatosRegistro): Promise<ResultadoRegistro>

  iniciarSesion(credenciales: Credenciales): Promise<UsuarioAuth>

  cerrarSesion(): Promise<void>

  /**
   * Usuario de la sesion guardada, o `null` si no hay ninguna.
   *
   * Es asincrono porque al arrancar la app la sesion se restaura desde el
   * almacenamiento del navegador y puede haber que refrescar el token.
   */
  usuarioActual(): Promise<UsuarioAuth | null>

  /**
   * Avisa de cada cambio de sesion (entrar, salir, token refrescado, o la
   * misma cuenta cerrando sesion en otra pestaña).
   *
   * Devuelve la funcion para dejar de escuchar. Sin esto la interfaz se
   * quedaria mostrando una sesion que ya no existe.
   */
  alCambiarSesion(escucha: (usuario: UsuarioAuth | null) => void): () => void
}
