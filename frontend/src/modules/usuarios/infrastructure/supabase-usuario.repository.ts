import { supabase } from '@/shared/infrastructure/supabase/client'
import { SesionExpiradaError, type UsuarioRepository } from '../domain/usuario.repository'
import type { DatosPerfil, DatosPerfilPropio, DatosPersonales, Usuario } from '../domain/usuario.types'
import { toArgumentosActualizarMiPerfil, toDatosPersonales, toPerfilPropio, toUsuario } from './usuario.mapper'

const TABLA = 'perfiles'

/** Mensaje de `actualizar_mi_perfil` cuando `auth.uid()` es null (design.md, paso 1). */
const MENSAJE_SIN_SESION = 'Tu sesión expiró. Vuelve a iniciar sesión.'

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

  async obtenerPropio(id: string): Promise<DatosPersonales> {
    // `.eq('id', id)` sobra para la clienta —«Lectura del perfil propio» (0010)
    // solo le devuelve su fila—, pero no para el personal, que las lee todas.
    const { data, error } = await supabase.from(TABLA).select('*').eq('id', id)

    if (error) throw new Error('No pudimos cargar tu perfil. Inténtalo de nuevo.')
    const fila = data?.[0]
    if (!fila) throw new Error('No encontramos tu perfil. Escríbenos para revisarlo.')
    return toPerfilPropio(fila)
  }

  async actualizarPropio(datos: DatosPerfilPropio): Promise<DatosPersonales> {
    const { data, error, status } = await supabase.rpc(
      'actualizar_mi_perfil',
      toArgumentosActualizarMiPerfil(datos),
    )

    // Sesion caducada sin refresco posible: supabase-js cierra la sesion y
    // llama con la anon key, a la que 0020 revoca `execute` (401). El P0001 es
    // el paso 1 de la funcion, `auth.uid()` null; su mensaje es el contrato.
    if (status === 401 || (error?.code === 'P0001' && error.message === MENSAJE_SIN_SESION)) {
      throw new SesionExpiradaError()
    }

    // P0001 es como la funcion rechaza (0020) y su mensaje ya esta escrito
    // para la clienta. Cualquier otra cosa —red, permisos, la migracion sin
    // aplicar— no le dice nada que pueda hacer, asi que va el generico.
    if (error) {
      throw new Error(
        error.code === 'P0001' ? error.message : 'No pudimos guardar tus datos. Inténtalo de nuevo.',
      )
    }

    // `returns table` llega como arreglo. Vacio no es un exito: nada confirma
    // que se haya guardado.
    const fila = data?.[0]
    if (!fila) throw new Error('La base no confirmó el cambio. Inténtalo de nuevo.')
    return toDatosPersonales(fila)
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
