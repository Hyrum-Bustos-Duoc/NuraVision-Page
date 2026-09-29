import type { AvailabilityBreak, Weekday } from '@/shared/types'

/**
 * El horario de un profesional en un dia de la semana.
 *
 * Desde 0009 hay UNA fila por profesional y dia: la restriccion
 * `disponibilidad_un_bloque_por_dia` lo garantiza en la base. Antes podian
 * haber varias y la colacion se deducia del hueco entre ellas, que es una
 * conversion con perdida —al guardar, la etiqueta de la pausa no tenia donde
 * volver—. Ahora las pausas viven en su propia columna.
 */
export interface Disponibilidad {
  id: string
  profesionalId: string
  diaSemana: Weekday
  /** `false` = ese dia no se atiende. La fila se conserva con sus horas. */
  activo: boolean
  /** "HH:MM" */
  horaInicio: string
  /** "HH:MM" */
  horaFin: string
  /** Pausas dentro de la jornada: colacion, permisos, uso personal. */
  pausas: AvailabilityBreak[]
}
