import type { NuevaCuenta, DatosPerfil } from './usuario.types'

/**
 * Por que se valida aqui y no solo en la Edge Function.
 *
 * La funcion valida igual, y ahi es donde de verdad importa: es la frontera de
 * confianza. Esto es otra cosa —evitar el viaje— y sobre todo devolver el
 * motivo en el idioma y los terminos de la pantalla. Las dos capas comprueban lo
 * mismo a proposito.
 */
export function motivoParaNoCrearCuenta(datos: NuevaCuenta): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())) {
    return 'El correo no tiene un formato válido.'
  }
  // El minimo de Supabase son 6 caracteres. Se dice el numero en vez de "es
  // demasiado corta", que obliga a adivinar.
  if (datos.password.length < 6) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (datos.nombre.trim() === '') {
    return 'El nombre es obligatorio.'
  }
  /**
   * Una cuenta de profesional sin ficha entra a su panel y no encuentra nada: la
   * politica de 0007 cruza `profesional_id` con las reservas y sin marca no
   * devuelve ni una fila. Crearla asi es crear un problema para despues.
   */
  if (datos.rol === 'profesional' && !datos.profesionalId) {
    return 'Elige a qué ficha del equipo se vincula esta cuenta.'
  }
  return null
}

export function motivoParaNoGuardarPerfil(datos: DatosPerfil): string | null {
  // No es una preferencia: `perfiles.nombre` es NOT NULL, asi que un nombre
  // vacio lo rechazaria la base con un 23502 cuyo mensaje no explica nada.
  if (datos.nombre.trim() === '') return 'El nombre no puede quedar vacío.'
  return null
}
