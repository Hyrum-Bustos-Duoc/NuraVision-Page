import type { Comprobante, DestinoPago, InicioPago, RetornoWebpay } from './pago.types'

/**
 * Lo que la aplicacion necesita de la pasarela de pago.
 *
 * Las dos operaciones son el reflejo exacto de como funciona Webpay Plus: una
 * para abrir el cobro y otra para cerrarlo, separadas por una vuelta al
 * navegador de la clienta. No se pueden juntar en un solo metodo porque entre
 * medias la pagina se abandona.
 *
 * Ninguna de las dos recibe un monto. Esta decidido asi en el servidor: el
 * importe se lee de la base con la service_role key, de modo que el navegador
 * —que corre con una clave publica— no pueda influir en lo que se cobra.
 */
export interface PagoRepository {
  /** Abre el cobro y devuelve a donde hay que enviar el formulario. */
  iniciar(destino: DestinoPago): Promise<InicioPago>

  /**
   * Cierra el cobro con lo que Transbank dejo en la URL de retorno.
   *
   * Es idempotente: llamarla dos veces con el mismo token devuelve el mismo
   * comprobante en vez de fallar, que es lo que permite recargar la pantalla de
   * resultado.
   */
  confirmar(retorno: RetornoWebpay): Promise<Comprobante>
}

/**
 * Un fallo al iniciar el cobro, con el motivo que escribio el servidor.
 *
 * Existe como clase propia para poder distinguir "ya esta pagado" de un error
 * cualquiera: en ese caso no hay que mandar a la clienta a Webpay ni asustarla
 * con un mensaje de error, sino llevarla al comprobante que ya tiene.
 */
export class ErrorDePago extends Error {
  readonly yaPagado: boolean

  constructor(mensaje: string, yaPagado = false) {
    super(mensaje)
    this.name = 'ErrorDePago'
    this.yaPagado = yaPagado
  }
}
