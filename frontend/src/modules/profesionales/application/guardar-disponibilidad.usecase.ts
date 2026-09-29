import type { WeeklyAvailability } from '@/shared/types'
import type { Disponibilidad } from '../domain/disponibilidad.types'
import type { ProfesionalRepository } from '../domain/profesional.repository'
import { motivoParaNoGuardar } from '../domain/disponibilidad.reglas'

/**
 * Guarda el horario semanal de un profesional.
 *
 * La validacion vive aqui y no en la pantalla: es una regla del dominio, y
 * dejarla en el componente significaria que cualquier otra via de guardado
 * —otra pantalla, un script— podria saltarsela.
 */
export async function guardarDisponibilidad(
  repo: ProfesionalRepository,
  profesionalId: string,
  semana: WeeklyAvailability,
): Promise<Disponibilidad[]> {
  const motivo = motivoParaNoGuardar(semana)
  if (motivo !== null) throw new Error(motivo)

  return repo.guardarDisponibilidad(profesionalId, semana)
}
