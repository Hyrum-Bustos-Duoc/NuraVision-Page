import type { LineaCarrito } from './carrito.types'

/** Tope por producto. Es el mismo que acepta crear_pedido() en la base. */
export const MAXIMO_POR_LINEA = 20

function acotar(cantidad: number): number {
  return Math.min(MAXIMO_POR_LINEA, Math.max(0, Math.floor(cantidad)))
}

/** Agregar un producto ya presente suma la cantidad (spec §14). */
export function agregarLinea(lineas: LineaCarrito[], slug: string, cantidad = 1): LineaCarrito[] {
  if (cantidad <= 0) return lineas
  const existente = lineas.find((l) => l.slug === slug)
  if (!existente) return [...lineas, { slug, cantidad: acotar(cantidad) }]
  return lineas.map((l) => (l.slug === slug ? { ...l, cantidad: acotar(l.cantidad + cantidad) } : l))
}

/** Llevar una linea a 0 la elimina (spec §4.1, stepper del carrito). */
export function cambiarCantidad(lineas: LineaCarrito[], slug: string, cantidad: number): LineaCarrito[] {
  const nueva = acotar(cantidad)
  if (nueva === 0) return quitarLinea(lineas, slug)
  return lineas.map((l) => (l.slug === slug ? { ...l, cantidad: nueva } : l))
}

export function quitarLinea(lineas: LineaCarrito[], slug: string): LineaCarrito[] {
  return lineas.filter((l) => l.slug !== slug)
}

/** El contador del header: suma de cantidades, no de lineas. */
export function contarUnidades(lineas: LineaCarrito[]): number {
  return lineas.reduce((total, l) => total + l.cantidad, 0)
}

/** Deja solo las lineas cuyo producto sigue en el catalogo. */
export function podarLineas(lineas: LineaCarrito[], existe: (slug: string) => boolean): LineaCarrito[] {
  const vigentes = lineas.filter((l) => existe(l.slug))
  return vigentes.length === lineas.length ? lineas : vigentes
}

/**
 * Lo guardado en el navegador -> lineas validas.
 *
 * Nunca lanza: localStorage lo puede editar cualquiera y puede venir de una
 * version anterior. Lo que no tiene forma de linea se descarta.
 */
export function parsearLineas(valor: unknown): LineaCarrito[] {
  if (!Array.isArray(valor)) return []
  return valor.reduce<LineaCarrito[]>((acumulado, item) => {
    if (item === null || typeof item !== 'object') return acumulado
    const { slug, cantidad } = item as Record<string, unknown>
    if (typeof slug !== 'string' || !slug || typeof cantidad !== 'number') return acumulado
    return agregarLinea(acumulado, slug, cantidad)
  }, [])
}
