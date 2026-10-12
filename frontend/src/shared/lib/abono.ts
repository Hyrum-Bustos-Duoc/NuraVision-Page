/**
 * Lectura tolerante de un abono en CLP enteros (cambio abono-servicios-unas).
 *
 * Una sola copia para las cuatro fronteras que lo leen: `servicios.abono`,
 * `reservas.abono` (modulo reservas y panel del estudio) y el `Booking` local
 * guardado en el navegador. Todas necesitan lo mismo: si el valor falta —base
 * sin 0015, reserva local anterior al cambio— o no es un entero >= 0, se lee
 * como 0, que significa «sin abono» y no muestra linea ni pide pago.
 */
export function aAbono(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) return 0
  return valor
}

/**
 * Lo que queda por pagar en el estudio despues del abono.
 *
 * Nunca negativo: el panel ya impide un abono mayor que el precio «desde», pero
 * el abono de una reserva es una copia y el precio que se muestra puede ser el
 * vigente del servicio (`reservas` no guarda precio), que pudo bajar despues.
 */
export function saldoTrasAbono(precio: number, abono: number): number {
  return Math.max(0, precio - abono)
}

/**
 * El abono que de verdad se cobra: nunca mas que el precio de lo elegido.
 *
 * Es la misma regla que aplica la base al insertar la reserva (trigger
 * `reservas_fijar_precio`, 0019: `least(servicios.abono, floor(precio efectivo))`).
 * Si el estudio baja un precio por debajo del abono, Webpay cobra el precio, y
 * anunciar otra cifra seria mentir sobre el cargo.
 */
export function abonoACobrar(precio: number, abono: number): number {
  return Math.max(0, Math.min(abono, Math.floor(precio)))
}
