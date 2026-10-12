import type { DestinoPago } from '../domain/pago.types'
import { toComprobante } from './comprobante.mapper'

describe('toComprobante', () => {
  // Un abandono (TBK_TOKEN) no trae comprobante: solo estado, aprobado y motivo.
  it('completa un abandono parcial sin inventar cifras', () => {
    const c = toComprobante({
      estado: 'anulado',
      aprobado: false,
      motivo: 'Cancelaste el pago en Webpay.',
    })
    expect(c).toMatchObject({
      estado: 'anulado',
      aprobado: false,
      motivo: 'Cancelaste el pago en Webpay.',
      codigo: null,
      ordenCompra: '',
      monto: null,
      montoTotal: null,
      saldo: null,
      codigoAutorizacion: null,
      tarjetaFinal: null,
      cuotas: null,
    })
  })

  it('cobro del total: montoTotal y saldo quedan en null', () => {
    const c = toComprobante({
      estado: 'autorizado',
      aprobado: true,
      ordenCompra: 'RS1-a',
      codigo: 'NV-2010-1234',
      monto: 20000,
      montoTotal: null,
      saldo: null,
      tipo: 'reserva',
    })
    expect(c.monto).toBe(20000)
    expect(c.montoTotal).toBeNull()
    expect(c.saldo).toBeNull()
    expect(c.tipo).toBe('reserva')
  })

  it('procesando conserva la marca y nunca se lee como aprobado', () => {
    const c = toComprobante({ procesando: true, repetida: true, aprobado: false })
    expect(c.procesando).toBe(true)
    expect(c.aprobado).toBe(false)
  })

  it('sin estado se lee como error, no como cobro', () => {
    expect(toComprobante({}).estado).toBe('error')
  })
})

describe('toComprobante: tipo', () => {
  const pendiente: DestinoPago = { tipo: 'reserva', codigo: 'NV-2010-1234' }

  it('usa el tipo del servidor cuando lo trae', () => {
    expect(toComprobante({ tipo: 'pedido' }, pendiente).tipo).toBe('pedido')
  })

  it('si el servidor no lo trae, usa el pago recordado al salir a Webpay', () => {
    expect(toComprobante({ estado: 'anulado' }, pendiente).tipo).toBe('reserva')
  })

  it('sin ninguno de los dos, cae en pedido', () => {
    expect(toComprobante({ estado: 'anulado' }).tipo).toBe('pedido')
  })
})
