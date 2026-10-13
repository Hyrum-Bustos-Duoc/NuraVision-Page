import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CONTENIDO_POR_DEFECTO, contenidoDesdeGuardado, crearFiltroImagenes } from '../application'
import type { ContenidoSitio, DestinoFoto } from '../domain/contenido.types'
import { contenidoRepository, SIN_MIGRACION } from '../infrastructure/supabase-contenido.repository'
import { ContenidoContext, type ContenidoValue } from './contenido.context'

/**
 * Ultima version leida, guardada en el navegador. Solo evita el parpadeo de los
 * textos originales mientras llega la consulta: la base sigue mandando.
 */
const CLAVE_CACHE = 'nv-contenido'

const imagenPermitida = crearFiltroImagenes(String(import.meta.env.VITE_SUPABASE_URL ?? ''))

const desdeGuardado = (datos: unknown) => contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, datos, imagenPermitida)

function leerCache(): ContenidoSitio {
  try {
    const crudo = window.localStorage.getItem(CLAVE_CACHE)
    return crudo ? desdeGuardado(JSON.parse(crudo)) : CONTENIDO_POR_DEFECTO
  } catch {
    return CONTENIDO_POR_DEFECTO
  }
}

function escribirCache(datos: unknown) {
  try {
    window.localStorage.setItem(CLAVE_CACHE, JSON.stringify(datos))
  } catch {
    // Sin almacenamiento (modo privado): solo se pierde el atajo.
  }
}

/** Contenido editable del sitio, cargado una vez para toda la app. */
export function ContenidoProvider({ children }: { children: ReactNode }) {
  const [contenido, setContenido] = useState<ContenidoSitio>(leerCache)
  const [cargando, setCargando] = useState(true)
  const [editable, setEditable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualizadoEn, setActualizadoEn] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    contenidoRepository
      .obtener()
      .then((guardado) => {
        if (cancelado) return
        if (guardado === null) {
          // Sin la tabla, el sitio se ve como antes de 0014.
          setEditable(false)
          setContenido(CONTENIDO_POR_DEFECTO)
          return
        }
        setContenido(desdeGuardado(guardado.datos))
        setActualizadoEn(guardado.actualizadoEn)
        escribirCache(guardado.datos)
      })
      .catch((e: unknown) => {
        // Un fallo de lectura no rompe el sitio: se queda con lo que tenia.
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo leer el contenido.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const guardar = useCallback(
    async (nuevo: ContenidoSitio) => {
      if (!editable) throw new Error(SIN_MIGRACION)
      const guardado = await contenidoRepository.guardar(nuevo)
      setContenido(desdeGuardado(guardado.datos))
      setActualizadoEn(guardado.actualizadoEn)
      setError(null)
      escribirCache(guardado.datos)
    },
    [editable],
  )

  const subirImagen = useCallback(
    (destino: DestinoFoto, archivo: File) => contenidoRepository.subirImagen(destino, archivo),
    [],
  )

  const value = useMemo<ContenidoValue>(
    () => ({ contenido, cargando, editable, error, actualizadoEn, guardar, subirImagen }),
    [contenido, cargando, editable, error, actualizadoEn, guardar, subirImagen],
  )

  return <ContenidoContext.Provider value={value}>{children}</ContenidoContext.Provider>
}
