import { formatPrice } from '@/shared/lib/format'
import { precioDesde } from '../domain/servicio.types'
import type { Servicio } from '../domain/servicio.types'

/**
 * El precio de un servicio, tal como se anuncia.
 *
 * Con variantes no hay un precio unico: se muestra el mas bajo precedido de
 * "desde". Sin ellas, el precio a secas.
 *
 * Existe para que el catalogo, la portada, la ficha del profesional y el primer
 * paso del asistente digan lo mismo. Antes cada uno formateaba `precioBase` por
 * su cuenta, y con variantes eso anunciaria un precio que no es el que se cobra.
 */
export function etiquetaDePrecio(servicio: Pick<Servicio, 'precioBase' | 'variantes'>): string {
  const precio = formatPrice(precioDesde(servicio))
  return servicio.variantes ? `desde ${precio}` : precio
}
