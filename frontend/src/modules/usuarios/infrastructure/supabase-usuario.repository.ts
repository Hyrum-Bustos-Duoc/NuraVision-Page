import { supabase } from '@/shared/infrastructure/supabase/client'
import type { UsuarioRepository } from '../domain/usuario.repository'
import type { DatosPerfil, Usuario } from '../domain/usuario.types'
import { toUsuario } from './usuario.mapper'

const TABLA = 'perfiles'

class SupabasePerfilRepository implements UsuarioRepository {
  async listar(): Promise<Usuario[]> {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .order('creado_en', { ascending: false })

    if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`)

    // Una lista vacia aqui NO es un error: puede ser que no haya nadie, o que
    // la sesion no sea del personal y RLS no devuelva nada. Quien distingue los
    // dos casos es la pantalla, que sabe si hay sesion de staff.
    return (data ?? []).map(toUsuario)
  }

  async actualizar(id: string, datos: DatosPerfil): Promise<Usuario> {
    const { data, error } = await supabase
      .from(TABLA)
      .update({
        nombre: datos.nombre,
        telefono: datos.telefono,
        rol: datos.rol,
      })
      .eq('id', id)
      .select()

    if (error) throw new Error(`No se pudo guardar el usuario: ${error.message}`)

    /**
     * UNA ESCRITURA QUE RLS RECHAZA NO ES UN ERROR: PostgREST devuelve 200 con
     * la lista vacia. Sin esta comprobacion el panel diria "guardado" sin haber
     * guardado nada.
     */
    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el cambio. Se requieren permisos de personal del estudio.',
      )
    }

    return toUsuario(data[0])
  }

  async eliminarPerfil(id: string): Promise<void> {
    const { data, error } = await supabase.from(TABLA).delete().eq('id', id).select('id')

    if (error) throw new Error(`No se pudo eliminar el perfil: ${error.message}`)
    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el borrado. Se requieren permisos de personal del estudio.',
      )
    }
  }
}

export const usuarioRepository: UsuarioRepository = new SupabasePerfilRepository()
