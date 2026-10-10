import { esFechaISO, hoyISO } from '@/shared/lib/calendario'
import type { AuthRepository } from '../domain/auth.repository'
import type { DatosRegistro, ResultadoRegistro } from '../domain/auth.types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Minimo de Supabase por defecto. Subirlo aqui no lo hace cumplir en la base. */
const LARGO_MINIMO_PASSWORD = 8

/**
 * Cumpleaños mas antiguo que se acepta. No es una regla de la base (alli es un
 * metadato libre), solo un limite razonable para que el selector no ofrezca un
 * siglo de años vacios. El maximo es hoy: no se nace en el futuro.
 */
export const FECHA_NACIMIENTO_MINIMA = '1920-01-01'

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
  const { fechaNacimiento } = datos
  if (
    fechaNacimiento !== null &&
    (!esFechaISO(fechaNacimiento) ||
      fechaNacimiento < FECHA_NACIMIENTO_MINIMA ||
      fechaNacimiento > hoyISO())
  ) {
    throw new Error('La fecha de nacimiento no es válida.')
  }

  return repo.registrar({ email, password: datos.password, nombre, telefono, fechaNacimiento })
}
