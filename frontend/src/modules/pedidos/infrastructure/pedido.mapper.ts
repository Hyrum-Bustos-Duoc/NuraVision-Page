import type { Tables } from '@/shared/types/supabase'
import type { NuevoPedido, Pedido } from '../domain/pedido.types'

type PedidoConItems = Tables<'pedidos'> & { pedido_items: Tables<'pedido_items'>[] | null }

/** Argumentos de crear_pedido(). Los opcionales viajan como null, no se omiten. */
export function toArgumentosCrearPedido(nuevo: NuevoPedido) {
  return {
    p_items: nuevo.items.map((i) => ({ slug: i.slug, cantidad: i.cantidad })),
    p_nombre: nuevo.nombre.trim(),
    p_email: nuevo.email.trim(),
    p_entrega: nuevo.entrega,
    p_metodo_pago: nuevo.metodoPago,
    p_direccion: nuevo.entrega === 'despacho' ? (nuevo.direccion?.trim() ?? null) : null,
    p_comuna: nuevo.entrega === 'despacho' ? (nuevo.comuna?.trim() ?? null) : null,
    p_reserva_id: nuevo.entrega === 'cita' && nuevo.reservaId ? Number(nuevo.reservaId) : null,
    p_telefono: nuevo.telefono?.trim() || null,
  }
}

export function toPedido(row: PedidoConItems): Pedido {
  return {
    id: String(row.id),
    codigo: row.codigo,
    creadoEn: row.creado_en,
    clienteNombre: row.cliente_nombre,
    clienteEmail: row.cliente_email,
    clienteTelefono: row.cliente_telefono,
    entrega: row.entrega,
    direccion: row.direccion,
    comuna: row.comuna,
    reservaId: row.reserva_id === null ? null : String(row.reserva_id),
    metodoPago: row.metodo_pago,
    estado: row.estado,
    subtotal: row.subtotal,
    costoEnvio: row.costo_envio,
    descuento: row.descuento,
    total: row.total,
    items: (row.pedido_items ?? []).map((i) => ({
      nombre: i.nombre,
      precioUnitario: i.precio_unitario,
      cantidad: i.cantidad,
      descuento: i.descuento,
    })),
  }
}
