import { hoyISO } from '@/shared/lib/calendario'
import type { UsuarioRepository } from '../domain/usuario.repository'
import type { DatosPersonales, Usuario } from '../domain/usuario.types'
import { validarPerfilPropio, type BorradorPerfil, type ErroresPerfil } from '../domain/usuario.reglas'

/** El perfil de la propia sesion, para «Mi perfil». */
export async function obtenerMiPerfil(repo: UsuarioRepository, id: string): Promise<Usuario> {
  return repo.obtenerPropio(id)
}

export type ResultadoGuardarPerfil =
  | { estado: 'invalido'; errores: ErroresPerfil }
  | { estado: 'guardado'; datos: DatosPersonales }

/**
 * Guarda «Mi perfil».
 *
 * La validacion vive aqui y no en la pantalla para que haya una sola via: un
 * borrador invalido devuelve los errores por campo y NO llega al repositorio.
 * Un rechazo de la base sigue siendo una excepcion, con su mensaje.
 */
export async function actualizarMiPerfil(
  repo: UsuarioRepository,
  borrador: BorradorPerfil,
  hoy: string = hoyISO(),
): Promise<ResultadoGuardarPerfil> {
  const validacion = validarPerfilPropio(borrador, hoy)
  if (!validacion.ok) return { estado: 'invalido', errores: validacion.errores }

  return { estado: 'guardado', datos: await repo.actualizarPropio(validacion.datos) }
}
