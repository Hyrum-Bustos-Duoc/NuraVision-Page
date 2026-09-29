import { useEffect, useState } from 'react'
import { obtenerServiciosDeProfesional } from '../application'
import type { Servicio } from '../domain/servicio.types'
import { servicioRepository } from '../infrastructure/supabase-servicio.repository'

interface EstadoServiciosDeProfesional {
  servicios: Servicio[]
  cargando: boolean
  error: string | null
}

/**
 * Servicios que realiza un profesional.
 *
 * Con `undefined` no consulta nada y no esta cargando: es el estado normal
 * mientras la pantalla todavia no sabe de quien hablar.
 */
export function useServiciosDeProfesional(
  profesionalId: string | undefined,
): EstadoServiciosDeProfesional {
  const clave = profesionalId ?? ''

  // El resultado se guarda junto a la clave que lo produjo, para derivar
  // "cargando" durante el render en vez de escribirlo desde el efecto.
  const [resuelto, setResuelto] = useState<{
    clave: string
    servicios: Servicio[]
    error: string | null
  }>({ clave: '', servicios: [], error: null })

  useEffect(() => {
    if (clave === '') return

    let cancelado = false

    obtenerServiciosDeProfesional(servicioRepository, clave)
      .then((servicios) => {
        if (cancelado) return
        setResuelto({ clave, servicios, error: null })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          clave,
          servicios: [],
          error: e instanceof Error ? e.message : 'No se pudieron cargar los servicios.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [clave])

  const alDia = resuelto.clave === clave

  return {
    servicios: alDia ? resuelto.servicios : [],
    cargando: clave !== '' && !alDia,
    error: alDia ? resuelto.error : null,
  }
}
