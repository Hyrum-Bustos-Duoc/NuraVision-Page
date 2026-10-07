import type { FiltroCategoria } from './categorias'
import type { Producto } from './producto.types'

export function filtrarPorCategoria(productos: Producto[], filtro: FiltroCategoria): Producto[] {
  return filtro === 'todos' ? productos : productos.filter((p) => p.categoria === filtro)
}

/**
 * El banner del combo de manos solo tiene sentido donde se ven kits o productos
 * de manos (spec §7).
 */
export function muestraBannerCombo(filtro: FiltroCategoria): boolean {
  return filtro === 'todos' || filtro === 'kits' || filtro === 'unas_manos'
}

/**
 * "Combina bien con": primero la misma categoria y los kits, despues el resto
 * del catalogo hasta completar. Nunca incluye el producto actual ni repite.
 */
export function productosRelacionados(
  actual: Producto,
  catalogo: Producto[],
  maximo = 4,
): Producto[] {
  const otros = catalogo.filter((p) => p.slug !== actual.slug)
  const cercanos = otros.filter((p) => p.categoria === actual.categoria || p.categoria === 'kits')
  const resto = otros.filter((p) => !cercanos.includes(p))
  return [...cercanos, ...resto].slice(0, maximo)
}

/** Productos que el estudio usa en un servicio. Alimenta el upsell de Nuria. */
export function productosDeServicio(catalogo: Producto[], servicioId: string): Producto[] {
  return catalogo.filter((p) => p.servicioId === servicioId)
}

/** Palabras que no aportan a la etiqueta de una imagen pendiente. */
const RELLENO = new Set(['de', 'del', 'la', 'el', 'en', 'para', 'y', 'nura', 'estudio'])

/**
 * Etiqueta del marcador a rayas mientras el producto no tenga foto:
 * "Aceite de cutícula Nura" -> "aceite cutícula".
 */
export function etiquetaImagen(producto: Pick<Producto, 'nombre'>): string {
  return producto.nombre
    .toLowerCase()
    .split(/\s+/)
    .filter((palabra) => palabra && !RELLENO.has(palabra))
    .slice(0, 2)
    .join(' ')
}
