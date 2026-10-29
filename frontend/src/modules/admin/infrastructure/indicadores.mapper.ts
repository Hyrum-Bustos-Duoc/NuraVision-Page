import type { Database } from '@/shared/types/supabase'
import type { Indicadores } from '../domain/indicadores.types'

export type IndicadoresRow = Database['public']['Functions']['indicadores_panel']['Returns']

/**
 * Respuesta de `indicadores_panel` -> entidad de dominio.
 *
 * No hay valores por defecto que aplicar: la funcion garantiza todas las
 * claves, con 0 o lista vacia cuando no hay datos (contrato de 0022). Lo unico
 * que cambia es el nombre de las claves y los ids, que viajan como numero
 * (bigint) y el dominio maneja como texto, igual que `toReservaGestion`.
 */
export function toIndicadores(row: IndicadoresRow): Indicadores {
  return {
    desde: row.desde,
    hasta: row.hasta,
    reservas: row.reservas,
    porEstado: row.por_estado,
    ingresosEstimados: row.ingresos_estimados,
    clientasDistintas: row.clientas_distintas,
    clientasRegistradas: row.clientas_registradas,
    porMes: row.por_mes,
    porServicio: row.por_servicio.map((s) => ({
      servicioId: String(s.servicio_id),
      nombre: s.nombre,
      reservas: s.reservas,
    })),
    porProfesional: row.por_profesional.map((p) => ({
      profesionalId: String(p.profesional_id),
      nombre: p.nombre,
      reservas: p.reservas,
    })),
  }
}
