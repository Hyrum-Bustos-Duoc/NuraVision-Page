import type { AuthRepository } from '../domain/auth.repository'
import {
  motivoParaNoCambiarPassword,
  motivoParaNoUsarEmail,
} from '../domain/password.reglas'

/**
 * Pide el correo con el enlace para restablecer la contraseña.
 *
 * `destino` es la URL a la que lleva el enlace. Lo aporta quien llama —derivado
 * de `window.location.origin`— y no se escribe aqui: el dominio no sabe en que
 * host corre la aplicacion, y una URL fija fue justamente lo que hizo que los
 * correos de confirmacion llevaran a localhost.
 *
 * ----------------------------------------------------------------------------
 * NO DICE SI EL CORREO EXISTE
 * ----------------------------------------------------------------------------
 * Termina igual haya cuenta o no. Responder distinto convertiria esta pantalla
 * en un detector de correos registrados: cualquiera podria ir probando
 * direcciones para averiguar quienes son clientas del estudio.
 *
 * El unico error que si se reporta es el formato, porque ese lo puede corregir
 * quien escribe y no revela nada de nadie.
 */
export async function solicitarRecuperacion(
  repo: AuthRepository,
  email: string,
  destino: string,
): Promise<void> {
  const motivo = motivoParaNoUsarEmail(email)
  if (motivo !== null) throw new Error(motivo)

  await repo.solicitarRecuperacion(email.trim().toLowerCase(), destino)
}

/**
 * Guarda la contraseña nueva.
 *
 * Valida antes de salir a la red: una contraseña corta o dos que no coinciden
 * no necesitan una peticion para saberse invalidas, y asi el error llega al
 * instante. Son las mismas reglas que usa el registro, importadas y no
 * repetidas, para que no puedan divergir.
 */
export async function cambiarPassword(
  repo: AuthRepository,
  nueva: string,
  confirmacion: string,
): Promise<void> {
  const motivo = motivoParaNoCambiarPassword(nueva, confirmacion)
  if (motivo !== null) throw new Error(motivo)

  await repo.cambiarPassword(nueva)
}
