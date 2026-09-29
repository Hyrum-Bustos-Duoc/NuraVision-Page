import type { AuthRepository } from '../domain/auth.repository'
import type { Credenciales, UsuarioAuth } from '../domain/auth.types'

/**
 * Inicia sesion con correo y contraseña.
 *
 * El correo se normaliza igual que en el registro (recortado y en minusculas):
 * Supabase los compara tal cual llegan, y sin esto " Ana@Correo.cl " no
 * encontraria la cuenta creada como "ana@correo.cl".
 *
 * La contraseña NO se toca: sus espacios son parte de ella.
 */
export async function iniciarSesion(
  repo: AuthRepository,
  credenciales: Credenciales,
): Promise<UsuarioAuth> {
  const email = credenciales.email.trim().toLowerCase()

  if (!email) throw new Error('Necesitamos tu correo.')
  if (!credenciales.password) throw new Error('Necesitamos tu contraseña.')

  return repo.iniciarSesion({ email, password: credenciales.password })
}
