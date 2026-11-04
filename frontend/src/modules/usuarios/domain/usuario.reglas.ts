import { esFechaISO, FECHA_NACIMIENTO_MINIMA } from '@/shared/lib/calendario'
import type { DatosPerfil, DatosPerfilPropio, NuevaCuenta } from './usuario.types'

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

// ---------------------------------------------------------------------------
// «Mi perfil»: las mismas reglas y mensajes que `actualizar_mi_perfil` (0020).
// La base es la frontera; esto evita el viaje y pone el error junto al campo.
// ---------------------------------------------------------------------------

const LARGO_MAXIMO_NOMBRE = 120

export const MENSAJE_PERFIL = {
  nombreVacio: 'Necesitamos tu nombre.',
  nombreLargo: `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE} caracteres.`,
  telefono: 'El teléfono debe ser un número chileno de 9 dígitos.',
  fecha: 'La fecha de nacimiento no es válida.',
} as const

/** Lo que hay escrito en el formulario, sin normalizar. */
export interface BorradorPerfil {
  nombre: string
  telefono: string
  fechaNacimiento: string | null
}

export type CampoPerfil = keyof BorradorPerfil

export type ErroresPerfil = Partial<Record<CampoPerfil, string>>

export type ValidacionPerfil = { ok: true; datos: DatosPerfilPropio } | { ok: false; errores: ErroresPerfil }

/**
 * Largo como lo cuenta `char_length` de Postgres: puntos de codigo. `.length`
 * cuenta unidades UTF-16 y un emoji vale 2, asi que 120 emojis darian 240 y el
 * front rechazaria lo que la base acepta.
 */
export function largoEnCaracteres(texto: string): number {
  return Array.from(texto).length
}

/**
 * Telefono escrito con formato libre -> canonico `+56XXXXXXXXX`, `''` si el
 * campo esta vacio, o `null` si no es un numero chileno de 9 digitos (movil o
 * fijo: el primero entre 2 y 9). La base no normaliza: solo acepta esto.
 */
export function normalizarTelefono(texto: string): string | null {
  const limpio = texto.replace(/[\s\-.()]/g, '')
  if (limpio === '') return ''
  const sinMas = limpio.startsWith('+') ? limpio.slice(1) : limpio
  // El prefijo solo se quita si deja exactamente 9 digitos: "56912345678" es
  // un movil con prefijo, "+56 9 1234" no es nada y debe fallar.
  const local = /^56[0-9]{9}$/.test(sinMas) ? sinMas.slice(2) : limpio
  return /^[2-9][0-9]{8}$/.test(local) ? `+56${local}` : null
}

/** Valida y normaliza el formulario de «Mi perfil». `hoy` es la fecha local. */
export function validarPerfilPropio(borrador: BorradorPerfil, hoy: string): ValidacionPerfil {
  const errores: ErroresPerfil = {}

  const nombre = borrador.nombre.trim()
  if (nombre === '') errores.nombre = MENSAJE_PERFIL.nombreVacio
  else if (largoEnCaracteres(nombre) > LARGO_MAXIMO_NOMBRE) errores.nombre = MENSAJE_PERFIL.nombreLargo

  const telefono = normalizarTelefono(borrador.telefono)
  if (telefono === null) errores.telefono = MENSAJE_PERFIL.telefono

  const { fechaNacimiento } = borrador
  if (
    fechaNacimiento !== null &&
    (!esFechaISO(fechaNacimiento) || fechaNacimiento < FECHA_NACIMIENTO_MINIMA || fechaNacimiento > hoy)
  ) {
    errores.fechaNacimiento = MENSAJE_PERFIL.fecha
  }

  // `telefono === null` sobra en la practica (ya hay error), pero le dice a TS
  // que abajo es string.
  if (telefono === null || Object.keys(errores).length > 0) return { ok: false, errores }
  return { ok: true, datos: { nombre, telefono, fechaNacimiento } }
}
