import type { EstadoPago } from '@/shared/types/supabase'

export type { EstadoPago }

/**
 * Que se va a pagar.
 *
 * Se identifica por el CODIGO y no por el id, aunque las Edge Functions acepten
 * los dos. El motivo es el permiso: quien compra o reserva sin cuenta no tiene
 * un `auth.uid()` que cruzar, y su unica forma de demostrar que el pedido es
 * suyo es el codigo, que solo aparece en su pantalla. Mandando siempre el
 * codigo, el mismo camino sirve con sesion y sin ella.
 *
 * Para una reserva, ademas, no hay alternativa: la politica de 0003 no concede
 * SELECT sobre `reservas`, asi que el navegador nunca llega a conocer su id.
 */
export interface DestinoPago {
  tipo: 'pedido' | 'reserva'
  codigo: string
}

/** Lo que devuelve la funcion al iniciar el cobro. */
export interface InicioPago {
  /** El token que hay que enviar a Webpay en el campo `token_ws`. */
  token: string
  /** A donde se envia el formulario. Lo fija Transbank, no se construye aqui. */
  url: string
  ordenCompra: string
  monto: number
}

/**
 * El comprobante que se le muestra a la clienta.
 *
 * No incluye el token: ya se consumio, y mostrarlo solo invitaria a compartir
 * por error algo que identifica una transaccion.
 */
export interface Comprobante {
  estado: EstadoPago
  aprobado: boolean
  /** La orden de compra de Transbank. Util para reclamar ante el banco. */
  ordenCompra: string
  /**
   * El codigo del pedido o de la reserva. Es el que la clienta reconoce y con el
   * que nos escribe, asi que es el que va mas visible en el comprobante.
   */
  codigo: string | null
  monto: number
  codigoAutorizacion: string | null
  tipoPago: string | null
  cuotas: number | null
  tarjetaFinal: string | null
  tipo: 'pedido' | 'reserva'
  /** Por que no se aprobo, cuando no se aprobo. */
  motivo?: string
  /** La confirmacion ya se habia hecho: es una recarga de la pantalla. */
  repetida?: boolean
}

/**
 * Lo que Transbank deja en la URL al devolver a la clienta.
 *
 * Son dos casos distintos y excluyentes:
 *
 *   · `tokenWs` ("token_ws"): la clienta completo el formulario. Hay que
 *     confirmar el cobro.
 *   · `tbkToken` ("TBK_TOKEN"): la clienta ABANDONO el formulario. No hay nada
 *     que confirmar, solo que anotar.
 *
 * Y hay un tercer caso: el TIMEOUT. Transbank no manda ningun token, solo
 * `TBK_ORDEN_COMPRA` y `TBK_ID_SESION`. No se puede confirmar nada, pero
 * tampoco es una URL vacia: se sabe que la sesion de pago expiro y se puede
 * decir, que es muy distinto de no mostrar nada.
 *
 * Que llegue todo vacio tambien es un caso real: alguien que abre
 * /confirmacion-pago a mano.
 */
export interface RetornoWebpay {
  tokenWs: string | null
  tbkToken: string | null
  /** `TBK_ORDEN_COMPRA`. Lo unico que llega cuando la sesion expira. */
  ordenCompra: string | null
}

/** Etiquetas legibles de los medios de pago que informa Transbank. */
export const ETIQUETA_TIPO_PAGO: Record<string, string> = {
  VD: 'Venta débito',
  VN: 'Venta normal',
  VC: 'Venta en cuotas',
  SI: 'Sin interés, 3 cuotas',
  S2: 'Sin interés, 2 cuotas',
  NC: 'N cuotas sin interés',
  VP: 'Venta prepago',
}
