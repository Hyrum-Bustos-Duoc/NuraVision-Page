import { useEffect, useState } from 'react'
import { obtenerIndicadores } from '../application'
import type { Indicadores, RangoFechas } from '../domain/indicadores.types'
import { indicadoresRepository } from '../infrastructure/supabase-indicadores.repository'

interface EstadoIndicadores {
  /** `null` mientras carga, si fallo o si no se pidio nada. */
  indicadores: Indicadores | null
  cargando: boolean
  error: string | null
  /** Repite la consulta con el mismo rango. */
  recargar: () => void
}

/**
 * Indicadores del estudio para un rango.
 *
 * Con `rango = null` no consulta nada: la Analitica lo usa cuando el rango
 * elegido no es valido, para no lanzar una peticion que la base rechazaria.
 *
 * Mismo esquema que `useReservasGestion`: el rango llega como objeto nuevo en
 * cada render, asi que el efecto depende de una clave derivada de su
 * contenido, y "cargando" se deriva comparando esa clave y el intento con los
 * del ultimo resultado guardado.
 */
export function useIndicadores(rango: RangoFechas | null): EstadoIndicadores {
  const clave = rango ? `${rango.desde}|${rango.hasta}` : ''

  const [intento, setIntento] = useState(0)
  const [resuelto, setResuelto] = useState<{
    clave: string
    intento: number
    indicadores: Indicadores | null
    error: string | null
  }>({ clave: '', intento: -1, indicadores: null, error: null })

  useEffect(() => {
    if (clave === '') return

    let cancelado = false
    const [desde, hasta] = clave.split('|')

    obtenerIndicadores(indicadoresRepository, { desde, hasta })
      .then((indicadores) => {
        if (!cancelado) setResuelto({ clave, intento, indicadores, error: null })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          clave,
          intento,
          indicadores: null,
          error: e instanceof Error ? e.message : 'No se pudieron cargar los indicadores.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [clave, intento])

  const recargar = () => setIntento((n) => n + 1)

  // Sin rango no hay nada en camino: no es "cargando".
  if (clave === '') return { indicadores: null, cargando: false, error: null, recargar }

  const alDia = resuelto.clave === clave && resuelto.intento === intento

  return {
    // Un resultado de otro rango no se muestra: serian cifras de otro periodo
    // con el rotulo del nuevo.
    indicadores: alDia ? resuelto.indicadores : null,
    cargando: !alDia,
    error: alDia ? resuelto.error : null,
    recargar,
  }
}
