import type { UsuarioRepository } from '../domain/usuario.repository'
import type { Usuario } from '../domain/usuario.types'

/** Perfiles registrados, los mas recientes primero. */
export async function listarUsuarios(repo: UsuarioRepository): Promise<Usuario[]> {
  return repo.listar()
}
