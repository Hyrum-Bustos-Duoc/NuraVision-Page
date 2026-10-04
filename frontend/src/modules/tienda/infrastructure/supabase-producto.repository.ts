import { supabase } from '@/shared/infrastructure/supabase/client'
import type { ProductoRepository } from '../domain/producto.repository'
import type { Producto } from '../domain/producto.types'
import { toProducto } from './producto.mapper'

/**
 * Codigos con los que la base dice "esa tabla o columna no existe": 42P01 y
 * 42703 vienen de Postgres y PGRST205 del cache de esquema de PostgREST. Lo mas
 * probable es que falte aplicar la migracion, y el mensaje lo dice.
 *
 * 42703 importa en particular: en el proyecto remoto `productos` ya existia con
 * otra forma, asi que sin 0013 la tabla esta pero le faltan columnas.
 */
const ESQUEMA_INCOMPLETO = new Set(['42P01', '42703', 'PGRST205'])

export class SupabaseProductoRepository implements ProductoRepository {
  async listarActivos(): Promise<Producto[]> {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })

    if (error) {
      if (ESQUEMA_INCOMPLETO.has(error.code)) {
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
