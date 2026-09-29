import type { WeeklyAvailability } from '@/shared/types'
import type { ProfesionalRepository } from '../domain/profesional.repository'
import type { DatosProfesional, Profesional } from '../domain/profesional.types'
import { motivoParaNoGuardarProfesional } from '../domain/profesional.reglas'

/** Todo el equipo, activos e inactivos, para el panel de administracion. */
export async function listarTodoElEquipo(repo: ProfesionalRepository): Promise<Profesional[]> {
  return repo.listarTodos()
}

/** Ids de los servicios que realiza, para rellenar el formulario al editar. */
export async function obtenerServiciosAsignados(
  repo: ProfesionalRepository,
  profesionalId: string,
): Promise<string[]> {
  return repo.listarServiciosAsignados(profesionalId)
}

/**
 * Da de alta una ficha con sus servicios y su horario por defecto.
 *
 * NO crea la cuenta de acceso: eso exige la service_role key y va por la Edge
 * Function `admin-cuentas`, desde el modulo usuarios. Son dos decisiones
 * distintas —una persona puede estar en el equipo y no necesitar entrar al
 * sistema— y juntarlas obligaria a inventar una contrasenia en cada alta.
 */
export async function crearProfesional(
  repo: ProfesionalRepository,
  datos: DatosProfesional,
  horario: WeeklyAvailability,
): Promise<Profesional> {
  const motivo = motivoParaNoGuardarProfesional(datos)
  if (motivo !== null) throw new Error(motivo)
  return repo.crear(datos, horario)
}

export async function actualizarProfesional(
  repo: ProfesionalRepository,
  id: string,
  datos: DatosProfesional,
): Promise<Profesional> {
  const motivo = motivoParaNoGuardarProfesional(datos)
  if (motivo !== null) throw new Error(motivo)
  return repo.actualizar(id, datos)
}

export async function eliminarProfesional(
  repo: ProfesionalRepository,
  id: string,
): Promise<void> {
  return repo.eliminar(id)
}
