// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Producto } from '@/modules/tienda/domain/producto.types'
import type { NuevoPedido, PedidoCreado } from '../domain/pedido.types'
import Checkout from './Checkout'

/**
 * Lo que pasa cuando el pedido ya se registro para Webpay y la pasarela no
 * abre: `metodo_pago` no se puede cambiar desde el navegador (0013 solo
 * concede UPDATE de `estado` al personal), asi que el medio queda fijo.
 */

const crear = vi.fn<(nuevo: NuevoPedido) => Promise<PedidoCreado | null>>()
const pagar = vi.fn<(destino: { tipo: string; codigo: string }) => Promise<boolean>>()
let errorDeWebpay: string | null = null

const PRODUCTO: Producto = {
  id: '1',
  slug: 'aceite',
  nombre: 'Aceite de cutícula',
  categoria: 'unas_manos',
  tamano: '15 ml',
  precio: 12000,
  precioAnterior: null,
  imagenUrl: null,
  insignia: null,
  servicioId: null,
  descripcion: '',
  modoUso: '',
  ingredientes: '',
  stock: null,
}

const PEDIDO: PedidoCreado = {
  id: '9',
  codigo: 'PD-0001',
  subtotal: 12000,
  costoEnvio: 0,
  descuento: 0,
  total: 12000,
}

vi.mock('@/shared/infrastructure/supabase/client', () => ({ supabase: {} }))
vi.mock('@/shared/components/ScrollToTop', () => ({ useScrollToTopOnChange: () => {} }))
vi.mock('@/shared/state/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/modules/auth/ui/useAuth', () => ({
  useAuth: () => ({ usuario: { id: 'u1', nombre: 'Ana', email: 'ana@correo.cl', telefono: null } }),
}))
vi.mock('@/modules/carrito/ui/useCarrito', () => ({
  useCarrito: () => ({
    lineas: [{ slug: 'aceite', cantidad: 1 }],
    items: [{ producto: PRODUCTO, cantidad: 1, total: 12000 }],
    vaciar: vi.fn(),
    prefiereEntregaEnCita: false,
  }),
}))
vi.mock('@/modules/reservas/ui/useIniciarReserva', () => ({ useIniciarReserva: () => () => {} }))
vi.mock('@/modules/tienda/ui/ProductoImagen', () => ({ ProductoImagen: () => null }))
vi.mock('./useProximasCitas', () => ({ useProximasCitas: () => ({ citas: [], cargando: false }) }))
vi.mock('./useCrearPedido', () => ({
  useCrearPedido: () => ({ crear, enviando: false, error: null }),
}))
vi.mock('@/modules/pagos/ui/usePagoWebpay', () => ({
  usePagoWebpay: () => ({ pagar, enviando: false, error: errorDeWebpay, yaPagado: false }),
}))

async function irAlPagoConRetiro(usuario: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>,
  )
  // Retiro: es la entrega que permite "pagar en el estudio".
  await usuario.click(screen.getByRole('radio', { name: /Retiro en Estudio Nura/ }))
  await usuario.click(screen.getByRole('button', { name: 'Continuar al pago' }))
}

describe('Checkout: Webpay que no abre', () => {
  beforeEach(() => {
    crear.mockReset().mockResolvedValue(PEDIDO)
    pagar.mockReset().mockResolvedValue(false)
    errorDeWebpay = 'La pasarela no respondió.'
  })

  it('antes de registrar el pedido se puede elegir pagar en el estudio', async () => {
    const usuario = userEvent.setup()
    await irAlPagoConRetiro(usuario)
    expect(screen.getByRole('radio', { name: /Pagar en el estudio/ })).toBeEnabled()
  })

  it('con el pedido registrado para Webpay, fija el medio y solo reintenta el cobro', async () => {
    const usuario = userEvent.setup()
    await irAlPagoConRetiro(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Pagar $12.000' }))
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ metodoPago: 'webpay' }))

    expect(await screen.findByText(/quedó registrado para pagar con Webpay/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Pagar en el estudio/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Transferencia bancaria/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '← Entrega' })).not.toBeInTheDocument()

    // El total sale del pedido registrado, no del carrito (que ya se vacio).
    await usuario.click(screen.getByRole('button', { name: 'Reintentar el pago de $12.000' }))
    expect(crear).toHaveBeenCalledTimes(1)
    expect(pagar).toHaveBeenCalledTimes(2)
    expect(pagar).toHaveBeenLastCalledWith({ tipo: 'pedido', codigo: 'PD-0001' })
  })
})
