import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/shared/infrastructure/supabase/client'
import type { PedidoRepository } from '../domain/pedido.repository'
import type { EstadoPedido, NuevoPedido, Pedido, PedidoCreado } from '../domain/pedido.types'
import { toArgumentosCrearPedido, toPedido } from './pedido.mapper'

/**
 * Traduce un error de la base a algo que se pueda mostrar.
 *
 * P0001 es el codigo que usa crear_pedido() para sus validaciones, y su mensaje
 * ya esta escrito para la clienta ("Por ahora despachamos solo en…"). El resto
 * son fallos de infraestructura: el mas probable es que falte la migracion.
 */
function mensajeDe(error: PostgrestError, accion: string): string {
  if (error.code === 'P0001') return error.message
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === 'PGRST205') {
    return `No se pudo ${accion}: falta aplicar la migración 0013_tienda.sql.`
  }
  if (error.code === '42501') {
    return `La base rechazó ${accion} por sus políticas de seguridad.`
  }
  return `No se pudo ${accion}: ${error.message}`
}

export class SupabasePedidoRepository implements PedidoRepository {
  async crear(nuevo: NuevoPedido): Promise<PedidoCreado> {
    const { data, error } = await supabase.rpc('crear_pedido', toArgumentosCrearPedido(nuevo))

    if (error) throw new Error(mensajeDe(error, 'crear el pedido'))

    const fila = data?.[0]
    if (!fila) throw new Error('La base no confirmó el pedido. Inténtalo de nuevo.')

    return {
      id: String(fila.pedido_id),
      codigo: fila.codigo,
      subtotal: fila.subtotal,
      costoEnvio: fila.costo_envio,
      descuento: fila.descuento,
      total: fila.total,
    }
  }

  async listar(): Promise<Pedido[]> {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, pedido_items(*)')
      .order('creado_en', { ascending: false })

    if (error) throw new Error(mensajeDe(error, 'cargar los pedidos'))
    return (data ?? []).map(toPedido)
  }

  async cambiarEstado(id: string, estado: EstadoPedido): Promise<void> {
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado, actualizado_en: new Date().toISOString() })
      .eq('id', Number(id))
      .select('id')

    if (error) throw new Error(mensajeDe(error, 'cambiar el estado'))
    // Un UPDATE que la politica rechaza no da error: devuelve cero filas.
    if (!data || data.length === 0) {
      throw new Error('No se pudo cambiar el estado: el pedido no existe o no tienes permiso.')
    }
  }
}

export const pedidoRepository = new SupabasePedidoRepository()
