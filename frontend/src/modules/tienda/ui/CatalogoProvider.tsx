import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { obtenerProductos } from '../application'
import type { Producto } from '../domain/producto.types'
import { productoRepository } from '../infrastructure/supabase-producto.repository'
import { CatalogoContext, type CatalogoValue } from './catalogo.context'

/**
 * Catalogo de la tienda, cargado una sola vez para toda la app.
 *
 * Va en un contexto y no en un hook suelto porque lo leen a la vez la portada,
 * la tienda, el detalle, el carrito (que necesita los precios) y Nuva: con un
 * hook por pantalla serian cinco consultas iguales por visita.
 */
export function CatalogoProvider({ children }: { children: ReactNode }) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelado = false

    obtenerProductos(productoRepository)
      .then((resultado) => {
        if (cancelado) return
        setProductos(resultado)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar la tienda.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })

    return () => {
      cancelado = true
    }
  }, [version])

  // Sin poner `cargando` en true: tras editar en el panel, la tienda conserva lo
  // que mostraba hasta que llega la version nueva, en vez de parpadear.
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  const indice = useMemo(() => new Map(productos.map((p) => [p.slug, p])), [productos])
  const porSlug = useCallback((slug: string) => indice.get(slug), [indice])

  const value = useMemo<CatalogoValue>(
    () => ({ productos, cargando, error, porSlug, recargar }),
    [productos, cargando, error, porSlug, recargar],
  )

  return <CatalogoContext.Provider value={value}>{children}</CatalogoContext.Provider>
}
