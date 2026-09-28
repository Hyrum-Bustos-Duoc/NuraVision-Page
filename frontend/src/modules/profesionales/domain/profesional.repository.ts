import type { WeeklyAvailability } from '@/shared/types'
import type { Disponibilidad } from './disponibilidad.types'
import type { Profesional } from './profesional.types'

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
}
