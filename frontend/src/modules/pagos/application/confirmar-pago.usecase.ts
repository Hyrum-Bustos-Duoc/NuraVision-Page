import type { PagoRepository } from '../domain/pago.repository'
import type { Comprobante, RetornoWebpay } from '../domain/pago.types'
import { esTimeout, retornoVacio } from '../domain/webpay.retorno'

/**
 * Cierra el cobro con lo que Transbank dejo en la URL.
 *
 * Devuelve `null` cuando no hay nada que confirmar, y son DOS situaciones
 * distintas que comparten respuesta:
 *
 *   · La URL no trae nada: alguien abrio /confirmacion-pago a mano o volvio a
 *     ella desde el historial.
 *   · La sesion de pago expiro: llega la orden pero ningun token, y sin token no
 *     hay nada que preguntarle a Transbank.
 *
 * En los dos casos se corta ANTES de llamar al servidor. Sin esto, el timeout
 * gastaria una llamada para recibir un 400 "falta el token" que no ayuda a
 * nadie; quien decide que decir en pantalla es la vista, que sabe distinguirlos.
 */
export async function confirmarPago(
  repo: PagoRepository,
  retorno: RetornoWebpay,
): Promise<Comprobante | null> {
  if (retornoVacio(retorno) || esTimeout(retorno)) return null
  return repo.confirmar(retorno)
}
