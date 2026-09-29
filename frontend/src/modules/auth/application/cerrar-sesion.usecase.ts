import type { AuthRepository } from '../domain/auth.repository'

/**
 * Cierra la sesion.
 *
 * No hay nada que validar; existe para que la interfaz dependa siempre de la
 * capa de aplicacion y no unas veces de ella y otras del repositorio.
 */
export async function cerrarSesion(repo: AuthRepository): Promise<void> {
  await repo.cerrarSesion()
}
