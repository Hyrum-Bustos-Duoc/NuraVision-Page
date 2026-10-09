import { supabase } from '@/shared/infrastructure/supabase/client'
import { cuerpoDeFuncion, motivoDeFuncion } from '@/shared/infrastructure/supabase/funciones'
import { ErrorDePago, type PagoRepository } from '../domain/pago.repository'
import type { Comprobante, DestinoPago, InicioPago, RetornoWebpay } from '../domain/pago.types'

/**
 * Habla con las dos Edge Functions de Webpay.
 *
 * Aqui no hay ninguna regla de negocio y es a proposito: el monto, el permiso y
 * el estado del pago los decide el servidor. Esta clase traduce respuestas y
 * errores, nada mas.
 */

const CREAR = 'webpay-crear-transaccion'
const CONFIRMAR = 'webpay-confirmar-transaccion'

interface RespuestaInicio {
  token?: string
  url?: string
  buyOrder?: string
  monto?: number
  error?: string
  yaPagado?: boolean
}

class EdgePagoRepository implements PagoRepository {
  async iniciar(destino: DestinoPago): Promise<InicioPago> {
    // Se manda el codigo, no el id: es lo unico que acredita el pedido de una
    // clienta sin cuenta (ver DestinoPago).
    const cuerpo =
      destino.tipo === 'pedido'
        ? { pedidoCodigo: destino.codigo }
        : { reservaCodigo: destino.codigo }

    const { data, error } = await supabase.functions.invoke<RespuestaInicio>(CREAR, {
      body: cuerpo,
    })

    if (error) {
      // El cuerpo de un 409 trae `yaPagado`, y `invoke` no lo parsea: sin esto,
      // un pedido ya pagado se veria como un error inexplicable.
      const detalle = await cuerpoDeFuncion<RespuestaInicio>(error)
      const motivo = (await motivoDeFuncion(error)) || data?.error || error.message
      throw new ErrorDePago(motivo, detalle?.yaPagado === true)
    }

    if (!data?.token || !data.url) {
      throw new ErrorDePago('La pasarela no devolvio los datos del pago.')
    }

    return {
      token: data.token,
      url: data.url,
      ordenCompra: data.buyOrder ?? '',
      monto: typeof data.monto === 'number' ? data.monto : 0,
    }
  }

  async confirmar(retorno: RetornoWebpay): Promise<Comprobante> {
    const { data, error } = await supabase.functions.invoke<Comprobante & { error?: string }>(
      CONFIRMAR,
      { body: { tokenWs: retorno.tokenWs, tbkToken: retorno.tbkToken } },
    )

    if (error) {
      const motivo = (await motivoDeFuncion(error)) || data?.error || error.message
      throw new ErrorDePago(motivo)
    }

    if (!data) throw new ErrorDePago('La pasarela no devolvio el resultado del pago.')

    return data
  }
}

export const pagoRepository: PagoRepository = new EdgePagoRepository()
