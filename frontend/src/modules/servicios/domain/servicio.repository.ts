import type { DatosServicio, Servicio } from './servicio.types'

/**
 * Puerto de acceso a servicios.
 *
 * El dominio declara QUE necesita; el COMO vive en infrastructure/. Gracias a
 * esto la capa de aplicacion no sabe que detras hay Supabase, y se puede
 * sustituir por un repositorio en memoria para tests sin tocar nada mas.
 */
export interface ServicioRepository {
  /** Servicios activos, ordenados por nombre. */
  listarActivos(): Promise<Servicio[]>

  /** `null` si no existe (no es un error: es una respuesta valida). */
  obtenerPorId(id: string): Promise<Servicio | null>

  /**
   * Varios servicios de una vez, para resolver nombres en un listado sin caer
   * en N+1. Incluye los inactivos a proposito: una reserva antigua puede
   * apuntar a un servicio dado de baja y su nombre debe seguir mostrandose.
   */
  listarPorIds(ids: string[]): Promise<Servicio[]>

  /**
   * Servicios activos que realiza un profesional, via la tabla puente
   * `profesional_servicios`. Lista vacia si no tiene ninguno asignado.
   *
   * Es el espejo de `listarPorServicio` del modulo profesionales: la misma
   * tabla puente, leida en el otro sentido. Vive aqui porque devuelve
   * servicios, y cada modulo es duenio de sus propias entidades.
   */
  listarPorProfesional(profesionalId: string): Promise<Servicio[]>

  /**
   * TODOS los servicios, activos e inactivos, ordenados por nombre.
   *
   * Es lo que necesita el panel de administracion y no `listarActivos`: quien
   * gestiona el catalogo tiene que poder ver un servicio dado de baja para
   * volver a activarlo. Dejarlo fuera de la lista lo haria inalcanzable.
   */
  listarTodos(): Promise<Servicio[]>

  /**
   * Cuantos profesionales realiza cada servicio, por id de servicio.
   *
   * Existe para el panel, que avisa de los servicios que nadie ofrece: esos
   * aparecen en el catalogo y no se pueden reservar, porque no hay con quien.
   * Es UNA consulta a la tabla puente, no una por servicio.
   */
  contarProfesionalesPorServicio(): Promise<Record<string, number>>

  /** Da de alta un servicio y devuelve la fila tal como quedo. */
  crear(datos: DatosServicio): Promise<Servicio>

  /**
   * Guarda los cambios de un servicio existente.
   *
   * Devuelve lo que quedo en la base. Si RLS rechaza la escritura PostgREST no
   * da error: responde 200 con una lista vacia, asi que la implementacion tiene
   * que distinguir "guardado" de "denegado".
   */
  actualizar(id: string, datos: DatosServicio): Promise<Servicio>

  /**
   * Borra un servicio.
   *
   * OJO: `reservas.servicio_id` apunta aqui. Si hay reservas de ese servicio, la
   * clave foranea impide el borrado y la base devuelve un error; la alternativa
   * correcta es desactivarlo (`activo = false`), que conserva el historial.
   */
  eliminar(id: string): Promise<void>
}
