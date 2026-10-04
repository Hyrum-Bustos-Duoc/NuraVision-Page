import type { Tables } from '@/shared/types/supabase'
import { esCategoria } from '../domain/categorias'
import type { InsigniaProducto, Producto } from '../domain/producto.types'

export type ProductoRow = Tables<'productos'>

const INSIGNIAS: InsigniaProducto[] = ['mas_vendido', 'nuevo', 'kit']

/**
 * Fila -> producto, o `null` si la fila no se puede mostrar.
 *
 * El check de 0013 ya impide una categoria fuera del vocabulario, pero si
 * alguien la relaja, un producto mal cargado no debe tumbar el catalogo: se
 * descarta con un aviso en consola, que es donde lo vera quien lo cargo.
 */
export function toProducto(row: ProductoRow): Producto | null {
  if (!esCategoria(row.categoria)) {
    console.warn(
      `[tienda] El producto "${row.slug}" tiene la categoria "${row.categoria}", que no se ` +
        'reconoce. No se muestra.',
    )
    return null
  }

  return {
    id: String(row.id),
    slug: row.slug,
    nombre: row.nombre,
    categoria: row.categoria,
    tamano: row.tamano ?? '',
    precio: row.precio,
    // El check de 0013 exige que sea mayor que el precio; si no lo es, mostrarlo
    // tachado seria anunciar una rebaja que no existe.
    precioAnterior:
      row.precio_anterior !== null && row.precio_anterior > row.precio ? row.precio_anterior : null,
    imagenUrl: row.imagen_url?.trim() ? row.imagen_url : null,
    insignia: INSIGNIAS.includes(row.insignia as InsigniaProducto)
      ? (row.insignia as InsigniaProducto)
      : null,
    servicioId: row.servicio_id === null ? null : String(row.servicio_id),
    descripcion: row.descripcion ?? '',
    modoUso: row.modo_uso ?? '',
    ingredientes: row.ingredientes ?? '',
    stock: row.stock,
  }
}
