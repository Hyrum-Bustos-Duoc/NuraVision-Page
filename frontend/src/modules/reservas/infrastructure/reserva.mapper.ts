import type { Database, Tables } from '@/shared/types/supabase'
import type { NuevaReserva, Reserva } from '../domain/reserva.types'

export type ReservaInsert = Database['public']['Tables']['reservas']['Insert']
export type ReservaRow = Tables<'reservas'>

/** "10:00:00" -> "10:00". Postgres `time` llega con segundos. */
function aHoraCorta(valor: string): string {
  const [horas = '00', minutos = '00'] = valor.split(':')
  return `${horas.padStart(2, '0')}:${minutos.padStart(2, '0')}`
}

/**
 * Entidad de dominio -> fila para insertar.
 *
 * `estado` se fija en 'pendiente' y no se recibe por parametro: es lo unico
 * que acepta la politica de RLS desde el navegador. Confirmar una hora es una
 * decision del estudio, no de quien reserva.
 */
export function toReservaInsert(nueva: NuevaReserva): ReservaInsert {
  return {
    servicio_id: Number(nueva.servicioId),
    profesional_id: Number(nueva.profesionalId),
    fecha: nueva.fecha,
    hora_inicio: nueva.horaInicio,
    hora_fin: nueva.horaFin,
    cliente_nombre: nueva.clienteNombre,
    cliente_email: nueva.clienteEmail,
    // Cadena vacia a NULL: para la base son el mismo caso (sin telefono) y
    // asi no hay que comprobar los dos.
    cliente_telefono: nueva.clienteTelefono.trim() || null,
    // Sin sesion va NULL, que es lo que la politica de insercion exige del rol
    // anonimo. Con sesion debe ser el uuid de esa misma cuenta: la politica
    // rechaza cualquier otro.
    cliente_id: nueva.clienteId,
    codigo: nueva.codigo,
    estado: 'pendiente',
  }
}

/** Fila de la base de datos -> entidad de dominio. */
export function toReserva(row: ReservaRow): Reserva {
  return {
    id: String(row.id),
    servicioId: String(row.servicio_id),
    profesionalId: String(row.profesional_id),
    fecha: row.fecha,
    horaInicio: aHoraCorta(row.hora_inicio),
    horaFin: aHoraCorta(row.hora_fin),
    clienteNombre: row.cliente_nombre,
    clienteEmail: row.cliente_email,
    clienteTelefono: row.cliente_telefono,
    codigo: row.codigo,
    estado: row.estado,
  }
}
