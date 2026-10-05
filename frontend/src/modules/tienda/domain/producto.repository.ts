import type { DatosProducto, Producto, ProductoAdmin } from './producto.types'

/** Puerto de lectura del catalogo de la tienda. */
export interface ProductoRepository {
  /** Productos activos, en el orden del catalogo. */
  listarActivos(): Promise<Producto[]>
}

/**
 * Puerto de escritura del catalogo, para el panel de administracion.
 *
 * Quien decide si se puede escribir es la RLS de 0013 (`es_staff()`): este
 * puerto no comprueba permisos, solo traduce lo que responde la base.
 */
export interface ProductoGestionRepository {
  /** Todos los productos, activos e inactivos. */
  listarTodos(): Promise<ProductoAdmin[]>
  crear(datos: DatosProducto): Promise<ProductoAdmin>
  actualizar(id: string, datos: DatosProducto): Promise<ProductoAdmin>
  eliminar(id: string): Promise<void>
}
