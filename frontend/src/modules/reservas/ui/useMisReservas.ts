import { useEffect, useState } from 'react'
import { listarMisReservas } from '../application'
import type { Reserva } from '../domain/reserva.types'
import { reservaRepository } from '../infrastructure/supabase-reserva.repository'

interface EstadoMisReservas {
  reservas: Reserva[]
  cargando: boolean
  error: string | null
}

/**
 * Reservas de la cuenta con sesion iniciada, leidas de la base.
 *
 * Recibe el id de usuario en vez de leer la sesion por su cuenta: asi el hook
 * no depende del modulo auth (mantiene los modulos desacoplados) y, sobre
 * todo, vuelve a consultar solo cuando cambia la cuenta. Con `null` no hace
 * ninguna peticion: sin sesion la politica de RLS no devolveria nada.
 */
export function useMisReservas(usuarioId: string | null): EstadoMisReservas {
  const clave = usuarioId ?? ''

  // El resultado se guarda junto a la clave que lo produjo, igual que en el
  // resto de los hooks del proyecto: asi "cargando" y "error" se derivan
  // durante el render comparando claves, sin escribir estado desde el efecto.
  const [resuelto, setResuelto] = useState<{
    clave: string
    reservas: Reserva[]
    error: string | null
  }>({ clave: '', reservas: [], error: null })

  useEffect(() => {
    if (clave === '') return

    let cancelado = false

    listarMisReservas(reservaRepository)
      .then((reservas) => {
        if (cancelado) return
        setResuelto({ clave, reservas, error: null })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          clave,
          reservas: [],
          error: e instanceof Error ? e.message : 'No se pudieron cargar tus reservas.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [clave])

  const alDia = resuelto.clave === clave

  return {
    // Mientras el resultado corresponda a otra cuenta no se muestra nada: es
    // preferible una lista vacia un instante a enseñarle a alguien las
    // reservas de quien uso la sesion anterior.
    reservas: alDia ? resuelto.reservas : [],
    cargando: clave !== '' && !alDia,
    error: alDia ? resuelto.error : null,
  }
}
