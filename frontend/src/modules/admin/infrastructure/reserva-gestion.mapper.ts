import type { Tables } from '@/shared/types/supabase'
import type { ReservaGestion } from '../domain/reserva-gestion.types'

export type ReservaRow = Tables<'reservas'>

/** "10:00:00" -> "10:00". Postgres `time` llega con segundos. */
function aHoraCorta(valor: string): string {
  const [horas = '00', minutos = '00'] = valor.split(':')
  return `${horas.padStart(2, '0')}:${minutos.padStart(2, '0')}`
}

/** Fila de la base de datos -> entidad de dominio. */
export function toReservaGestion(row: ReservaRow): ReservaGestion {
  return {
    id: String(row.id),
    codigo: row.codigo,
    servicioId: String(row.servicio_id),
    profesionalId: String(row.profesional_id),
    fecha: row.fecha,
    horaInicio: aHoraCorta(row.hora_inicio),
    horaFin: aHoraCorta(row.hora_fin),
    clienteNombre: row.cliente_nombre,
    clienteEmail: row.cliente_email,
    clienteTelefono: row.cliente_telefono,
    clienteId: row.cliente_id,
    estado: row.estado,
  }
}
