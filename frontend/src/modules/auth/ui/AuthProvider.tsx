import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  cambiarPassword as cambiarPasswordUseCase,
  cerrarSesion,
  iniciarSesion,
  registrar,
  solicitarRecuperacion as solicitarRecuperacionUseCase,
} from '../application'
import type { Credenciales, DatosRegistro, UsuarioAuth } from '../domain/auth.types'
import { authRepository } from '../infrastructure/supabase-auth.repository'
import { AuthContext, type AuthValue } from './auth.context'

/**
 * Estado de la sesion.
 *
 * Union discriminada en vez de un booleano suelto junto al usuario: asi no
 * existe el estado imposible de "cargando con usuario ya resuelto".
 */
type EstadoSesion = { fase: 'cargando' } | { fase: 'listo'; usuario: UsuarioAuth | null }

/**
 * Sesion de Supabase Auth, compartida por toda la aplicacion.
 *
 * Va en un contexto y no en un hook suelto por una razon concreta: cada
 * llamada a `onAuthStateChange` abre una suscripcion, y un hook usado en
 * varias pantallas abriria una por pantalla. Aqui hay exactamente una.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<EstadoSesion>({ fase: 'cargando' })

  useEffect(() => {
    let cancelado = false

    // Sesion guardada de una visita anterior.
    authRepository
      .usuarioActual()
      .then((usuario) => {
        if (!cancelado) setSesion({ fase: 'listo', usuario })
      })
      .catch(() => {
        // Si la sesion guardada no se puede restaurar, la persona es una
        // visitante mas. No es un error que deba ver nadie.
        if (!cancelado) setSesion({ fase: 'listo', usuario: null })
      })

    // Cambios posteriores: entrar, salir, token refrescado, o esta misma
    // cuenta cerrando sesion en otra pestaña.
    const desuscribir = authRepository.alCambiarSesion((usuario) => {
      if (!cancelado) setSesion({ fase: 'listo', usuario })
    })

    return () => {
      cancelado = true
      desuscribir()
    }
  }, [])

  // Las tres acciones no guardan el resultado en el estado: de eso ya se
  // encarga la suscripcion de arriba, que es la unica fuente de la sesion.
  // Hacerlo en los dos sitios abriria la puerta a que se contradigan.
  const signUp = useCallback((datos: DatosRegistro) => registrar(authRepository, datos), [])

  const signInWithPassword = useCallback(
    (credenciales: Credenciales) => iniciarSesion(authRepository, credenciales),
    [],
  )

  const signOut = useCallback(() => cerrarSesion(authRepository), [])

  const refrescarSesion = useCallback(() => authRepository.refrescarSesion(), [])

  /**
   * El destino del enlace se arma AQUI, con el origen real del navegador.
   *
   * Ni el caso de uso ni el repositorio saben en que host corre la aplicacion, y
   * escribir una URL fija fue exactamente lo que hizo que los correos de
   * confirmacion llevaran a localhost. Derivandolo, el mismo build sirve en el
   * dominio, en las vistas previas de Vercel y en desarrollo local.
   */
  const solicitarRecuperacion = useCallback(
    (email: string) =>
      solicitarRecuperacionUseCase(
        authRepository,
        email,
        `${window.location.origin}/restablecer-contrasena`,
      ),
    [],
  )

  const cambiarPasswordFn = useCallback(
    (nueva: string, confirmacion: string) =>
      cambiarPasswordUseCase(authRepository, nueva, confirmacion),
    [],
  )

  const alRecuperarPassword = useCallback(
    (escucha: () => void) => authRepository.alRecuperarPassword(escucha),
    [],
  )

  const value = useMemo<AuthValue>(
    () => ({
      usuario: sesion.fase === 'listo' ? sesion.usuario : null,
      cargando: sesion.fase === 'cargando',
      signUp,
      signInWithPassword,
      signOut,
      refrescarSesion,
      solicitarRecuperacion,
      cambiarPassword: cambiarPasswordFn,
      alRecuperarPassword,
    }),
    [
      sesion,
      signUp,
      signInWithPassword,
      signOut,
      refrescarSesion,
      solicitarRecuperacion,
      cambiarPasswordFn,
      alRecuperarPassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
