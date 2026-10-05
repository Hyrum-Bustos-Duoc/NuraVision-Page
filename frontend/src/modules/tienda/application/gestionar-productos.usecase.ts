import { motivoParaNoGuardarProducto } from '../domain/producto.gestion'
import type { ProductoGestionRepository } from '../domain/producto.repository'
import type { DatosProducto, ProductoAdmin } from '../domain/producto.types'

/** Catalogo completo, activos e inactivos, para el panel. */
export async function listarTodosLosProductos(repo: ProductoGestionRepository): Promise<ProductoAdmin[]> {
  return repo.listarTodos()
}

export async function crearProducto(
  repo: ProductoGestionRepository,
  datos: DatosProducto,
): Promise<ProductoAdmin> {
  const motivo = motivoParaNoGuardarProducto(datos)
  if (motivo !== null) throw new Error(motivo)
  return repo.crear(datos)
}

export async function actualizarProducto(
  repo: ProductoGestionRepository,
  id: string,
  datos: DatosProducto,
): Promise<ProductoAdmin> {
  const motivo = motivoParaNoGuardarProducto(datos)
  if (motivo !== null) throw new Error(motivo)
  return repo.actualizar(id, datos)
}

export async function eliminarProducto(repo: ProductoGestionRepository, id: string): Promise<void> {
  return repo.eliminar(id)
}
