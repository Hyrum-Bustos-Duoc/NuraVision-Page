import type { User } from '@supabase/supabase-js'
import type { UsuarioAuth } from '../domain/auth.types'

/**
 * Claves con las que se guardan el nombre y el telefono en `user_metadata`.
 *
 * Se exportan porque el registro las escribe y el mapper las lee: si solo una
 * de las dos partes las conociera, un cambio de nombre aqui pasaria inadvertido
 * y el dato se leeria siempre como null.
 */
export const META_NOMBRE = 'nombre'
export const META_TELEFONO = 'telefono'

/**
 * Clave que marca al personal del estudio dentro de `app_metadata`.
 *
 * Tiene que coincidir letra por letra con la que lee `public.es_staff()` en
 * 0006_admin_staff_policy.sql. Si una de las dos cambia y la otra no, la
 * interfaz y la base dejan de estar de acuerdo sin que nada avise.
 */
export const APP_META_ES_STAFF = 'es_staff'

/**
 * Clave que vincula la cuenta con su ficha de `profesionales`.
 *
 * Se guarda como texto o como numero segun quien la escriba (panel de
 * Supabase, API de administracion o SQL), asi que el mapper acepta ambos.
 */
export const APP_META_PROFESIONAL_ID = 'profesional_id'

/**
 * `user_metadata` es Json libre: lo escribe el cliente y nadie valida su forma.
 * Cualquier cosa que no sea un texto con contenido se trata como ausente, en
 * vez de dejar que un numero o un objeto llegue a la interfaz tipado como
 * string.
 */
function textoOpcional(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio === '' ? null : limpio
}

/**
 * `app_metadata` tambien es Json libre. Se acepta el booleano `true` y el
 * texto "true", porque segun como se escriba la marca (panel de Supabase,
 * API de administracion, SQL) puede llegar de las dos formas. Cualquier otra
 * cosa es "no es personal": ante la duda, se niega.
 */
function esMarcaVerdadera(valor: unknown): boolean {
  return valor === true || valor === 'true'
}

/**
 * El id de la ficha puede llegar como numero o como texto. Se normaliza a
 * texto, que es como viaja el id en todo el dominio y en las rutas.
 *
 * Solo se acepta un entero, y esa exigencia no es cosmetica: TIENE QUE
 * COINCIDIR CON LO QUE HACE `public.mi_profesional_id()` en 0007, que descarta
 * con `~ '^[0-9]+$'` cualquier marca que no sea un entero. Si aqui se aceptara
 * un `"abc"`, la interfaz llevaria a esa cuenta al panel de profesional
 * mientras la base no le concede ni una fila: un panel vacio sin explicacion.
 * Ante una marca mal escrita, las dos capas dicen lo mismo: sin vincular.
 */
const SOLO_DIGITOS = /^\d+$/

function idOpcional(valor: unknown): string | null {
  if (typeof valor === 'number') return Number.isInteger(valor) ? String(valor) : null
  if (typeof valor === 'string') {
    const limpio = valor.trim()
    return SOLO_DIGITOS.test(limpio) ? limpio : null
  }
  return null
}

/** Usuario de Supabase -> entidad de dominio. */
export function toUsuarioAuth(user: User): UsuarioAuth {
  const meta = user.user_metadata as Record<string, unknown> | null
  const metaApp = user.app_metadata as Record<string, unknown> | null

  return {
    id: user.id,
    // `email` es opcional en Supabase porque admite cuentas por telefono o
    // solo por proveedor externo. Aqui todas las cuentas se crean con correo,
    // asi que el unico caso de cadena vacia seria un usuario creado por otra
    // via; se prefiere eso a un `undefined` suelto en la interfaz.
    email: user.email ?? '',
    nombre: textoOpcional(meta?.[META_NOMBRE]),
    telefono: textoOpcional(meta?.[META_TELEFONO]),
    esStaff: esMarcaVerdadera(metaApp?.[APP_META_ES_STAFF]),
    profesionalId: idOpcional(metaApp?.[APP_META_PROFESIONAL_ID]),
  }
}
