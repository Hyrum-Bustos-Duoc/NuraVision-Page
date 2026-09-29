import type { UsuarioRepository } from '../domain/usuario.repository'
import type { DatosPerfil, Usuario } from '../domain/usuario.types'
import { motivoParaNoGuardarPerfil } from '../domain/usuario.reglas'

export async function actualizarPerfil(
  repo: UsuarioRepository,
  id: string,
  datos: DatosPerfil,
): Promise<Usuario> {
  const motivo = motivoParaNoGuardarPerfil(datos)
  if (motivo !== null) throw new Error(motivo)

  return repo.actualizar(id, datos)
}
