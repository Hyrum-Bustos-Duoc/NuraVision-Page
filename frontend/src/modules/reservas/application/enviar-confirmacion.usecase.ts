import type { ConfirmacionRepository } from '../domain/confirmacion.repository'

/**
 * Pide el correo de confirmacion de una reserva.
 *
 * Existe aunque no valide nada para que la interfaz siga dependiendo de la capa
 * de aplicacion y no unas veces de ella y otras del repositorio.
 */
export async function enviarConfirmacion(
  repo: ConfirmacionRepository,
  codigo: string,
): Promise<boolean> {
  return repo.pedirEnvio(codigo)
}
