import { useEffect, useState } from 'react'
import {
  actualizarMiPerfil,
  obtenerMiPerfil,
  recuperarBorradorPerfil,
  type BorradorPerfil,
  type DatosPersonales,
  type ResultadoGuardarPerfil,
} from '../application'
import { borradorPerfilAlmacen } from '../infrastructure/borrador-perfil.storage'
import { usuarioRepository } from '../infrastructure/supabase-usuario.repository'

const deps = { repo: usuarioRepository, borradores: borradorPerfilAlmacen }

/**
 * No hay estado "vacio": sin fila de `perfiles` el repositorio lanza «No
 * encontramos tu perfil», que es un error con su salida (Reintentar).
 */
export type EstadoMiPerfil =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  /** `pendiente`: lo que esta cuenta escribio y no se guardo porque la sesion expiro. */
  | { fase: 'listo'; perfil: DatosPersonales; pendiente: BorradorPerfil | null }

/**
 * Perfil de la propia sesion y su guardado.
 *
 * Recibe el id en vez de leer la sesion, igual que `useMisReservas`: el modulo
 * no depende de auth. Quien cambie de cuenta debe remontar con `key`.
 *
 * Mismo patron que `useUsuarios`: el resultado se guarda con el intento que lo
 * produjo y "cargando" se deriva en el render, asi Reintentar vuelve a leer
 * sin que el efecto tenga que escribir un estado intermedio.
 */
export function useMiPerfil(usuarioId: string): {
  estado: EstadoMiPerfil
  recargar: () => void
  /** Rechazos de la base llegan como excepcion con el mensaje para mostrar. */
  guardar: (borrador: BorradorPerfil) => Promise<ResultadoGuardarPerfil>
  descartarPendiente: () => void
} {
  const [intento, setIntento] = useState(0)
  const [resuelto, setResuelto] = useState<{ intento: number; estado: EstadoMiPerfil }>({
    intento: -1,
    estado: { fase: 'cargando' },
  })

  // Sincroniza con PostgREST: la fila propia de `perfiles`.
  useEffect(() => {
    let cancelado = false

    obtenerMiPerfil(usuarioRepository, usuarioId)
      .then((perfil) => {
        if (cancelado) return
        const pendiente = recuperarBorradorPerfil(borradorPerfilAlmacen, usuarioId)
        setResuelto({ intento, estado: { fase: 'listo', perfil, pendiente } })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          intento,
          estado: {
            fase: 'error',
            mensaje: e instanceof Error ? e.message : 'No pudimos cargar tu perfil.',
          },
        })
      })

    return () => {
      cancelado = true
    }
  }, [intento, usuarioId])

  return {
    estado: resuelto.intento === intento ? resuelto.estado : { fase: 'cargando' },
    recargar: () => setIntento((n) => n + 1),
    guardar: (borrador) => actualizarMiPerfil(deps, usuarioId, borrador),
    descartarPendiente: () => borradorPerfilAlmacen.olvidar(),
  }
}
