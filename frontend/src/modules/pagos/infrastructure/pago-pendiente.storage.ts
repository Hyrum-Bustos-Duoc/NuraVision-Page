import type { DestinoPago } from '../domain/pago.types'

/**
 * Que se estaba pagando cuando el navegador se fue a Webpay.
 *
 * La pantalla de resultado lo necesita para ofrecer «reintentar el pago» de la
 * MISMA reserva o pedido: un abandono o un rechazo no siempre traen el codigo
 * en la respuesta, y sin el no hay a que volver a cobrar.
 *
 * sessionStorage y no localStorage: el dato vale para esta pestaña y este
 * viaje de ida y vuelta a Webpay, no para la proxima visita. No guarda montos:
 * lo que se cobra lo sigue decidiendo el servidor con el codigo.
 *
 * Todo va en try/catch: un navegador sin almacenamiento (modo privado de
 * Safari antiguo, cuota llena) solo pierde el reintento, no el pago.
 */
const CLAVE = 'nuravision:pago-pendiente'

export function recordarPagoPendiente(destino: DestinoPago): void {
  try {
    window.sessionStorage.setItem(CLAVE, JSON.stringify(destino))
  } catch {
    // Sin almacenamiento: la pantalla de resultado no ofrecera reintentar.
  }
}

export function leerPagoPendiente(): DestinoPago | null {
  try {
    const crudo: unknown = JSON.parse(window.sessionStorage.getItem(CLAVE) ?? 'null')
    if (crudo === null || typeof crudo !== 'object' || !('tipo' in crudo) || !('codigo' in crudo)) {
      return null
    }
    const { tipo, codigo } = crudo
    if ((tipo !== 'pedido' && tipo !== 'reserva') || typeof codigo !== 'string' || codigo === '') {
      return null
    }
    return { tipo, codigo }
  } catch {
    return null
  }
}

export function olvidarPagoPendiente(): void {
  try {
    window.sessionStorage.removeItem(CLAVE)
  } catch {
    // Nada que limpiar.
  }
}
