import { useCallback, useEffect, useState } from 'react'
import { confirmarReserva, listarReservas } from '../application'
import type { FiltrosReservas, ReservaGestion } from '../domain/reserva-gestion.types'
import { reservaGestionRepository } from '../infrastructure/supabase-reserva-gestion.repository'

interface EstadoReservasGestion {
  reservas: ReservaGestion[]
  cargando: boolean
  error: string | null
  /** id de la reserva que se esta confirmando, o `null`. */
  confirmando: string | null
  /** Mensaje del ultimo intento fallido de confirmar. */
  errorConfirmar: string | null
  /** Resuelve a `true` si quedo confirmada. */
  confirmar: (reserva: ReservaGestion) => Promise<boolean>
  /** Vuelve a consultar con los filtros vigentes. */
  recargar: () => void
}

/** Clave estable derivada del contenido de los filtros. */
function claveDe(filtros: FiltrosReservas): string {
  return `${filtros.estado ?? ''}|${filtros.profesionalId ?? ''}`
}

/**
 * Listado de reservas del estudio.
 *
 * Los filtros llegan como objeto, que cambia de identidad en cada render, asi
 * que la dependencia del efecto es una clave derivada de su contenido; usar el
 * objeto repetiria la consulta indefinidamente.
 *
 * El resultado se guarda junto a la clave Y al intento que lo produjeron. Asi
 * "cargando" se deriva durante el render comparando ambos, sin escribir estado
 * desde el efecto, y "Actualizar" funciona aunque los filtros no cambien.
 */
export function useReservasGestion(
  filtros: FiltrosReservas,
  /**
   * Si `false`, no se consulta nada. Existe porque los hooks no se pueden
   * llamar condicionalmente: la vista tiene que invocar este igual cuando la
   * sesion no es de personal, y sin esto lanzaria una peticion que la base va
   * a rechazar y cuyo resultado nadie va a mirar.
   */
  habilitado = true,
): EstadoReservasGestion {
  const clave = claveDe(filtros)

  // Cambiarlo fuerza a repetir la consulta aunque los filtros sean los mismos.
  const [intento, setIntento] = useState(0)

  // `intento: -1` no coincide con ningun intento real, asi que el primer
  // render ya sale como "cargando" sin tener que escribirlo.
  const [resuelto, setResuelto] = useState<{
    clave: string
    intento: number
    reservas: ReservaGestion[]
    error: string | null
  }>({ clave: '', intento: -1, reservas: [], error: null })

  useEffect(() => {
    if (!habilitado) return

    let cancelado = false

    const [estado, profesionalId] = clave.split('|')

    listarReservas(reservaGestionRepository, {
      estado: (estado || undefined) as FiltrosReservas['estado'],
      profesionalId: profesionalId || undefined,
    })
      .then((reservas) => {
        if (cancelado) return
        setResuelto({ clave, intento, reservas, error: null })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          clave,
          intento,
          reservas: [],
          error: e instanceof Error ? e.message : 'No se pudieron cargar las reservas.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [clave, intento, habilitado])

  const recargar = useCallback(() => setIntento((n) => n + 1), [])

  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null)

  const confirmar = useCallback(async (reserva: ReservaGestion): Promise<boolean> => {
    setConfirmando(reserva.id)
    setErrorConfirmar(null)
    try {
      const actualizada = await confirmarReserva(reservaGestionRepository, reserva)
      // Se reemplaza solo la fila afectada con lo que devolvio la base, que es
      // la unica version realmente guardada. Recargar el listado entero por un
      // cambio de estado seria una consulta de mas, y ademas haria saltar la
      // fila de sitio si hay un filtro por estado activo.
      setResuelto((previo) => ({
        ...previo,
        reservas: previo.reservas.map((r) => (r.id === actualizada.id ? actualizada : r)),
      }))
      return true
    } catch (e: unknown) {
      setErrorConfirmar(e instanceof Error ? e.message : 'No se pudo confirmar la reserva.')
      return false
    } finally {
      setConfirmando(null)
    }
  }, [])

  const alDia = resuelto.clave === clave && resuelto.intento === intento

  // Deshabilitado no es "cargando": no hay nada en camino y la vista debe
  // poder pintar su propio mensaje en vez de un spinner eterno.
  if (!habilitado) {
    return {
      reservas: [],
      cargando: false,
      error: null,
      confirmando: null,
      errorConfirmar: null,
      confirmar,
      recargar,
    }
  }

  return {
    // Mientras el resultado corresponda a otros filtros no se muestra nada: es
    // preferible una tabla vacia un instante a enseñar filas que ya no
    // cumplen lo que el estudio acaba de pedir.
    reservas: alDia ? resuelto.reservas : [],
    cargando: !alDia,
    error: alDia ? resuelto.error : null,
    confirmando,
    errorConfirmar,
    confirmar,
    recargar,
  }
}
