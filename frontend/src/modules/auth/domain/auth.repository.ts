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
   * Pide el correo con el enlace para restablecer la contraseña.
   *
   * No devuelve nada Y NO FALLA SI EL CORREO NO EXISTE, a proposito: responder
   * distinto segun si hay cuenta convertiria esta pantalla en una forma de
   * averiguar quien esta registrado. Quien llama dice siempre lo mismo.
   */
  solicitarRecuperacion(email: string, destino: string): Promise<void>

  /**
   * Cambia la contraseña de la sesion abierta.
   *
   * Exige una sesion: la abre el propio enlace del correo al aterrizar en la
   * pagina de restablecimiento. Sin sesion, el proveedor rechaza la llamada, que
   * es justo lo que impide que cualquiera cambie la contraseña de otro.
   */
  cambiarPassword(password: string): Promise<void>

  /**
   * Avisa cuando el proveedor reconoce un enlace de recuperacion.
   *
   * Es un evento distinto de `alCambiarSesion` porque significa otra cosa: no
   * "hay sesion", sino "esta sesion viene de un enlace de recuperacion y la
   * persona deberia cambiar su contraseña ahora".
   *
   * OJO CON LA CARRERA: el evento se emite mientras el cliente procesa la URL,
   * que puede ocurrir ANTES de que la pantalla se monte y se suscriba. Por eso
   * quien lo use tiene que aceptar tambien una sesion ya abierta como prueba
   * valida, y no depender solo de esto.
   */
  alRecuperarPassword(escucha: () => void): () => void

  /**
   * Pide una sesion nueva al proveedor y la difunde por `alCambiarSesion`.
   *
   * Hace falta tras cambiar datos de la cuenta en la base (`actualizar_mi_perfil`
   * escribe `user_metadata`): la sesion guardada sigue con los viejos hasta el
   * siguiente refresco de token.
   */
  refrescarSesion(): Promise<void>

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
