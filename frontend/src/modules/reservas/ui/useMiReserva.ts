import { useCallback, useEffect, useState } from 'react'
import { cancelarReserva, obtenerMiReserva, reprogramarReserva } from '../application'
import type { Reserva } from '../domain/reserva.types'
import { reservaRepository } from '../infrastructure/supabase-reserva.repository'

/**
 * Union discriminada en vez de booleanos sueltos: hace imposible representar
 * estados contradictorios y obliga a la vista a resolver todos los casos.
 *
 * 'sin-sesion' es distinto de 'no-encontrada': la reserva puede existir
 * perfectamente, pero sin sesion la politica de RLS no la devuelve. Mezclarlos
 * llevaria a decirle "no existe" a quien solo tiene que iniciar sesion.
 */
export type EstadoMiReserva =
  | { estado: 'sin-sesion' }
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'no-encontrada' }
  | { estado: 'listo'; reserva: Reserva }

interface UseMiReserva {
  detalle: EstadoMiReserva
  /** `true` mientras se guarda una cancelacion o una reprogramacion. */
  guardando: boolean
  /** Mensaje del ultimo intento fallido de cancelar o reprogramar. */
  errorAccion: string | null
  /** Resuelve a `true` si quedo guardado. */
  cancelar: () => Promise<boolean>
  reprogramar: (fecha: string, horaInicio: string) => Promise<boolean>
}

function estadoInicial(id: string | undefined, usuarioId: string | null): EstadoMiReserva {
  if (!usuarioId) return { estado: 'sin-sesion' }
  return id ? { estado: 'cargando' } : { estado: 'no-encontrada' }
}

/** Clave estable: cambia cuando cambia la reserva pedida o la cuenta. */
function claveDe(id: string | undefined, usuarioId: string | null): string {
  return `${usuarioId ?? ''}|${id ?? ''}`
}

/**
 * Lee una reserva propia y permite cancelarla o reprogramarla.
 *
 * Recibe el id de usuario en vez de leer la sesion por su cuenta, igual que
 * `useMisReservas`: asi el modulo no depende de auth y la consulta se repite
 * solo cuando cambia la cuenta.
 */
export function useMiReserva(id: string | undefined, usuarioId: string | null): UseMiReserva {
  const [detalle, setDetalle] = useState<EstadoMiReserva>(() => estadoInicial(id, usuarioId))
  const [clavePrevia, setClavePrevia] = useState(() => claveDe(id, usuarioId))
  const [guardando, setGuardando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const clave = claveDe(id, usuarioId)

  // Al cambiar de reserva o de cuenta hay que volver al estado inicial. Se
  // ajusta durante el render (patron recomendado por React) en vez de en un
  // efecto, que provocaria un render extra con los datos de la anterior.
  if (clave !== clavePrevia) {
    setClavePrevia(clave)
    setDetalle(estadoInicial(id, usuarioId))
    setErrorAccion(null)
  }

  useEffect(() => {
    if (!id || !usuarioId) return

    // StrictMode monta dos veces en desarrollo; tambien evita que una
    // respuesta tardia de la reserva anterior pise a la actual.
    let cancelado = false

    obtenerMiReserva(reservaRepository, id)
      .then((reserva) => {
        if (cancelado) return
        setDetalle(reserva ? { estado: 'listo', reserva } : { estado: 'no-encontrada' })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setDetalle({
          estado: 'error',
          mensaje: e instanceof Error ? e.message : 'No se pudo cargar la reserva.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [id, usuarioId])

  /**
   * Las dos acciones comparten todo menos la llamada, y la fila que devuelve
   * la base reemplaza a la que habia: es la unica version que de verdad esta
   * guardada. Recargar la pantalla entera para conseguir lo mismo seria una
   * peticion de mas.
   */
  const ejecutar = useCallback(
    async (accion: (reserva: Reserva) => Promise<Reserva>): Promise<boolean> => {
      // `detalle` va en las dependencias para que el callback siempre vea la
      // reserva vigente. Leerla con un updater de setDetalle no serviria:
      // React ejecuta el updater en el render siguiente, no aqui y ahora.
      if (detalle.estado !== 'listo') return false
      const actual = detalle.reserva

      setGuardando(true)
      setErrorAccion(null)
      try {
        const actualizada = await accion(actual)
        setDetalle({ estado: 'listo', reserva: actualizada })
        return true
      } catch (e: unknown) {
        setErrorAccion(e instanceof Error ? e.message : 'No se pudo guardar el cambio.')
        return false
      } finally {
        setGuardando(false)
      }
    },
    [detalle],
  )

  const cancelar = useCallback(
    () => ejecutar((reserva) => cancelarReserva(reservaRepository, reserva)),
    [ejecutar],
  )

  const reprogramar = useCallback(
    (fecha: string, horaInicio: string) =>
      ejecutar((reserva) => reprogramarReserva(reservaRepository, reserva, fecha, horaInicio)),
    [ejecutar],
  )

  return { detalle, guardando, errorAccion, cancelar, reprogramar }
}
