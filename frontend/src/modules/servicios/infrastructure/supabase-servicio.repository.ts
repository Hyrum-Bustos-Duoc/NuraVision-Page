import { supabase } from '@/shared/infrastructure/supabase/client'
import type { ServicioRepository } from '../domain/servicio.repository'
import type { DatosServicio, Servicio } from '../domain/servicio.types'
import { fromDatosServicio, toServicio } from './servicio.mapper'

/**
 * `id` es bigint: un id no numerico no puede existir y consultarlo haria que
 * PostgREST respondiera 400. La cadena vacia se descarta aparte porque
 * Number('') es 0 y pasaria la comprobacion de entero.
 */
function aIdNumerico(id: string): number | null {
  if (id.trim() === '') return null
  const n = Number(id)
  return Number.isInteger(n) ? n : null
}

const TABLA = 'servicios'
const TABLA_PUENTE = 'profesional_servicios'

/** Implementacion de `ServicioRepository` sobre Supabase. */
export class SupabaseServicioRepository implements ServicioRepository {
  async listarActivos(): Promise<Servicio[]> {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) {
      throw new Error(`No se pudieron cargar los servicios: ${error.message}`)
    }

    return (data ?? []).map(toServicio)
  }

  async obtenerPorId(id: string): Promise<Servicio | null> {
    // La columna es bigint: un id no numerico nunca va a existir, y consultarlo
    // haria que PostgREST respondiera un 400. Los ids del prototipo eran slugs
    // ("manicure-ritual-nura"), asi que esos enlaces caen aqui y degradan a
    // "no encontrado". Se descarta la cadena vacia aparte, porque Number('')
    // es 0 y pasaria la comprobacion de entero.
    const idNumerico = Number(id)
    if (id.trim() === '' || !Number.isInteger(idNumerico)) {
      return null
    }

    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('id', idNumerico)
      .maybeSingle()

    if (error) {
      throw new Error(`No se pudo cargar el servicio ${id}: ${error.message}`)
    }

    return data ? toServicio(data) : null
  }

  async listarPorIds(ids: string[]): Promise<Servicio[]> {
    // Los ids que no son enteros (los slugs del prototipo) se descartan aqui:
    // no existen en la base y colarlos daria un 400 de PostgREST.
    const numericos = ids
      .map((id) => Number(id))
      .filter((id, i) => ids[i].trim() !== '' && Number.isInteger(id))

    if (numericos.length === 0) return []

    const { data, error } = await supabase.from(TABLA).select('*').in('id', numericos)

    if (error) {
      throw new Error(`No se pudieron cargar los servicios: ${error.message}`)
    }

    return (data ?? []).map(toServicio)
  }

  async listarPorProfesional(profesionalId: string): Promise<Servicio[]> {
    // Mismo descarte que en listarPorIds: un id del prototipo no es entero y
    // mandarlo a PostgREST daria un 400 en vez de una lista vacia.
    const idProfesional = Number(profesionalId)
    if (!profesionalId.trim() || !Number.isInteger(idProfesional)) return []

    const { data: vinculos, error: errorVinculos } = await supabase
      .from(TABLA_PUENTE)
      .select('servicio_id')
      .eq('profesional_id', idProfesional)

    if (errorVinculos) {
      throw new Error(`No se pudieron cargar los servicios: ${errorVinculos.message}`)
    }

    const ids = (vinculos ?? []).map((v) => v.servicio_id)
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .in('id', ids)
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) {
      throw new Error(`No se pudieron cargar los servicios: ${error.message}`)
    }

    return (data ?? []).map(toServicio)
  }

  async listarTodos(): Promise<Servicio[]> {
    // Sin el filtro de `activo`: el panel necesita ver los dados de baja para
    // poder reactivarlos. La lectura es publica por la politica de 0002, asi que
    // esto funciona igual sin sesion; quien limita el acceso a la PANTALLA es la
    // guarda de ruta, y quien limita la ESCRITURA es RLS.
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .order('nombre', { ascending: true })

    if (error) {
      throw new Error(`No se pudieron cargar los servicios: ${error.message}`)
    }

    return (data ?? []).map(toServicio)
  }


  async contarProfesionalesPorServicio(): Promise<Record<string, number>> {
    // Se trae la tabla puente entera y se cuenta aqui. Son dos docenas de pares
    // de enteros: pedirle el agrupado a PostgREST obligaria a una vista o a una
    // funcion, y no lo vale.
    const { data, error } = await supabase.from(TABLA_PUENTE).select('servicio_id')

    if (error) {
      throw new Error(`No se pudo contar quien realiza cada servicio: ${error.message}`)
    }

    const cuenta: Record<string, number> = {}
    for (const fila of data ?? []) {
      const clave = String(fila.servicio_id)
      cuenta[clave] = (cuenta[clave] ?? 0) + 1
    }
    return cuenta
  }

  async crear(datos: DatosServicio): Promise<Servicio> {
    const { data, error } = await supabase.from(TABLA).insert(fromDatosServicio(datos)).select()

    if (error) throw new Error(`No se pudo crear el servicio: ${error.message}`)

    /**
     * Un INSERT que RLS rechaza SI devuelve error (42501), al contrario que un
     * UPDATE, que responde 200 con la lista vacia. Se comprueba de todos modos:
     * esa diferencia es del protocolo, no del dominio, y apoyarse en ella
     * obligaria a recordar cual es cual en cada sitio.
     */
    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el servicio. Se requieren permisos de personal del estudio.',
      )
    }

    return toServicio(data[0])
  }

  async actualizar(id: string, datos: DatosServicio): Promise<Servicio> {
    const idNumerico = aIdNumerico(id)
    if (idNumerico === null) throw new Error('El identificador del servicio no es válido.')

    const { data, error } = await supabase
      .from(TABLA)
      .update(fromDatosServicio(datos))
      .eq('id', idNumerico)
      .select()

    if (error) throw new Error(`No se pudo guardar el servicio: ${error.message}`)

    // Aqui la lista vacia es el caso normal de un rechazo de RLS, no una rareza.
    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el cambio. Se requieren permisos de personal del estudio.',
      )
    }

    return toServicio(data[0])
  }

  async eliminar(id: string): Promise<void> {
    const idNumerico = aIdNumerico(id)
    if (idNumerico === null) throw new Error('El identificador del servicio no es válido.')

    const { data, error } = await supabase.from(TABLA).delete().eq('id', idNumerico).select('id')

    if (error) {
      /**
       * 23503 es la violacion de clave foranea: hay reservas de este servicio.
       * El mensaje de Postgres nombra la restriccion y no le sirve a nadie, asi
       * que se traduce a la alternativa correcta —desactivarlo—, que ademas
       * conserva el historial de quien ya lo reservo.
       */
      if (error.code === '23503') {
        throw new Error(
          'No se puede eliminar: hay reservas asociadas a este servicio. ' +
            'Desactívalo en lugar de borrarlo para conservar el historial.',
        )
      }
      throw new Error(`No se pudo eliminar el servicio: ${error.message}`)
    }

    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el borrado. Se requieren permisos de personal del estudio.',
      )
    }
  }
}

/** Instancia lista para usar; la app no necesita mas de una. */
export const servicioRepository = new SupabaseServicioRepository()
