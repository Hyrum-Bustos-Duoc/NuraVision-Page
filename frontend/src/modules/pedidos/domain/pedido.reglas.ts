import { COSTO_DESPACHO, UMBRAL_DESPACHO_GRATIS, comunaConDespacho } from './despacho'
import type { EntregaPedido, EstadoPedido, MetodoPagoPedido, NuevoPedido } from './pedido.types'

/**
 * Reglas del checkout.
 *
 * ESPEJO DE crear_pedido() (0013_tienda.sql): sirven para mostrar el resumen y
 * avisar antes de enviar. La base vuelve a validar todo y es la que manda.
 */

/** Mismo porcentaje que c_descuento_combo en la funcion. */
export const DESCUENTO_COMBO = 0.15

export function costoEnvio(entrega: EntregaPedido, subtotal: number): number {
  return entrega === 'despacho' && subtotal < UMBRAL_DESPACHO_GRATIS ? COSTO_DESPACHO : 0
}

export interface LineaParaDescuento {
  categoria: string
  servicioId: string | null
  precio: number
  cantidad: number
}

/**
 * Combo: 15 % en los kits vinculados al servicio de la cita donde se entregan.
 * Se redondea por linea, igual que la funcion.
 */
export function descuentoCombo(
  lineas: LineaParaDescuento[],
  entrega: EntregaPedido,
  servicioDeLaCita: string | null,
): number {
  if (entrega !== 'cita' || !servicioDeLaCita) return 0
  return lineas.reduce((total, l) => {
    const aplica = l.categoria === 'kits' && l.servicioId === servicioDeLaCita
    return aplica ? total + Math.round(l.precio * l.cantidad * DESCUENTO_COMBO) : total
  }, 0)
}

export interface Totales {
  subtotal: number
  envio: number
  descuento: number
  total: number
}

export function calcularTotales(
  lineas: LineaParaDescuento[],
  entrega: EntregaPedido,
  servicioDeLaCita: string | null,
): Totales {
  const subtotal = lineas.reduce((total, l) => total + l.precio * l.cantidad, 0)
  const envio = costoEnvio(entrega, subtotal)
  const descuento = descuentoCombo(lineas, entrega, servicioDeLaCita)
  return { subtotal, envio, descuento, total: subtotal + envio - descuento }
}

/** Pagar en el estudio no tiene sentido si el pedido no pasa por el estudio. */
export function metodoPermitido(metodo: MetodoPagoPedido, entrega: EntregaPedido): boolean {
  return !(metodo === 'estudio' && entrega === 'despacho')
}

export function correoValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
}

/**
 * Errores del paso de entrega, por campo. Vacio = se puede continuar.
 * Los textos son los mismos que devuelve la base, para que no cambien segun
 * quien detecte el problema.
 */
export function erroresDeEntrega(
  datos: Pick<NuevoPedido, 'nombre' | 'email' | 'entrega' | 'direccion' | 'comuna' | 'reservaId'>,
): Partial<Record<'nombre' | 'email' | 'direccion' | 'comuna' | 'reserva', string>> {
  const errores: Partial<Record<'nombre' | 'email' | 'direccion' | 'comuna' | 'reserva', string>> = {}
  if (!datos.nombre.trim()) errores.nombre = 'Necesitamos tu nombre para el pedido.'
  if (!correoValido(datos.email)) errores.email = 'Revisa tu correo: lo necesitamos para avisarte del pedido.'
  if (datos.entrega === 'despacho') {
    if (!datos.direccion?.trim()) errores.direccion = 'Falta la dirección de despacho.'
    if (!datos.comuna?.trim()) errores.comuna = 'Indica la comuna.'
    else if (!comunaConDespacho(datos.comuna)) {
      errores.comuna = 'Por ahora despachamos solo en Viña del Mar y Valparaíso.'
    }
  }
  if (datos.entrega === 'cita' && !datos.reservaId) {
    errores.reserva = 'Elige la cita en la que quieres recibirlo.'
  }
  return errores
}

export const ETIQUETA_ENTREGA: Record<EntregaPedido, string> = {
  despacho: 'Despacho',
  retiro: 'Retiro en estudio',
  cita: 'Entrega en cita',
}

export const ETIQUETA_PAGO: Record<MetodoPagoPedido, string> = {
  webpay: 'Webpay',
  transferencia: 'Transferencia',
  estudio: 'En el estudio',
}

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  preparando: 'Preparando',
  listo: 'Listo',
  despachado: 'Despachado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

/** Orden en que avanza un pedido. `cancelado` queda fuera del flujo. */
export const ESTADOS_PEDIDO: EstadoPedido[] = [
  'pendiente_pago',
  'pagado',
  'preparando',
  'listo',
  'despachado',
  'entregado',
  'cancelado',
]
