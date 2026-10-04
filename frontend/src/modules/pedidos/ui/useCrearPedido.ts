import { useCallback, useState } from 'react'
import { crearPedido } from '../application'
import type { NuevoPedido, PedidoCreado } from '../domain/pedido.types'
import { pedidoRepository } from '../infrastructure/supabase-pedido.repository'

/** Crea un pedido. Devuelve el pedido creado, o `null` si fallo (ver `error`). */
export function useCrearPedido() {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const crear = useCallback(async (nuevo: NuevoPedido): Promise<PedidoCreado | null> => {
    setEnviando(true)
    setError(null)
    try {
      return await crearPedido(pedidoRepository, nuevo)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el pedido.')
      return null
    } finally {
      setEnviando(false)
    }
  }, [])

  return { crear, enviando, error }
}
