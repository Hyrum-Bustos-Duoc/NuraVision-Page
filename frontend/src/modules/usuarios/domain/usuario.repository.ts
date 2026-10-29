import type { BorradorPerfil } from './usuario.reglas'
import type { DatosPerfil, DatosPerfilPropio, DatosPersonales, NuevaCuenta, Usuario } from './usuario.types'

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
   * El perfil de la propia sesion. Lanza «No encontramos tu perfil…» si no hay
   * fila: para la clienta no existe un estado "vacio" que mostrar.
   *
   * Devuelve los datos editables, no un `Usuario`: el nombre llega crudo (vacio
   * si lo esta), sin el relleno de los listados, porque es el valor del campo.
   */
  obtenerPropio(id: string): Promise<DatosPersonales>

  /**
   * Reemplaza los datos personales de la propia sesion (no recibe id: la base
   * usa `auth.uid()`). Devuelve lo que quedo guardado. Un rechazo de la base
   * llega como Error con un mensaje para mostrar; si la base no reconoce la
   * sesion, como `SesionExpiradaError`.
   */
  actualizarPropio(datos: DatosPerfilPropio): Promise<DatosPersonales>

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

/**
 * El guardado de «Mi perfil» llego a la base sin una sesion valida.
 *
 * Clase propia porque hay que distinguirlo de cualquier otro rechazo: es el
 * unico caso en que la pantalla se desmonta (la sesion se cerro y `/perfil`
 * manda al login) y lo escrito se perderia si no se guarda aparte.
 */
export class SesionExpiradaError extends Error {
  constructor() {
    super('Tu sesión expiró. Vuelve a iniciar sesión.')
    this.name = 'SesionExpiradaError'
  }
}

/** Lo que una cuenta escribio en «Mi perfil» y no llego a guardarse. */
export interface BorradorPendiente {
  /** La cuenta que lo escribio: el borrador de otra nunca se muestra. */
  usuarioId: string
  borrador: BorradorPerfil
}

/** Puerto del borrador que sobrevive al viaje de ida y vuelta por el login. */
export interface BorradorPerfilAlmacen {
  /** Nunca lanza: sin almacenamiento o con un dato ilegible, `null`. */
  leer(): BorradorPendiente | null
  /** Nunca lanza: sin almacenamiento, el borrador simplemente no se conserva. */
  recordar(pendiente: BorradorPendiente): void
  olvidar(): void
}
