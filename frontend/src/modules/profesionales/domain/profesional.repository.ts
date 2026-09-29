import type { WeeklyAvailability } from '@/shared/types'
import type { Disponibilidad } from './disponibilidad.types'
import type { DatosProfesional, Profesional } from './profesional.types'

/** Puerto de acceso a profesionales y sus horarios. */
export interface ProfesionalRepository {
  /** Profesionales activos, ordenados por nombre. */
  listarActivos(): Promise<Profesional[]>

  /**
   * Profesionales activos que realizan un servicio, via la tabla puente
   * `profesional_servicios`. Lista vacia si nadie lo tiene asignado.
   */
  listarPorServicio(servicioId: string): Promise<Profesional[]>

  /**
   * Varios profesionales de una vez, para resolver nombres en un listado sin
   * caer en N+1. Incluye los inactivos a proposito: una reserva antigua puede
   * apuntar a alguien que ya no atiende y su nombre debe seguir mostrandose.
   */
  listarPorIds(ids: string[]): Promise<Profesional[]>

  /** Bloques de atencion de un profesional, ordenados por dia y hora. */
  listarDisponibilidad(profesionalId: string): Promise<Disponibilidad[]>

  /**
   * Bloques de VARIOS profesionales en una sola consulta.
   *
   * Existe para el listado del equipo, que muestra las proximas horas de cada
   * uno: con `listarDisponibilidad` habria una peticion por profesional, y los
   * hooks de React no se pueden llamar dentro de un bucle de todas formas.
   */
  listarDisponibilidadDeVarios(profesionalIds: string[]): Promise<Disponibilidad[]>

  /**
   * Reemplaza el horario semanal de un profesional.
   *
   * Recibe las siete filas de la semana, cerradas incluidas, y las guarda de
   * una vez. Es una sola operacion a proposito: guardar dia por dia podria
   * dejar media semana escrita si algo falla a mitad.
   *
   * Devuelve el horario tal como quedo en la base, no lo que se envio: si Row
   * Level Security rechaza la escritura, PostgREST no da error, responde con una
   * lista vacia. Quien llama necesita poder distinguir esos dos casos.
   */
  guardarDisponibilidad(
    profesionalId: string,
    semana: WeeklyAvailability,
  ): Promise<Disponibilidad[]>

  /**
   * TODO el equipo, activos e inactivos, ordenados por nombre.
   *
   * Es lo que necesita el panel y no `listarActivos`: quien gestiona el equipo
   * tiene que poder ver a alguien dado de baja para reactivarlo.
   */
  listarTodos(): Promise<Profesional[]>

  /** Ids de los servicios que realiza. Vacio si no tiene ninguno asignado. */
  listarServiciosAsignados(profesionalId: string): Promise<string[]>

  /**
   * Da de alta una ficha con sus servicios y su horario.
   *
   * El horario llega como parametro y no se genera aqui: el formulario del panel
   * lo muestra y se puede ajustar antes de guardar, asi que generarlo dentro
   * significaria descartar en silencio lo que se haya elegido. Quien no quiera
   * decidirlo pasa `semanaPorDefecto()`.
   *
   * Son tres tablas y PostgREST no tiene transacciones entre peticiones, asi que
   * la implementacion deja dicho que se guardo si algo falla a mitad. Ver el
   * comentario del repositorio.
   */
  crear(datos: DatosProfesional, horario: WeeklyAvailability): Promise<Profesional>

  /** Guarda la ficha y reemplaza por completo su lista de servicios. */
  actualizar(id: string, datos: DatosProfesional): Promise<Profesional>

  /**
   * Borra una ficha.
   *
   * `reservas.profesional_id` apunta aqui, asi que con reservas de por medio la
   * clave foranea lo impide; la alternativa correcta es desactivarla, que
   * conserva el historial.
   */
  eliminar(id: string): Promise<void>
}
