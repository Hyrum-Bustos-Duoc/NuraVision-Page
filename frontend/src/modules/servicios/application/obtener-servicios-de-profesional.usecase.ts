import type { ServicioRepository } from '../domain/servicio.repository'
import type { Servicio } from '../domain/servicio.types'

/**
 * Servicios activos que realiza un profesional.
 *
 * Recibe el repositorio por inyeccion, como el resto de los casos de uso del
 * modulo: no sabe que detras hay Supabase.
 */
export async function obtenerServiciosDeProfesional(
  repositorio: ServicioRepository,
  profesionalId: string,
): Promise<Servicio[]> {
  return repositorio.listarPorProfesional(profesionalId)
}
