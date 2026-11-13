/**
 * Lo que Supabase deja en la URL cuando el enlace de recuperacion falla.
 *
 * ----------------------------------------------------------------------------
 * POR QUE HACE FALTA LEERLO
 * ----------------------------------------------------------------------------
 * Si el enlace caduco o ya se uso, Supabase NO abre sesion: devuelve a la
 * persona a la pagina con el motivo en el fragmento de la URL, algo como
 *
 *   #error=access_denied&error_code=otp_expired&error_description=Email+link+...
 *
 * Sin leerlo, la pantalla solo sabria que no hay sesion y tendria que decir algo
 * generico. Con esto puede distinguir "el enlace expiro" —que se resuelve
 * pidiendo otro— de "no hay sesion", y la diferencia es la que evita que alguien
 * reintente con el mismo enlace muerto una y otra vez.
 *
 * Es logica pura, de una cadena a un objeto, para poder probarla sin navegador.
 */

export interface ErrorDeEnlace {
  /** Codigo corto de Supabase: `otp_expired`, `access_denied`… */
  codigo: string
  /** Mensaje para la pantalla, ya en español. */
  mensaje: string
}

/**
 * Mensajes propios para los casos que de verdad ocurren.
 *
 * El `error_description` de Supabase llega en ingles y escrito para quien
 * integra, no para quien usa el sitio ("Email link is invalid or has expired").
 * Traducirlo aqui es lo que hace que la pantalla hable como el resto del sitio.
 */
const MENSAJES: Record<string, string> = {
  otp_expired:
    'El enlace caducó. Los enlaces de recuperación duran poco por seguridad; pide uno nuevo y úsalo enseguida.',
  access_denied:
    'Este enlace ya no sirve. Puede que lo hayas usado antes o que haya caducado; pide uno nuevo.',
}

const GENERICO = 'No pudimos validar el enlace. Pide uno nuevo e inténtalo otra vez.'

/**
 * Lee el error del fragmento de la URL, o `null` si no hay ninguno.
 *
 * Acepta el hash con o sin `#`. Se lee del HASH y no de la query porque es ahi
 * donde Supabase lo deja: el fragmento no viaja al servidor, que es
 * precisamente lo que se quiere para algo que acompaña a un token.
 */
export function leerErrorDeEnlace(hash: string): ErrorDeEnlace | null {
  const crudo = hash.startsWith('#') ? hash.slice(1) : hash
  if (crudo.trim() === '') return null

  const params = new URLSearchParams(crudo)
  const codigo = (params.get('error_code') ?? params.get('error') ?? '').trim()
  if (codigo === '') return null

  return { codigo, mensaje: MENSAJES[codigo] ?? GENERICO }
}
