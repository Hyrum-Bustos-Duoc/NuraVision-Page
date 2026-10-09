import type { PagoRepository } from '../domain/pago.repository'
import type { Comprobante, RetornoWebpay } from '../domain/pago.types'
import { retornoVacio } from '../domain/webpay.retorno'

/**
 * Cierra el cobro con lo que Transbank dejo en la URL.
 *
 * Corta antes de llamar al servidor cuando la URL no trae nada. Pasa de verdad
 * —alguien abre /confirmacion-pago a mano, o vuelve a ella desde el historial
 * del navegador— y sin esta comprobacion se gastaria una llamada para recibir un
 * 400 que no ayuda a nadie.
 */
export async function confirmarPago(
  repo: PagoRepository,
  retorno: RetornoWebpay,
): Promise<Comprobante | null> {
  if (retornoVacio(retorno)) return null
  return repo.confirmar(retorno)
}
