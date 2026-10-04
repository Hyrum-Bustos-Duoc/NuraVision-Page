import type { Producto } from './producto.types'

/** Puerto de lectura del catalogo de la tienda. */
export interface ProductoRepository {
  /** Productos activos, en el orden del catalogo. */
  listarActivos(): Promise<Producto[]>
}
