import type { ProductoRepository } from '../domain/producto.repository'
import type { Producto } from '../domain/producto.types'

/** Caso de uso: el catalogo activo de la tienda. */
export async function obtenerProductos(repositorio: ProductoRepository): Promise<Producto[]> {
  return repositorio.listarActivos()
}
