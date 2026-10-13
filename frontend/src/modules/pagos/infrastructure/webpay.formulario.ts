import type { InicioPago } from '../domain/pago.types'

/**
 * Lleva el navegador al formulario de Webpay.
 *
 * ----------------------------------------------------------------------------
 * POR QUE UN FORMULARIO Y NO UNA REDIRECCION
 * ----------------------------------------------------------------------------
 * Webpay espera el token como un campo `token_ws` enviado por POST. Lo natural
 * seria `window.location.href = url + '?token_ws=' + token`, y no funciona:
 * Webpay responde que el token no existe, porque no lo busca en la query.
 *
 * Asi que se crea un formulario de verdad, se le pone el campo oculto y se
 * envia. Es la via que documenta Transbank y la que usan todos sus SDK.
 *
 * El formulario se añade al documento antes de enviarlo porque un formulario
 * desconectado del DOM no se envia en todos los navegadores.
 */
export function enviarAWebpay(inicio: InicioPago): void {
  const formulario = document.createElement('form')
  formulario.method = 'POST'
  formulario.action = inicio.url
  // Oculto y fuera de la vista: la pagina solo se ve un instante, pero si la red
  // va lenta no debe asomar un formulario a medio pintar.
  formulario.hidden = true

  const campo = document.createElement('input')
  campo.type = 'hidden'
  campo.name = 'token_ws'
  campo.value = inicio.token
  formulario.appendChild(campo)

  document.body.appendChild(formulario)
  formulario.submit()
}
