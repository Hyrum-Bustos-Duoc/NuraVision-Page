import type { DatosProfesional } from './profesional.types'

/** Tope que tambien impone la base en 0010 (`profesionales_experiencia_razonable`). */
export const MAX_EXPERIENCIA = 70

/**
 * Se valida en el dominio y no en el formulario, para que la regla valga por
 * cualquier via de escritura. El tope de experiencia lo comprueba ademas la base:
 * si solo lo hiciera Postgres, el mensaje que llegaria a pantalla nombraria la
 * restriccion en vez de decir que corregir.
 */
export function motivoParaNoGuardarProfesional(datos: DatosProfesional): string | null {
  if (datos.nombre.trim() === '') return 'El nombre es obligatorio.'
  if (datos.especialidad.trim() === '') return 'La especialización es obligatoria.'

  if (!Number.isInteger(datos.experienciaAnios) || datos.experienciaAnios < 0) {
    return 'Los años de experiencia deben ser un número entero positivo.'
  }
  if (datos.experienciaAnios > MAX_EXPERIENCIA) {
    return `Los años de experiencia no pueden pasar de ${MAX_EXPERIENCIA}.`
  }
  return null
}
