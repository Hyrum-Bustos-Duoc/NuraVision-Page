import type { AuthRepository } from '../domain/auth.repository'
import type { DatosRegistro, ResultadoRegistro } from '../domain/auth.types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Minimo de Supabase por defecto. Subirlo aqui no lo hace cumplir en la base. */
const LARGO_MINIMO_PASSWORD = 8

/**
 * Crea una cuenta.
 *
 * Valida antes de salir a la red: un correo mal escrito o una contraseña corta
 * no necesitan una peticion para saberse invalidos, y el error llega al
 * instante en vez de despues de un viaje de ida y vuelta.
 */
export async function registrar(
  repo: AuthRepository,
  datos: DatosRegistro,
): Promise<ResultadoRegistro> {
  const email = datos.email.trim().toLowerCase()
  const nombre = datos.nombre.trim()
  const telefono = datos.telefono.trim()

  if (!nombre) throw new Error('Necesitamos tu nombre.')
  if (!EMAIL_RE.test(email)) throw new Error('El formato del correo no es válido.')
  if (datos.password.length < LARGO_MINIMO_PASSWORD) {
    throw new Error(`La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
  }

  return repo.registrar({ email, password: datos.password, nombre, telefono })
}
