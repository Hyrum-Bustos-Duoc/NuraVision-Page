import { supabase } from '@/shared/infrastructure/supabase/client'
import type { ProductoGestionRepository, ProductoRepository } from '../domain/producto.repository'
import type { DatosProducto, Producto, ProductoAdmin } from '../domain/producto.types'
import { fromDatosProducto, toProducto, toProductoAdmin } from './producto.mapper'

/**
 * Codigos con los que la base dice "esa tabla o columna no existe": 42P01 y
 * 42703 vienen de Postgres y PGRST205 del cache de esquema de PostgREST. Lo mas
 * probable es que falte aplicar la migracion, y el mensaje lo dice.
 *
 * 42703 importa en particular: en el proyecto remoto `productos` ya existia con
 * otra forma, asi que sin 0013 la tabla esta pero le faltan columnas.
 */
const ESQUEMA_INCOMPLETO = new Set(['42P01', '42703', 'PGRST205'])

const SIN_MIGRACION = 'Falta aplicar la migración 0013_tienda.sql en la base de datos.'
const SIN_PERMISO =
  'La base de datos no aceptó el cambio. Se requiere una cuenta de personal del estudio (es_staff).'

/**
 * Error de escritura -> mensaje para el panel. Los codigos de Postgres no le
 * dicen nada a quien edita el catalogo; lo que necesita es saber que corregir.
 */
function motivoDeEscritura(error: { code: string; message: string }, accion: string): string {
  if (ESQUEMA_INCOMPLETO.has(error.code)) return SIN_MIGRACION
  // 23505: el indice unico productos_slug_key.
  if (error.code === '23505') return 'Ya existe otro producto con esa URL. Elige una distinta.'
  // 23514: algun check de 0013 (precio, stock, categoria, slug).
  if (error.code === '23514') return `La base rechazó los datos: ${error.message}`
  // 42501: RLS o falta de grant.
  if (error.code === '42501') return SIN_PERMISO
  return `No se pudo ${accion} el producto: ${error.message}`
}

/** Los ids salen de la base como texto; de vuelta tienen que ser bigint. */
function aIdNumerico(id: string): number | null {
  const n = Number(id)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export class SupabaseProductoRepository implements ProductoRepository, ProductoGestionRepository {
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

  async listarTodos(): Promise<ProductoAdmin[]> {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })

    if (error) {
      if (ESQUEMA_INCOMPLETO.has(error.code)) throw new Error(SIN_MIGRACION)
      throw new Error(`No se pudieron cargar los productos: ${error.message}`)
    }
    return (data ?? []).map(toProductoAdmin)
  }

  async crear(datos: DatosProducto): Promise<ProductoAdmin> {
    const { data, error } = await supabase.from('productos').insert(fromDatosProducto(datos)).select()
    if (error) throw new Error(motivoDeEscritura(error, 'crear'))
    if (!data || data.length === 0) throw new Error(SIN_PERMISO)
    return toProductoAdmin(data[0])
  }

  async actualizar(id: string, datos: DatosProducto): Promise<ProductoAdmin> {
    const idNumerico = aIdNumerico(id)
    if (idNumerico === null) throw new Error('El identificador del producto no es válido.')

    const { data, error } = await supabase
      .from('productos')
      .update(fromDatosProducto(datos))
      .eq('id', idNumerico)
      .select()

    if (error) throw new Error(motivoDeEscritura(error, 'guardar'))
    // Un UPDATE que la RLS filtra no da error: responde 200 con la lista vacia.
    if (!data || data.length === 0) throw new Error(SIN_PERMISO)
    return toProductoAdmin(data[0])
  }

  /**
   * Borra la fila. Los pedidos no se pierden: `pedido_items.producto_id` es
   * `on delete set null` y cada linea guarda copia del nombre y el precio.
   */
  async eliminar(id: string): Promise<void> {
    const idNumerico = aIdNumerico(id)
    if (idNumerico === null) throw new Error('El identificador del producto no es válido.')

    const { data, error } = await supabase.from('productos').delete().eq('id', idNumerico).select('id')

    if (error) {
      // 23503: otra tabla, fuera de 0013, apunta a esta fila.
      if (error.code === '23503') {
        throw new Error(
          'No se puede eliminar: otro registro de la base lo referencia. Desactívalo en su lugar.',
        )
      }
      throw new Error(motivoDeEscritura(error, 'eliminar'))
    }
    if (!data || data.length === 0) throw new Error(SIN_PERMISO)
  }
}

export const productoRepository = new SupabaseProductoRepository()
