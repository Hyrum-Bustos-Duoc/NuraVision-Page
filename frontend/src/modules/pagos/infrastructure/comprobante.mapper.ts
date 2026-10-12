import type { Comprobante, DestinoPago, EstadoPago } from '../domain/pago.types'

/**
 * Respuesta de `webpay-confirmar-transaccion` tal como llega.
 *
 * Todo es opcional porque NO siempre llega el comprobante completo: un abandono
 * (TBK_TOKEN) responde solo `{ estado, aprobado, motivo }`, y una respuesta
 * `procesando` aun no tiene datos de la tarjeta. La pantalla recibe siempre un
 * `Comprobante` entero y no vuelve a defenderse.
 */
export interface RespuestaConfirmacion {
  estado?: EstadoPago
  aprobado?: boolean
  ordenCompra?: string | null
  codigo?: string | null
  monto?: number | null
  montoTotal?: number | null
  saldo?: number | null
  codigoAutorizacion?: string | null
  tipoPago?: string | null
  cuotas?: number | null
  tarjetaFinal?: string | null
  tipo?: 'pedido' | 'reserva'
  motivo?: string
  repetida?: boolean
  procesando?: boolean
  error?: string
}

const numero = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * `pendiente` es lo que se recordo al salir a Webpay (ver
 * pago-pendiente.storage). Solo se usa si la respuesta no dice si era una
 * reserva o un pedido.
 */
export function toComprobante(
  r: RespuestaConfirmacion,
  pendiente: DestinoPago | null = null,
): Comprobante {
  return {
    // Sin estado no hay nada aprobado: se lee como error, nunca como cobro.
    estado: r.estado ?? 'error',
    aprobado: r.aprobado === true,
    ordenCompra: r.ordenCompra ?? '',
    codigo: r.codigo ?? null,
    monto: numero(r.monto),
    // null = se cobro el total (el servidor solo lo envia con abono).
    montoTotal: numero(r.montoTotal),
    saldo: numero(r.saldo),
    codigoAutorizacion: r.codigoAutorizacion ?? null,
    tipoPago: r.tipoPago ?? null,
    cuotas: numero(r.cuotas),
    tarjetaFinal: r.tarjetaFinal ?? null,
    // Manda lo que dice el servidor; si calla, lo recordado al salir. 'pedido'
    // como ultimo recurso solo cambia el enlace de salida (tienda en vez de
    // mis reservas); no afirma nada del cobro.
    tipo: r.tipo ?? pendiente?.tipo ?? 'pedido',
    motivo: r.motivo,
    repetida: r.repetida,
    procesando: r.procesando,
  }
}
