/**
 * Reglas de correo y contraseña, en un solo sitio.
 *
 * Las comparten el registro y el restablecimiento. Tenerlas duplicadas seria
 * peor que un poco de indireccion: si el registro exigiera 8 caracteres y el
 * restablecimiento 6, alguien podria "recuperar" su cuenta dejandola con una
 * contraseña que el registro habria rechazado, y nadie lo notaria hasta que
 * importara.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Minimo de Supabase por defecto.
 *
 * Subirlo aqui NO lo hace cumplir en el servidor: Supabase seguiria aceptando
 * contraseñas mas cortas por otras vias. Esto evita el viaje de ida y vuelta
 * para enterarse de algo que ya se sabe, no es la defensa.
 */
export const LARGO_MINIMO_PASSWORD = 8

/** Motivo por el que un correo no sirve, o `null` si sirve. */
export function motivoParaNoUsarEmail(email: string): string | null {
  const limpio = email.trim()
  if (limpio === '') return 'Escribe tu correo electrónico.'
  if (!EMAIL_RE.test(limpio)) return 'El formato del correo no es válido.'
  return null
}

/**
 * Motivo por el que una contraseña nueva no sirve, o `null` si sirve.
 *
 * Recibe tambien la confirmacion porque el error mas comun al cambiarla no es
 * que sea corta, sino haberla escrito distinta las dos veces. Validarlas juntas
 * permite decir exactamente cual de las dos cosas pasa.
 *
 * El orden importa: primero se juzga la contraseña en si y despues si coinciden.
 * Al reves, quien escribe "123" dos veces veria "coinciden" y tendria que
 * reintentar para enterarse de que ademas es corta.
 */
export function motivoParaNoCambiarPassword(
  nueva: string,
  confirmacion: string,
): string | null {
  if (nueva === '') return 'Escribe tu nueva contraseña.'
  if (nueva.length < LARGO_MINIMO_PASSWORD) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`
  }
  // No se recorta con trim: los espacios son caracteres validos en una
  // contraseña, y quitarlos cambiaria la que la persona cree haber escrito.
  if (confirmacion === '') return 'Repite la contraseña para confirmarla.'
  if (nueva !== confirmacion) return 'Las dos contraseñas no coinciden.'
  return null
}
