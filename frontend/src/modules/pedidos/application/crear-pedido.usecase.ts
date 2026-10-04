import { erroresDeEntrega, metodoPermitido } from '../domain/pedido.reglas'
import type { PedidoRepository } from '../domain/pedido.repository'
import type { NuevoPedido, PedidoCreado } from '../domain/pedido.types'

/**
 * Caso de uso: crear un pedido.
 *
 * Valida lo mismo que la base antes de enviarlo, para fallar con un mensaje
 * util sin un viaje de ida y vuelta. La base vuelve a validarlo todo.
 */
export async function crearPedido(repositorio: PedidoRepository, nuevo: NuevoPedido): Promise<PedidoCreado> {
  if (nuevo.items.length === 0) throw new Error('Tu carrito está vacío.')

  const errores = Object.values(erroresDeEntrega(nuevo))
  if (errores.length > 0) throw new Error(errores[0])

  if (!metodoPermitido(nuevo.metodoPago, nuevo.entrega)) {
    throw new Error('Pagar en el estudio solo está disponible con retiro o entrega en tu cita.')
  }

  return repositorio.crear(nuevo)
}
