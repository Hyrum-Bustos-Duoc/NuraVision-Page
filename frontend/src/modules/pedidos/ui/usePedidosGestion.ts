import { useCallback, useEffect, useState } from 'react'
import type { EstadoPedido, Pedido } from '../domain/pedido.types'
import { pedidoRepository } from '../infrastructure/supabase-pedido.repository'

/**
 * Pedidos del estudio para el panel. Solo consulta con `habilitado` (cuenta de
 * personal): sin esa marca la RLS devolveria una lista vacia que se leeria como
 * "no hay pedidos".
 */
export function usePedidosGestion(habilitado: boolean) {
  const [version, setVersion] = useState(0)
  const [resuelto, setResuelto] = useState<{ version: number; pedidos: Pedido[]; error: string | null } | null>(null)
  const [actualizando, setActualizando] = useState<string | null>(null)
  const [errorEstado, setErrorEstado] = useState<string | null>(null)

  useEffect(() => {
    if (!habilitado) return
    let cancelado = false
    pedidoRepository
      .listar()
      .then((pedidos) => {
        if (!cancelado) setResuelto({ version, pedidos, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelado) {
          setResuelto({ version, pedidos: [], error: e instanceof Error ? e.message : 'No se pudieron cargar los pedidos.' })
        }
      })
    return () => {
      cancelado = true
    }
  }, [habilitado, version])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  const cambiarEstado = useCallback(async (id: string, estado: EstadoPedido) => {
    setActualizando(id)
    setErrorEstado(null)
    try {
      await pedidoRepository.cambiarEstado(id, estado)
      // Se actualiza en el lugar: recargar todo por un cambio de estado haria
      // saltar la lista mientras se trabaja en ella.
      setResuelto((prev) =>
        prev ? { ...prev, pedidos: prev.pedidos.map((p) => (p.id === id ? { ...p, estado } : p)) } : prev,
      )
    } catch (e: unknown) {
      setErrorEstado(e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
    } finally {
      setActualizando(null)
    }
  }, [])

  const alDia = resuelto?.version === version
  return {
    pedidos: alDia ? resuelto.pedidos : [],
    cargando: habilitado && !alDia,
    error: alDia ? resuelto.error : null,
    recargar,
    cambiarEstado,
    actualizando,
    errorEstado,
  }
}
