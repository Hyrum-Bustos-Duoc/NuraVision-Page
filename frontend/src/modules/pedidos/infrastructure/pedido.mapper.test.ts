import { toArgumentosCrearPedido } from './pedido.mapper'

describe('toArgumentosCrearPedido', () => {
  it('no manda direccion ni reserva si la entrega no las usa', () => {
    const args = toArgumentosCrearPedido({
      items: [{ slug: 'kit', cantidad: 2 }],
      nombre: ' Ana ',
      email: 'ana@correo.cl ',
      entrega: 'retiro',
      direccion: 'Calle 1',
      comuna: 'Viña del Mar',
      reservaId: '4',
      metodoPago: 'estudio',
    })
    expect(args).toMatchObject({
      p_items: [{ slug: 'kit', cantidad: 2 }],
      p_nombre: 'Ana',
      p_email: 'ana@correo.cl',
      p_direccion: null,
      p_comuna: null,
      p_reserva_id: null,
      p_telefono: null,
    })
  })

  it('convierte el id de la reserva a numero para la cita', () => {
    const args = toArgumentosCrearPedido({
      items: [{ slug: 'kit', cantidad: 1 }],
      nombre: 'Ana',
      email: 'ana@correo.cl',
      entrega: 'cita',
      reservaId: '42',
      metodoPago: 'estudio',
    })
    expect(args.p_reserva_id).toBe(42)
  })
})
