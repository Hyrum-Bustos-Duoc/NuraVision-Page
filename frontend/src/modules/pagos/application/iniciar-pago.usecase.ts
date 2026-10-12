import { ErrorDePago, type PagoRepository } from '../domain/pago.repository'
import type { DestinoPago, InicioPago } from '../domain/pago.types'

/**
 * Abre un cobro con Webpay.
 *
 * Lo unico que valida es que haya un codigo: sin el, la Edge Function
 * responderia 400 y la clienta veria un error de la pasarela por algo que se
 * puede detectar aqui. Todo lo demas —el monto, el permiso, que no este ya
 * pagado— lo decide el servidor, y no se duplica en el navegador porque una
 * copia de esas reglas que se desincronice es peor que no tenerla.
 */
export async function iniciarPago(
  repo: PagoRepository,
  destino: DestinoPago,
): Promise<InicioPago> {
  if (destino.codigo.trim() === '') {
    throw new ErrorDePago('No sabemos que hay que pagar.')
  }
  return repo.iniciar(destino)
}
