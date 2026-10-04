import type { EntregaPedido, EstadoPedido, MetodoPagoPedido } from '@/shared/types/supabase'

export type { EntregaPedido, EstadoPedido, MetodoPagoPedido }

/**
 * Lo que el navegador manda para crear un pedido.
 *
 * NO lleva precios a proposito: crear_pedido() los lee de la base. Mandarlos
 * solo invitaria a creer que sirven de algo.
 */
export interface NuevoPedido {
  items: { slug: string; cantidad: number }[]
  nombre: string
  email: string
  telefono?: string
  entrega: EntregaPedido
  /** Solo con despacho. */
  direccion?: string
  comuna?: string
  /** Solo con entrega en cita: la reserva propia donde se entrega. */
  reservaId?: string
  metodoPago: MetodoPagoPedido
}

/** Lo que devuelve la base al crear el pedido: los montos que valen. */
export interface PedidoCreado {
  id: string
  codigo: string
  subtotal: number
  costoEnvio: number
  descuento: number
  total: number
}

export interface ItemPedido {
  nombre: string
  precioUnitario: number
  cantidad: number
  descuento: number
}

/** Pedido leido de la base (panel del estudio). */
export interface Pedido {
  id: string
  codigo: string
  creadoEn: string
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string | null
  entrega: EntregaPedido
  direccion: string | null
  comuna: string | null
  reservaId: string | null
  metodoPago: MetodoPagoPedido
  estado: EstadoPedido
  subtotal: number
  costoEnvio: number
  descuento: number
  total: number
  items: ItemPedido[]
}
