/**
 * Programa de puntos para clientes registrados.
 *
 * ⚠️ REGLA PROVISIONAL. El cliente aún no define cómo quiere que funcione la
 * acumulación (cuántos puntos, si dependen del servicio o del monto, si
 * caducan, en qué se canjean). Lo que hay aquí es un marcador de posición
 * para poder mostrar el flujo completo.
 *
 * Todo lo que hay que cambiar cuando llegue la definición está en este
 * archivo: el resto de la aplicación solo llama a estas funciones.
 */

/** Un punto por cada $1.000 del servicio. */
const CLP_POR_PUNTO = 1000

/** Puntos que corresponden a un monto, sin considerar quién reservó. */
export function pointsForPrice(price: number): number {
  return Math.floor(price / CLP_POR_PUNTO)
}
