import { hoyISO } from '@/shared/lib/calendario'
import {
  SesionExpiradaError,
  type BorradorPerfilAlmacen,
  type UsuarioRepository,
} from '../domain/usuario.repository'
import type { DatosPersonales } from '../domain/usuario.types'
import { validarPerfilPropio, type BorradorPerfil, type ErroresPerfil } from '../domain/usuario.reglas'

/** El perfil de la propia sesion, para «Mi perfil». */
export async function obtenerMiPerfil(repo: UsuarioRepository, id: string): Promise<DatosPersonales> {
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
 *
 * Si la sesion expiro, el borrador se deja en `borradores` con la cuenta que lo
 * escribio antes de relanzar: la pantalla se desmonta camino al login y es la
 * unica forma de conservar lo escrito. Tras guardar, se olvida.
 */
export async function actualizarMiPerfil(
  deps: { repo: UsuarioRepository; borradores: BorradorPerfilAlmacen },
  usuarioId: string,
  borrador: BorradorPerfil,
  hoy: string = hoyISO(),
): Promise<ResultadoGuardarPerfil> {
  const validacion = validarPerfilPropio(borrador, hoy)
  if (!validacion.ok) return { estado: 'invalido', errores: validacion.errores }

  let datos: DatosPersonales
  try {
    datos = await deps.repo.actualizarPropio(validacion.datos)
  } catch (e: unknown) {
    // Lo escrito, no lo normalizado: es lo que la clienta vera al volver.
    if (e instanceof SesionExpiradaError) deps.borradores.recordar({ usuarioId, borrador })
    throw e
  }
  deps.borradores.olvidar()
  return { estado: 'guardado', datos }
}

/**
 * El borrador que dejo una sesion expirada, si lo escribio esta misma cuenta.
 * El de otra cuenta se descarta sin mostrarse: son datos personales ajenos.
 * No se guarda solo: lo decide la clienta al ver el aviso.
 */
export function recuperarBorradorPerfil(borradores: BorradorPerfilAlmacen, usuarioId: string): BorradorPerfil | null {
  const pendiente = borradores.leer()
  if (pendiente === null) return null
  if (pendiente.usuarioId !== usuarioId) {
    borradores.olvidar()
    return null
  }
  return pendiente.borrador
}
