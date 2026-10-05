import type { Tables, TablesInsert } from '@/shared/types/supabase'
import { esCategoria } from '../domain/categorias'
import type { DatosProducto, InsigniaProducto, Producto, ProductoAdmin } from '../domain/producto.types'

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

/**
 * Fila -> producto del panel. A diferencia de `toProducto`, nunca descarta:
 * una fila con categoria desconocida (heredada de antes de 0013) se muestra
 * marcada para que se pueda corregir.
 */
export function toProductoAdmin(row: ProductoRow): ProductoAdmin {
  return {
    id: String(row.id),
    slug: row.slug,
    nombre: row.nombre,
    categoria: row.categoria,
    categoriaValida: esCategoria(row.categoria),
    tamano: row.tamano ?? '',
    precio: row.precio,
    precioAnterior: row.precio_anterior,
    imagenUrl: row.imagen_url?.trim() ? row.imagen_url : null,
    insignia: INSIGNIAS.includes(row.insignia as InsigniaProducto)
      ? (row.insignia as InsigniaProducto)
      : null,
    servicioId: row.servicio_id === null ? null : String(row.servicio_id),
    descripcion: row.descripcion ?? '',
    modoUso: row.modo_uso ?? '',
    ingredientes: row.ingredientes ?? '',
    stock: row.stock,
    activo: row.activo,
    orden: row.orden ?? 0,
  }
}

/** Datos del formulario -> fila. Recorta los textos y vacia lo que quedo en blanco. */
export function fromDatosProducto(datos: DatosProducto): TablesInsert<'productos'> {
  const servicioId = datos.servicioId === null ? null : Number(datos.servicioId)
  return {
    slug: datos.slug.trim(),
    nombre: datos.nombre.trim(),
    categoria: datos.categoria,
    tamano: datos.tamano.trim(),
    precio: datos.precio,
    precio_anterior: datos.precioAnterior,
    imagen_url: datos.imagenUrl?.trim() ? datos.imagenUrl : null,
    insignia: datos.insignia,
    servicio_id: servicioId !== null && Number.isSafeInteger(servicioId) ? servicioId : null,
    descripcion: datos.descripcion.trim(),
    modo_uso: datos.modoUso.trim(),
    ingredientes: datos.ingredientes.trim(),
    stock: datos.stock,
    activo: datos.activo,
    orden: datos.orden,
  }
}
