import type { CategoriaProducto, InsigniaProducto } from './producto.types'

/** Orden y etiquetas de los filtros de la tienda. */
export const CATEGORIAS_PRODUCTO: { id: CategoriaProducto; label: string }[] = [
  { id: 'unas_manos', label: 'Uñas y manos' },
  { id: 'cabello', label: 'Cabello' },
  { id: 'piel', label: 'Piel' },
  { id: 'kits', label: 'Kits' },
  { id: 'gift_cards', label: 'Gift cards' },
]

/** El filtro "Todos" no es una categoria: es la ausencia de filtro. */
export type FiltroCategoria = CategoriaProducto | 'todos'

export function etiquetaCategoria(id: CategoriaProducto): string {
  return CATEGORIAS_PRODUCTO.find((c) => c.id === id)?.label ?? id
}

export function esCategoria(valor: string | null | undefined): valor is CategoriaProducto {
  return CATEGORIAS_PRODUCTO.some((c) => c.id === valor)
}

/**
 * Lo que llega en `?categoria=` -> filtro. Un valor desconocido no es un error
 * que mostrar: se ignora y se ve todo el catalogo.
 */
export function filtroDesdeParam(valor: string | null): FiltroCategoria {
  return esCategoria(valor) ? valor : 'todos'
}

export const ETIQUETA_INSIGNIA: Record<InsigniaProducto, string> = {
  mas_vendido: 'Más vendido',
  nuevo: 'Nuevo',
  kit: 'Kit',
}
