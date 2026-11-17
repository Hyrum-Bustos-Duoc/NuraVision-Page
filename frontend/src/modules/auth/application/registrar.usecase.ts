import { esFechaISO, FECHA_NACIMIENTO_MINIMA, hoyISO } from '@/shared/lib/calendario'
import type { AuthRepository } from '../domain/auth.repository'
import type { DatosRegistro, ResultadoRegistro } from '../domain/auth.types'
// Las mismas reglas que aplica el restablecimiento de contraseña. Importadas y
// no repetidas: si el registro exigiera mas que la recuperacion, se podria
// dejar la cuenta con una contraseña que el registro habria rechazado.
import { EMAIL_RE, LARGO_MINIMO_PASSWORD } from '../domain/password.reglas'

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
