import { supabase } from '@/shared/infrastructure/supabase/client'
import type { ReservaGestionRepository } from '../domain/reserva-gestion.repository'
import type { FiltrosReservas, ReservaGestion } from '../domain/reserva-gestion.types'
import { toReservaGestion } from './reserva-gestion.mapper'

const TABLA = 'reservas'

/**
 * Mensaje para el rechazo por RLS.
 *
 * Merece un texto propio porque las dos causas probables no son un fallo del
 * codigo sino de configuracion, y sin nombrarlas el panel solo diria
 * "permission denied". O falta aplicar 0006, o la sesion no esta marcada como
 * personal: `es_staff` se escribe en `app_metadata` con la service_role key, y
 * el JWT solo la recoge al iniciar sesion o al refrescarse.
 */
const FALTA_POLITICA =
  'La base no permite a esta sesión gestionar reservas. Revisa que la migración ' +
  '0006_admin_staff_policy.sql esté aplicada y que tu cuenta tenga es_staff en ' +
  'app_metadata; si acabas de marcarla, cierra sesión y vuelve a entrar.'

/** El id viaja como texto en el dominio, pero la columna es bigint. */
function aIdNumerico(id: string): number {
  const numero = Number(id)
  if (!Number.isInteger(numero)) throw new Error('Esa reserva no existe.')
  return numero
}

/** Implementacion de `ReservaGestionRepository` sobre Supabase. */
export class SupabaseReservaGestionRepository implements ReservaGestionRepository {
  async listar(filtros: FiltrosReservas): Promise<ReservaGestion[]> {
    // El filtrado se hace en la base y no en memoria: el estudio puede llegar a
    // tener miles de reservas, y traerlas todas para descartarlas en el
    // navegador dejaria de funcionar mucho antes de que se note.
    let consulta = supabase.from(TABLA).select('*')

    if (filtros.estado) consulta = consulta.eq('estado', filtros.estado)
    if (filtros.profesionalId) {
      consulta = consulta.eq('profesional_id', aIdNumerico(filtros.profesionalId))
    }

    const { data, error } = await consulta
      .order('fecha', { ascending: false })
      .order('hora_inicio', { ascending: false })

    if (error) {
      if (error.code === '42501') throw new Error(FALTA_POLITICA)
      throw new Error(`No se pudieron cargar las reservas: ${error.message}`)
    }

    return (data ?? []).map(toReservaGestion)
  }

  async confirmar(id: string): Promise<ReservaGestion> {
    const { data, error } = await supabase
      .from(TABLA)
      .update({ estado: 'confirmada' })
      .eq('id', aIdNumerico(id))
      .select()

    if (error) {
      if (error.code === '42501') throw new Error(FALTA_POLITICA)
      throw new Error(`No se pudo confirmar la reserva: ${error.message}`)
    }

    // Un UPDATE que RLS rechaza NO da error: PostgREST responde 200 con una
    // lista vacia, porque "ninguna fila cumplia" es un resultado legitimo. Sin
    // esta comprobacion, confirmar se veria como un exito y la tabla mostraria
    // un estado que la base nunca guardo.
    if (!data || data.length === 0) throw new Error(FALTA_POLITICA)

    return toReservaGestion(data[0])
  }
}

/** Instancia lista para usar; la app no necesita mas de una. */
export const reservaGestionRepository = new SupabaseReservaGestionRepository()
