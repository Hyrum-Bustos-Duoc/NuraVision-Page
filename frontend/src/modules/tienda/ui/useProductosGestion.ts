import { useCallback, useEffect, useState } from 'react'
import { listarTodosLosServicios, type Servicio } from '@/modules/servicios/application'
import { servicioRepository } from '@/modules/servicios/infrastructure/supabase-servicio.repository'
import {
  actualizarProducto,
  crearProducto,
  eliminarProducto,
  listarTodosLosProductos,
  type DatosProducto,
  type ProductoAdmin,
} from '../application'
import { productoRepository } from '../infrastructure/supabase-producto.repository'
import { useCatalogo } from './useCatalogo'

const porOrden = (a: ProductoAdmin, b: ProductoAdmin) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)

/**
 * Catalogo de productos para el panel: todos, activos e inactivos, mas los
 * servicios para el selector "Lo usamos en".
 *
 * Solo consulta con `habilitado` (cuenta de personal), igual que los pedidos.
 * Tras cada cambio refresca tambien el catalogo publico, para que la tienda
 * abierta en la misma pestaña muestre el precio nuevo sin recargar la pagina.
 *
 * Las mutaciones devuelven el motivo del fallo, o `null` si salio bien.
 */
export function useProductosGestion(habilitado: boolean) {
  const { recargar: recargarCatalogo } = useCatalogo()
  const [intento, setIntento] = useState(0)
  const [resuelto, setResuelto] = useState<{
    intento: number
    productos: ProductoAdmin[]
    servicios: Servicio[]
    error: string | null
  } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!habilitado) return
    let cancelado = false

    // Si los servicios fallan, el panel sigue sirviendo: solo pierde el selector.
    Promise.all([
      listarTodosLosProductos(productoRepository),
      listarTodosLosServicios(servicioRepository).catch(() => [] as Servicio[]),
    ])
      .then(([productos, servicios]) => {
        if (!cancelado) setResuelto({ intento, productos, servicios, error: null })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          intento,
          productos: [],
          servicios: [],
          error: e instanceof Error ? e.message : 'No se pudieron cargar los productos.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [habilitado, intento])

  const recargar = useCallback(() => setIntento((n) => n + 1), [])

  /** Envuelve una mutacion: marca el guardado, traduce el error y refresca la tienda. */
  const ejecutar = useCallback(
    async (accion: () => Promise<(lista: ProductoAdmin[]) => ProductoAdmin[]>, porDefecto: string) => {
      setGuardando(true)
      try {
        const aplicar = await accion()
        setResuelto((previo) => (previo ? { ...previo, productos: aplicar(previo.productos) } : previo))
        recargarCatalogo()
        return null
      } catch (e: unknown) {
        return e instanceof Error ? e.message : porDefecto
      } finally {
        setGuardando(false)
      }
    },
    [recargarCatalogo],
  )

  const crear = useCallback(
    (datos: DatosProducto) =>
      ejecutar(async () => {
        const creado = await crearProducto(productoRepository, datos)
        return (lista) => [...lista, creado].sort(porOrden)
      }, 'No se pudo crear el producto.'),
    [ejecutar],
  )

  const actualizar = useCallback(
    (id: string, datos: DatosProducto) =>
      ejecutar(async () => {
        const guardado = await actualizarProducto(productoRepository, id, datos)
        return (lista) => lista.map((p) => (p.id === id ? guardado : p)).sort(porOrden)
      }, 'No se pudo guardar el producto.'),
    [ejecutar],
  )

  const eliminar = useCallback(
    (id: string) =>
      ejecutar(async () => {
        await eliminarProducto(productoRepository, id)
        return (lista) => lista.filter((p) => p.id !== id)
      }, 'No se pudo eliminar el producto.'),
    [ejecutar],
  )

  const alDia = resuelto?.intento === intento
  return {
    productos: alDia ? resuelto.productos : [],
    servicios: alDia ? resuelto.servicios : [],
    cargando: habilitado && !alDia,
    error: alDia ? resuelto.error : null,
    guardando,
    crear,
    actualizar,
    eliminar,
    recargar,
  }
}
