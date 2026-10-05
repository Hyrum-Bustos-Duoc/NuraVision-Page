import type { EstadoPedido, NuevoPedido, Pedido, PedidoCreado } from './pedido.types'

export interface PedidoRepository {
  /** Crea el pedido con crear_pedido(). Lanza con un mensaje listo para mostrar. */
  crear(nuevo: NuevoPedido): Promise<PedidoCreado>
  /** Todos los pedidos, del mas reciente al mas antiguo. RLS: solo el personal. */
  listar(): Promise<Pedido[]>
  /** RLS: solo el personal. Devuelve el pedido actualizado. */
  cambiarEstado(id: string, estado: EstadoPedido): Promise<void>
}
