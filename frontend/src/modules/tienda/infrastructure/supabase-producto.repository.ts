import { supabase } from '@/shared/infrastructure/supabase/client'
import type { ProductoRepository } from '../domain/producto.repository'
import type { Producto } from '../domain/producto.types'
import { toProducto } from './producto.mapper'

/**
 * Codigos con los que PostgREST dice "esa tabla no existe": 42P01 viene de
 * Postgres y PGRST205 del cache de esquema de PostgREST. En los dos casos lo
 * mas probable es que falte aplicar la migracion, y el mensaje lo dice.
 */
const TABLA_INEXISTENTE = new Set(['42P01', 'PGRST205'])

export class SupabaseProductoRepository implements ProductoRepository {
  async listarActivos(): Promise<Producto[]> {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })

    if (error) {
      if (TABLA_INEXISTENTE.has(error.code)) {
        throw new Error(
          'La tienda todavía no está disponible: falta aplicar la migración 0013_tienda.sql.',
        )
      }
      throw new Error(`No se pudo cargar la tienda: ${error.message}`)
    }

    return (data ?? []).map(toProducto).filter((p): p is Producto => p !== null)
  }
}

export const productoRepository = new SupabaseProductoRepository()
