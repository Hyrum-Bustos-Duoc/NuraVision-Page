import type { Comprobante } from './pago.types'

/**
 * Que le decimos a la clienta sobre su cobro.
 *
 * Existe porque `aprobado` no basta y equivocarse aqui cuesta dinero:
 *
 *   · `aprobado`     — se cobro y la reserva/pedido quedo confirmado.
 *   · `revision`     — se cobro, pero la reserva/pedido ya no estaba pendiente
 *                      (por ejemplo, se cancelo mientras pagaba). El servidor lo
 *                      explica en `motivo`. NO se puede presentar como confirmado.
 *   · `rechazado`    — el banco lo rechazo. Es el unico caso en que se puede
 *                      afirmar que no hubo cargo por decision del medio de pago.
 *   · `anulado`      — la clienta abandono el formulario de Webpay: no hubo cargo.
 *   · `incierto`     — 'error' u otro estado sin cerrar: el servidor NO sabe si se
 *                      cobro (commit y consulta fallaron, o cobro duplicado). Ni
 *                      «no se te cobró» ni ofrecer pagar otra vez.
 */
export type ResultadoPago = 'aprobado' | 'revision' | 'rechazado' | 'anulado' | 'incierto'

export function resultadoDePago(c: Comprobante): ResultadoPago {
  if (c.aprobado) return c.motivo ? 'revision' : 'aprobado'
  if (c.estado === 'rechazado') return 'rechazado'
  if (c.estado === 'anulado') return 'anulado'
  return 'incierto'
}

/** Solo se ofrece reintentar cuando consta que no hubo cargo. */
export function admiteReintento(resultado: ResultadoPago): boolean {
  return resultado === 'rechazado' || resultado === 'anulado'
}
