import type { RetornoWebpay } from './pago.types'

/**
 * Lee lo que Transbank dejo en la URL de retorno.
 *
 * Es logica pura —de una cadena de busqueda a un objeto— para poder probarla sin
 * navegador, porque de aqui depende que la pantalla de resultado distinga un
 * pago completado de un abandono o de una sesion expirada.
 *
 * ----------------------------------------------------------------------------
 * LAS CUATRO FORMAS DE VOLVER
 * ----------------------------------------------------------------------------
 * Transbank usa nombres distintos segun lo que paso, y no mirarlos todos deja
 * pantallas sin explicacion:
 *
 *   · `token_ws`              -> se completo el formulario (aprobado o rechazado).
 *   · `TBK_TOKEN` + orden     -> la clienta se fue sin pagar.
 *   · solo `TBK_ORDEN_COMPRA` -> la sesion de pago expiro. NO llega token.
 *   · nada                    -> alguien abrio esta direccion a mano.
 *
 * Los parametros llegan siempre por GET porque la `return_url` apunta a la
 * funcion `webpay-retorno`, que absorbe el POST que Transbank usa en el
 * abandono y el timeout y rebota con la query normalizada.
 */
export function leerRetornoWebpay(busqueda: string): RetornoWebpay {
  const params = new URLSearchParams(busqueda)

  const limpio = (valor: string | null): string | null => {
    const texto = (valor ?? '').trim()
    return texto === '' ? null : texto
  }

  const tokenWs = limpio(params.get('token_ws'))
  const tbkToken = limpio(params.get('TBK_TOKEN'))
  const ordenCompra = limpio(params.get('TBK_ORDEN_COMPRA'))

  // Con los dos tokens presentes manda `token_ws`: si existe hay un cobro real
  // que confirmar, y `TBK_TOKEN` se refiere entonces al intento viejo. Ocurre al
  // reintentar sobre una sesion ya anulada.
  if (tokenWs !== null) return { tokenWs, tbkToken: null, ordenCompra }
  return { tokenWs: null, tbkToken, ordenCompra }
}

/** Si la URL de retorno no trae absolutamente nada que procesar. */
export function retornoVacio(retorno: RetornoWebpay): boolean {
  return retorno.tokenWs === null && retorno.tbkToken === null && retorno.ordenCompra === null
}

/**
 * Si la sesion de pago expiro.
 *
 * Se reconoce por la ausencia de token junto a la presencia de la orden: sin
 * token no hay nada que confirmar contra Transbank, pero si se sabe que hubo un
 * intento y que se quedo sin tiempo. Distinguirlo es lo que permite decir
 * "se agoto el tiempo" en vez de "no hay nada aqui".
 */
export function esTimeout(retorno: RetornoWebpay): boolean {
  return retorno.tokenWs === null && retorno.tbkToken === null && retorno.ordenCompra !== null
}
