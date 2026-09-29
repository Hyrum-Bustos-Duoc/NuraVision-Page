import { useCallback, useEffect, useState } from 'react'
import {
  actualizarPerfil,
  crearCuenta,
  eliminarUsuario,
  listarUsuarios,
  type DatosPerfil,
  type NuevaCuenta,
  type Usuario,
} from '../application'
import { usuarioRepository } from '../infrastructure/supabase-usuario.repository'
import { cuentasRepository } from '../infrastructure/supabase-cuentas.repository'

interface EstadoUsuarios {
  usuarios: Usuario[]
  cargando: boolean
  error: string | null
  /** `true` mientras una alta, edicion o borrado esta en vuelo. */
  guardando: boolean
  /** Crea la cuenta. Devuelve el motivo del fallo, o `null` si salio bien. */
  crear: (datos: NuevaCuenta) => Promise<string | null>
  actualizar: (id: string, datos: DatosPerfil) => Promise<string | null>
  eliminar: (id: string) => Promise<string | null>
  recargar: () => void
}

/**
 * Lista de personas con cuenta, para el panel de administracion.
 *
 * Se apoya en el mismo patron que `useReservasGestion`: el resultado se guarda
 * junto al intento que lo produjo, asi "cargando" se deriva durante el render en
 * vez de escribirse desde el efecto, y recargar funciona sin nada que cambie.
 *
 * Las tres mutaciones devuelven el motivo del fallo en lugar de lanzarlo. La
 * pantalla tiene que mostrarlo en un toast y decidir si cierra el modal, y para
 * eso un `try/catch` en cada sitio de llamada solo añade ruido.
 */
export function useUsuarios(
  /**
   * Si `false`, no se consulta. Los hooks no se pueden llamar
   * condicionalmente, y sin esto la vista lanzaria una peticion que RLS va a
   * responder vacia cuando la sesion no es del personal.
   */
  habilitado = true,
): EstadoUsuarios {
  const [intento, setIntento] = useState(0)
  const [resuelto, setResuelto] = useState<{
    intento: number
    usuarios: Usuario[]
    error: string | null
  }>({ intento: -1, usuarios: [], error: null })

  useEffect(() => {
    if (!habilitado) return

    let cancelado = false

    listarUsuarios(usuarioRepository)
      .then((usuarios) => {
        if (!cancelado) setResuelto({ intento, usuarios, error: null })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          intento,
          usuarios: [],
          error: e instanceof Error ? e.message : 'No se pudieron cargar los usuarios.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [intento, habilitado])

  const recargar = useCallback(() => setIntento((n) => n + 1), [])

  const [guardando, setGuardando] = useState(false)

  const crear = useCallback(
    async (datos: NuevaCuenta): Promise<string | null> => {
      setGuardando(true)
      try {
        await crearCuenta(cuentasRepository, datos)
        // Se recarga en vez de insertar la fila a mano: el perfil lo crea un
        // trigger en la base, asi que aqui no se conoce su forma final —el rol
        // deducido, la fecha— y adivinarla seria mostrar algo distinto de lo que
        // hay guardado.
        setIntento((n) => n + 1)
        return null
      } catch (e: unknown) {
        return e instanceof Error ? e.message : 'No se pudo crear la cuenta.'
      } finally {
        setGuardando(false)
      }
    },
    [],
  )

  const actualizar = useCallback(
    async (id: string, datos: DatosPerfil): Promise<string | null> => {
      setGuardando(true)
      try {
        const guardado = await actualizarPerfil(usuarioRepository, id, datos)
        // Aqui si se reemplaza solo la fila: la base devolvio la version
        // guardada, que es mejor fuente que el borrador del formulario.
        setResuelto((previo) => ({
          ...previo,
          usuarios: previo.usuarios.map((u) => (u.id === guardado.id ? guardado : u)),
        }))
        return null
      } catch (e: unknown) {
        return e instanceof Error ? e.message : 'No se pudo guardar el usuario.'
      } finally {
        setGuardando(false)
      }
    },
    [],
  )

  const eliminar = useCallback(async (id: string): Promise<string | null> => {
    setGuardando(true)
    try {
      await eliminarUsuario(cuentasRepository, usuarioRepository, id)
      setResuelto((previo) => ({
        ...previo,
        usuarios: previo.usuarios.filter((u) => u.id !== id),
      }))
      return null
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'No se pudo eliminar el usuario.'
    } finally {
      setGuardando(false)
    }
  }, [])

  if (!habilitado) {
    return {
      usuarios: [],
      cargando: false,
      error: null,
      guardando: false,
      crear,
      actualizar,
      eliminar,
      recargar,
    }
  }

  const alDia = resuelto.intento === intento

  return {
    usuarios: alDia ? resuelto.usuarios : [],
    cargando: !alDia,
    error: alDia ? resuelto.error : null,
    guardando,
    crear,
    actualizar,
    eliminar,
    recargar,
  }
}
