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
