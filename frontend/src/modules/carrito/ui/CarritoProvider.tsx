import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import {
  agregarLinea,
  cambiarCantidad as cambiarCantidadLinea,
  contarUnidades,
  parsearLineas,
  podarLineas,
  quitarLinea,
} from '../domain/carrito.reglas'
import type { LineaCarrito } from '../domain/carrito.types'
import { CarritoContext, type CarritoValue, type ItemCarrito } from './carrito.context'

const CLAVE = 'nv-carrito'

interface Guardado {
  lineas: LineaCarrito[]
  entregaEnCita: boolean
}

function leerGuardado(): Guardado {
  try {
    const crudo = window.localStorage.getItem(CLAVE)
    if (!crudo) return { lineas: [], entregaEnCita: false }
    const valor = JSON.parse(crudo) as Partial<Guardado> | null
    return {
      lineas: parsearLineas(valor?.lineas),
      entregaEnCita: valor?.entregaEnCita === true,
    }
  } catch {
    // Sin almacenamiento (modo privado) o JSON roto: se empieza con el carrito
    // vacio, que es mejor que no poder comprar.
    return { lineas: [], entregaEnCita: false }
  }
}

/**
 * Carrito de compras, persistido en el navegador.
 *
 * Los productos que dejaron de estar activos se descartan al resolver contra el
 * catalogo, pero solo cuando el catalogo cargo bien: si la consulta falla, el
 * carrito se conserva. Vaciarlo por un corte de red seria perder la compra.
 */
export function CarritoProvider({ children }: { children: ReactNode }) {
  const catalogo = useCatalogo()
  const [inicial] = useState(leerGuardado)
  const [lineasGuardadas, setLineas] = useState<LineaCarrito[]>(inicial.lineas)
  const [entregaEnCita, setEntregaEnCita] = useState(inicial.entregaEnCita)
  const [abierto, setAbierto] = useState(false)

  const catalogoListo = !catalogo.cargando && catalogo.error === null
  const { porSlug } = catalogo

  // Se poda en el render, no en un efecto: asi no hay un pintado intermedio con
  // productos que ya no existen.
  const lineas = useMemo(
    () => (catalogoListo ? podarLineas(lineasGuardadas, (slug) => porSlug(slug) !== undefined) : lineasGuardadas),
    [catalogoListo, lineasGuardadas, porSlug],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify({ lineas, entregaEnCita } satisfies Guardado))
    } catch {
      // Sin almacenamiento el carrito dura lo que dure la pestaña.
    }
  }, [lineas, entregaEnCita])

  const items = useMemo<ItemCarrito[]>(
    () =>
      lineas.flatMap((linea) => {
        const producto = porSlug(linea.slug)
        return producto ? [{ producto, cantidad: linea.cantidad, total: producto.precio * linea.cantidad }] : []
      }),
    [lineas, porSlug],
  )

  const agregar = useCallback<CarritoValue['agregar']>((slug, cantidad = 1, opciones) => {
    setLineas((prev) => agregarLinea(prev, slug, cantidad))
    if (opciones?.abrir !== false) setAbierto(true)
  }, [])

  const cambiarCantidad = useCallback((slug: string, cantidad: number) => {
    setLineas((prev) => cambiarCantidadLinea(prev, slug, cantidad))
  }, [])

  const quitar = useCallback((slug: string) => {
    setLineas((prev) => quitarLinea(prev, slug))
  }, [])

  const vaciar = useCallback(() => {
    setLineas([])
    setEntregaEnCita(false)
  }, [])

  const abrir = useCallback(() => setAbierto(true), [])
  const cerrar = useCallback(() => setAbierto(false), [])

  const value = useMemo<CarritoValue>(
    () => ({
      lineas,
      items,
      unidades: contarUnidades(lineas),
      subtotal: items.reduce((total, item) => total + item.total, 0),
      agregar,
      cambiarCantidad,
      quitar,
      vaciar,
      abierto,
      abrir,
      cerrar,
      prefiereEntregaEnCita: entregaEnCita,
      preferirEntregaEnCita: setEntregaEnCita,
    }),
    [lineas, items, agregar, cambiarCantidad, quitar, vaciar, abierto, abrir, cerrar, entregaEnCita],
  )

  return <CarritoContext.Provider value={value}>{children}</CarritoContext.Provider>
}
