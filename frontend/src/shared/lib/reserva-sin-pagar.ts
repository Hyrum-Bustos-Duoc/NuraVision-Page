/**
 * La ultima reserva guardada camino a Webpay, para no crear otra por la misma
 * hora.
 *
 * El cobro va DESPUES de crear la reserva (Webpay la identifica por su
 * codigo). Si la clienta sale a Webpay y vuelve sin pagar —«Atras», que en
 * Chromium recarga el flujo desde cero—, el estado de React ya no existe: sin
 * esto, reintentar crearia una segunda reserva y la primera quedaria
 * 'pendiente' ocupando el bloque.
 *
 * `clave` identifica el borrador (servicio, opcion, profesional, fecha, hora)
 * y `contacto` los datos de quien reserva: si cualquiera cambia, es otra
 * reserva y no se reutiliza el codigo.
 *
 * Vive en `shared` porque la usan dos modulos: `reservas` la escribe y `pagos`
 * la olvida al aprobarse el cobro (si no, la misma hora con el mismo contacto
 * reutilizaria un codigo ya pagado). Ningun modulo importa del otro.
 *
 * sessionStorage: vale para esta pestaña y este viaje de ida y vuelta. Todo en
 * try/catch: sin almacenamiento solo se pierde la reutilizacion.
 */
export interface ReservaSinPagar {
  clave: string
  contacto: string
  codigo: string
}

const CLAVE = 'nuravision:reserva-sin-pagar'

export function leerReservaSinPagar(): ReservaSinPagar | null {
  try {
    const crudo: unknown = JSON.parse(window.sessionStorage.getItem(CLAVE) ?? 'null')
    if (
      crudo === null ||
      typeof crudo !== 'object' ||
      !('clave' in crudo) ||
      !('contacto' in crudo) ||
      !('codigo' in crudo)
    ) {
      return null
    }
    const { clave, contacto, codigo } = crudo
    if (typeof clave !== 'string' || typeof contacto !== 'string' || typeof codigo !== 'string') {
      return null
    }
    return { clave, contacto, codigo }
  } catch {
    return null
  }
}

export function recordarReservaSinPagar(reserva: ReservaSinPagar): void {
  try {
    window.sessionStorage.setItem(CLAVE, JSON.stringify(reserva))
  } catch {
    // Sin almacenamiento: un reintento tras recargar creara otra reserva.
  }
}

export function olvidarReservaSinPagar(): void {
  try {
    window.sessionStorage.removeItem(CLAVE)
  } catch {
    // Nada que limpiar.
  }
}
