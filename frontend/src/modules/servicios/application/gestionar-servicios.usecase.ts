import type { ServicioRepository } from '../domain/servicio.repository'
import type { DatosServicio, Servicio } from '../domain/servicio.types'
import { motivoParaNoGuardarServicio } from '../domain/servicio.reglas'

/** Catalogo completo, activos e inactivos, para el panel de administracion. */
export async function listarTodosLosServicios(repo: ServicioRepository): Promise<Servicio[]> {
  return repo.listarTodos()
}

/** Cuantos profesionales realiza cada servicio, por id. */
export async function contarProfesionalesPorServicio(
  repo: ServicioRepository,
): Promise<Record<string, number>> {
  return repo.contarProfesionalesPorServicio()
}

export async function crearServicio(
  repo: ServicioRepository,
  datos: DatosServicio,
): Promise<Servicio> {
  const motivo = motivoParaNoGuardarServicio(datos)
  if (motivo !== null) throw new Error(motivo)
  return repo.crear(datos)
}

export async function actualizarServicio(
  repo: ServicioRepository,
  id: string,
  datos: DatosServicio,
): Promise<Servicio> {
  const motivo = motivoParaNoGuardarServicio(datos)
  if (motivo !== null) throw new Error(motivo)
  return repo.actualizar(id, datos)
}

/**
 * Borra un servicio del catalogo.
 *
 * No valida nada: lo unico que podria impedirlo son las reservas que lo
 * referencian, y eso lo sabe la base, no esta capa. El repositorio traduce esa
 * clave foranea a un mensaje que propone desactivarlo en su lugar.
 */
export async function eliminarServicio(repo: ServicioRepository, id: string): Promise<void> {
  return repo.eliminar(id)
}
