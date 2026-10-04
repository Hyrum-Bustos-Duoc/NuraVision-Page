/**
 * Punto de entrada de la capa de aplicacion del modulo tienda.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { obtenerProductos } from './obtener-productos.usecase'
export {
  filtrarPorCategoria,
  muestraBannerCombo,
  productosRelacionados,
  productosDeServicio,
  etiquetaImagen,
} from '../domain/producto.reglas'
export {
  CATEGORIAS_PRODUCTO,
  ETIQUETA_INSIGNIA,
  etiquetaCategoria,
  esCategoria,
  filtroDesdeParam,
} from '../domain/categorias'
export type { FiltroCategoria } from '../domain/categorias'
export type { Producto, CategoriaProducto, InsigniaProducto } from '../domain/producto.types'
export type { ProductoRepository } from '../domain/producto.repository'
export { SLUG_KIT_COMBO } from '../domain/combo'
export {
  listarTodosLosProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
} from './gestionar-productos.usecase'
export { motivoParaNoGuardarProducto, slugDesdeNombre, PRECIO_MAXIMO } from '../domain/producto.gestion'
export type { DatosProducto, ProductoAdmin } from '../domain/producto.types'
export type { ProductoGestionRepository } from '../domain/producto.repository'
