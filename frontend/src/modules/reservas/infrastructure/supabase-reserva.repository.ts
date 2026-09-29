import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/shared/infrastructure/supabase/client'
import type { ReservaRepository } from '../domain/reserva.repository'
import type { NuevaReserva, Reserva } from '../domain/reserva.types'
import { toReserva, toReservaInsert } from './reserva.mapper'

const TABLA = 'reservas'

/**
 * Lo que PostgREST devuelve cuando RLS deja pasar cero filas.
 *
 * Es el detalle mas facil de pasar por alto de toda la integracion: un UPDATE
 * que la politica rechaza NO da error. Devuelve 200 y una lista vacia, porque
 * para PostgREST "ninguna fila cumplia" es un resultado legitimo. Sin esta
 * comprobacion, cancelar una reserva ajena o ya cancelada se veria como un
 * exito y la interfaz mentiria.
 */
function faltaLaFila(filas: unknown[] | null): boolean {
  return !filas || filas.length === 0
}

/** Traduce el rechazo por RLS a algo accionable. */
function mensajeDe(error: PostgrestError, accion: string, migracion: string): string {
  if (error.code === '42501') {
    return `La base rechazó ${accion} por sus políticas de seguridad. ` +
      `Revisa que la migración ${migracion} esté aplicada.`
  }
  return `No se pudo ${accion}: ${error.message}`
}

/** El id viaja como texto en el dominio, pero la columna es bigint. */
function aIdNumerico(id: string): number {
  const numero = Number(id)
  if (!Number.isInteger(numero)) {
    throw new Error('Esa reserva no existe.')
  }
  return numero
}

/** Implementacion de `ReservaRepository` sobre Supabase. */
export class SupabaseReservaRepository implements ReservaRepository {
  async crear(nueva: NuevaReserva): Promise<void> {
    const fila = toReservaInsert(nueva)

    if (!Number.isInteger(fila.servicio_id) || !Number.isInteger(fila.profesional_id)) {
      throw new Error('La reserva apunta a un servicio o profesional que no existe en la base.')
    }

    // Sin .select(): la politica de insercion no devuelve la fila creada, y
    // pedirla haria fallar una insercion que en realidad si se guardo. Aunque
    // 0004 concede SELECT, una reserva de invitada (cliente_id NULL) sigue
    // quedando fuera de la politica de lectura.
    const { error } = await supabase.from(TABLA).insert(fila)

    if (error) {
      // 42501 es el rechazo por RLS. Es el error mas probable si alguien
      // levanta el proyecto sin aplicar las migraciones, asi que conviene que
      // el mensaje diga que revisar en vez de solo "permission denied".
      if (error.code === '42501') {
        throw new Error(
          'La base rechazó la reserva por sus políticas de seguridad. ' +
            'Revisa que las migraciones 0003 y 0004 estén aplicadas.',
        )
      }
      throw new Error(`No se pudo guardar la reserva: ${error.message}`)
    }
  }

  async listarMias(): Promise<Reserva[]> {
    // No se filtra por cliente_id aqui: lo hace la politica de RLS con
    // auth.uid(). Anteponer un .eq() con el id que cree tener el navegador
    // seria redundante y daria la falsa impresion de que la seguridad depende
    // del cliente.
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .order('fecha', { ascending: false })
      .order('hora_inicio', { ascending: false })

    if (error) {
      if (error.code === '42501') {
        throw new Error(
          'La base no permite leer tus reservas. ' +
            'Revisa que la migración 0004_auth_reservas_policy.sql esté aplicada.',
        )
      }
      throw new Error(`No se pudieron cargar tus reservas: ${error.message}`)
    }

    return (data ?? []).map(toReserva)
  }

  async obtenerMiaPorId(id: string): Promise<Reserva | null> {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('id', aIdNumerico(id))
      // maybeSingle y no single: que no exista (o que sea de otra persona, que
      // para RLS es lo mismo) no es un error, es una respuesta.
      .maybeSingle()

    if (error) {
      throw new Error(mensajeDe(error, 'leer la reserva', '0004_auth_reservas_policy.sql'))
    }

    return data ? toReserva(data) : null
  }

  async cancelar(id: string): Promise<Reserva> {
    const { data, error } = await supabase
      .from(TABLA)
      .update({ estado: 'cancelada' })
      .eq('id', aIdNumerico(id))
      .select()

    if (error) {
      throw new Error(mensajeDe(error, 'cancelar la reserva', '0005_reservas_update_policy.sql'))
    }

    if (faltaLaFila(data)) {
      throw new Error(
        'No pudimos cancelar esa reserva. Puede que ya esté cancelada o completada, ' +
          'o que no sea tuya.',
      )
    }

    return toReserva(data![0])
  }

  async reprogramar(
    id: string,
    fecha: string,
    horaInicio: string,
    horaFin: string,
  ): Promise<Reserva> {
    const { data, error } = await supabase
      .from(TABLA)
      .update({
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        // Vuelve a 'pendiente' aunque estuviera confirmada: el bloque nuevo lo
        // tiene que confirmar el estudio. Ademas es lo unico que acepta la
        // politica de 0005, que no deja a nadie auto-confirmarse una hora.
        estado: 'pendiente',
      })
      .eq('id', aIdNumerico(id))
      .select()

    if (error) {
      throw new Error(mensajeDe(error, 'reprogramar la reserva', '0005_reservas_update_policy.sql'))
    }

    if (faltaLaFila(data)) {
      throw new Error(
        'No pudimos reprogramar esa reserva. Puede que ya esté cancelada o completada, ' +
          'o que no sea tuya.',
      )
    }

    return toReserva(data![0])
  }
}

/** Instancia lista para usar; la app no necesita mas de una. */
export const reservaRepository = new SupabaseReservaRepository()
