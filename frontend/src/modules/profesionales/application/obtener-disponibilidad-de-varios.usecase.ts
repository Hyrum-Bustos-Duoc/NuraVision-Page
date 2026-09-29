import type { ProfesionalRepository } from '../domain/profesional.repository'
import type { Disponibilidad } from '../domain/disponibilidad.types'

/**
 * Bloques de atencion de varios profesionales, en una sola consulta.
 *
 * Los devuelve en bruto, sin agrupar: quien llama decide como indexarlos, y
 * agrupar aqui obligaria a elegir una forma que quiza no le sirva.
 */
export async function obtenerDisponibilidadDeVarios(
  repositorio: ProfesionalRepository,
  profesionalIds: string[],
): Promise<Disponibilidad[]> {
  return repositorio.listarDisponibilidadDeVarios(profesionalIds)
}
