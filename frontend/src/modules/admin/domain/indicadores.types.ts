import type { EstadoReserva } from '@/shared/types/supabase'

/** Rango de fechas cerrado en los dos extremos, 'YYYY-MM-DD'. */
export interface RangoFechas {
  desde: string
  hasta: string
}

/**
 * Indicadores del estudio para un rango, tal como los calcula la base
 * (`indicadores_panel`, 0022).
 *
 * Las canceladas cuentan en `reservas`, `porEstado`, `porMes` y
 * `clientasDistintas`, y NO en `ingresosEstimados`, `porServicio` ni
 * `porProfesional`: existieron, pero no son atenciones.
 */
export interface Indicadores {
  desde: string
  hasta: string
  /** Todos los estados. */
  reservas: number
  porEstado: Record<EstadoReserva, number>
  /** CLP del precio acordado de las no canceladas. No es dinero cobrado. */
  ingresosEstimados: number
  clientasDistintas: number
  /** Cuentas con rol cliente. No depende del rango. */
  clientasRegistradas: number
  /** Un elemento por mes que toca el rango, en orden, incluidos los de 0. */
  porMes: { mes: string; reservas: number; canceladas: number }[]
  /** De mas a menos reservas. */
  porServicio: { servicioId: string; nombre: string; reservas: number }[]
  /** De mas a menos reservas. */
  porProfesional: { profesionalId: string; nombre: string; reservas: number }[]
}
