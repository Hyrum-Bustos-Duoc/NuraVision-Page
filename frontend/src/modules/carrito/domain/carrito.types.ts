/**
 * Una linea del carrito.
 *
 * Solo guarda el slug y la cantidad, nunca el precio: el precio sale siempre
 * del catalogo vigente (y al pagar, de la base). Un carrito guardado hace una
 * semana no puede cobrar el precio de hace una semana.
 */
export interface LineaCarrito {
  slug: string
  cantidad: number
}
