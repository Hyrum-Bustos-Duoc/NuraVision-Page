import type { RetornoWebpay } from './pago.types'

/**
 * Lee lo que Transbank dejo en la URL de retorno.
 *
 * Es logica pura —de una cadena de busqueda a un objeto— para poder probarla sin
 * navegador, porque de aqui depende que la pantalla de resultado distinga un
 * pago completado de un abandono.
 *
 * ----------------------------------------------------------------------------
 * POR QUE SE LEEN DOS PARAMETROS Y NO UNO
 * ----------------------------------------------------------------------------
 * Transbank usa nombres distintos segun lo que paso:
 *
 *   · `token_ws`  -> la clienta termino el formulario (pago o rechazo).
 *   · `TBK_TOKEN` -> la clienta se fue sin pagar, o se agoto el tiempo.
 *
 * Mirar solo `token_ws` haria que un abandono se viera como una pantalla sin
 * datos, que es lo peor posible: la clienta no sabria si le cobraron.
 *
 * Hay un tercer caso que Transbank documenta y que aqui se resuelve solo: que
 * lleguen LOS DOS. Ocurre cuando se reintenta un pago en una sesion anulada.
 * Se da prioridad a `token_ws`, porque si existe hay un cobro real que
 * confirmar; `TBK_TOKEN` se refiere entonces al intento viejo.
 */
export function leerRetornoWebpay(busqueda: string): RetornoWebpay {
  const params = new URLSearchParams(busqueda)

  const limpio = (valor: string | null): string | null => {
    const texto = (valor ?? '').trim()
    return texto === '' ? null : texto
  }

  const tokenWs = limpio(params.get('token_ws'))
  const tbkToken = limpio(params.get('TBK_TOKEN'))

  // Con los dos presentes manda `token_ws`: se devuelve `tbkToken` en null para
  // que quien decida no tenga que repetir esta regla.
  if (tokenWs !== null) return { tokenWs, tbkToken: null }
  return { tokenWs: null, tbkToken }
}

/** Si la URL de retorno no trae nada que procesar. */
export function retornoVacio(retorno: RetornoWebpay): boolean {
  return retorno.tokenWs === null && retorno.tbkToken === null
}
