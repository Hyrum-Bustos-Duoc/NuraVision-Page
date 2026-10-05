/**
 * Reglas de despacho.
 *
 * ESPEJO DE crear_pedido() (0013_tienda.sql). La base es la que cobra; esto
 * solo sirve para mostrar cifras antes de pagar. Si cambias un valor aqui,
 * cambialo alli, o el resumen y lo cobrado dejaran de coincidir.
 */
export const COSTO_DESPACHO = 3990
export const UMBRAL_DESPACHO_GRATIS = 40000

/** Comunas con despacho, tal como se muestran. */
export const COMUNAS_CON_DESPACHO = ['Viña del Mar', 'Valparaíso'] as const

/** Lo que falta para el despacho gratis; 0 si ya se alcanzo. */
export function faltaParaDespachoGratis(subtotal: number): number {
  return Math.max(0, UMBRAL_DESPACHO_GRATIS - subtotal)
}

/** Avance hacia el despacho gratis, de 0 a 1. */
export function avanceDespachoGratis(subtotal: number): number {
  if (subtotal <= 0) return 0
  return Math.min(1, subtotal / UMBRAL_DESPACHO_GRATIS)
}

/**
 * "viña del mar", "Vina del Mar " y "VALPARAISO" son validas: se comparan sin
 * tildes ni mayusculas, igual que en la funcion de la base.
 */
export function comunaConDespacho(comuna: string): boolean {
  const normalizada = comuna
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
  return normalizada === 'vina del mar' || normalizada === 'valparaiso'
}
