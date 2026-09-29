import type { NuevaReserva, Reserva } from './reserva.types'

/**
 * Puerto de acceso a reservas.
 *
 * La lectura y la escritura estan acotadas por RLS a las reservas propias
 * (0004 y 0005). No existe, ni debe existir, un metodo para listarlas todas
 * desde el navegador: eso expondria el contacto de todos los clientes a
 * cualquiera con la anon key.
 */
export interface ReservaRepository {
  /**
   * Crea la reserva en estado 'pendiente'.
   *
   * No devuelve la fila creada: la politica de insercion no la devuelve y
   * quien llama identifica la reserva por el `codigo` que el mismo genero.
   */
  crear(nueva: NuevaReserva): Promise<void>

  /**
   * Reservas de la sesion activa, de la mas proxima a la mas antigua.
   *
   * Sin sesion devuelve una lista vacia, no un error: no tener reservas que
   * mostrar es el estado normal de una visitante, no un fallo.
   *
   * Nunca incluye las reservas hechas como invitada, ni siquiera si se usaron
   * el mismo nombre y correo: quedaron guardadas con `cliente_id` NULL y la
   * politica no las alcanza.
   */
  listarMias(): Promise<Reserva[]>

  /**
   * Una reserva propia por su id, o `null` si no existe o no es de quien
   * consulta. Los dos casos son indistinguibles a proposito: la politica de
   * RLS oculta las ajenas, y distinguirlos revelaria que ese id existe.
   */
  obtenerMiaPorId(id: string): Promise<Reserva | null>

  /**
   * Deja la reserva en estado 'cancelada'.
   *
   * No borra la fila: el estudio necesita el registro de que esa hora existio
   * y se libero. Devuelve la fila actualizada.
   */
  cancelar(id: string): Promise<Reserva>

  /**
   * Cambia el bloque horario de la reserva.
   *
   * La devuelve a 'pendiente' aunque estuviera confirmada: cambiar la hora
   * obliga al estudio a confirmar el bloque nuevo, y ademas es lo unico que
   * acepta la politica de 0005. Devuelve la fila actualizada.
   */
  reprogramar(id: string, fecha: string, horaInicio: string, horaFin: string): Promise<Reserva>
}
