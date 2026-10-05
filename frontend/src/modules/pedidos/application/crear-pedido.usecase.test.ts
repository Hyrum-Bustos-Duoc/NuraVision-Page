import type { PedidoRepository } from '../domain/pedido.repository'
import type { NuevoPedido } from '../domain/pedido.types'
import { crearPedido } from './crear-pedido.usecase'

function repositorioFalso(): PedidoRepository & { crear: ReturnType<typeof vi.fn> } {
  return {
    crear: vi.fn().mockResolvedValue({
      id: '1',
      codigo: 'NV-P-000001',
      subtotal: 9900,
      costoEnvio: 0,
      descuento: 0,
      total: 9900,
    }),
    listar: vi.fn(),
    cambiarEstado: vi.fn(),
  }
}

const valido: NuevoPedido = {
  items: [{ slug: 'aceite-de-cuticula-nura', cantidad: 1 }],
  nombre: 'Ana',
  email: 'ana@correo.cl',
  entrega: 'retiro',
  metodoPago: 'webpay',
}

describe('crearPedido', () => {
  it('delega en el repositorio un pedido valido', async () => {
    const repo = repositorioFalso()
    await expect(crearPedido(repo, valido)).resolves.toMatchObject({ codigo: 'NV-P-000001' })
    expect(repo.crear).toHaveBeenCalledWith(valido)
  })

  it('no envia un carrito vacio', async () => {
    const repo = repositorioFalso()
    await expect(crearPedido(repo, { ...valido, items: [] })).rejects.toThrow(/vacío/)
    expect(repo.crear).not.toHaveBeenCalled()
  })

  it('no envia pago en estudio con despacho', async () => {
    const repo = repositorioFalso()
    await expect(
      crearPedido(repo, {
        ...valido,
        entrega: 'despacho',
        direccion: 'Calle 1',
        comuna: 'Viña del Mar',
        metodoPago: 'estudio',
      }),
    ).rejects.toThrow(/estudio/)
    expect(repo.crear).not.toHaveBeenCalled()
  })
})
