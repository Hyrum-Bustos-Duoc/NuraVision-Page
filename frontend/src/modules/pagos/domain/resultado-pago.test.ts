import type { Comprobante } from './pago.types'
import { admiteReintento, resultadoDePago } from './resultado-pago'

const base: Comprobante = {
  estado: 'autorizado',
  aprobado: true,
  ordenCompra: 'RS1-a',
  codigo: 'NV-2010-1234',
  monto: 5000,
  montoTotal: 18000,
  saldo: 13000,
  codigoAutorizacion: '1213',
  tipoPago: 'VD',
  cuotas: 0,
  tarjetaFinal: '6623',
  tipo: 'reserva',
}

describe('resultadoDePago', () => {
  it('aprobado sin motivo: confirmado', () => {
    expect(resultadoDePago(base)).toBe('aprobado')
  })

  // Se cobro, pero la reserva ya no estaba pendiente: no es una confirmacion.
  it('aprobado con motivo: en revision', () => {
    expect(resultadoDePago({ ...base, motivo: 'La reserva ya estaba cancelada.' })).toBe('revision')
  })

  it('rechazado y anulado se distinguen', () => {
    expect(resultadoDePago({ ...base, aprobado: false, estado: 'rechazado' })).toBe('rechazado')
    expect(resultadoDePago({ ...base, aprobado: false, estado: 'anulado' })).toBe('anulado')
  })

  // 'error' llega cuando el servidor no sabe si se cobro: nunca "no se cobro".
  it('error, iniciado o autorizado sin aprobar: incierto', () => {
    expect(resultadoDePago({ ...base, aprobado: false, estado: 'error' })).toBe('incierto')
    expect(resultadoDePago({ ...base, aprobado: false, estado: 'iniciado' })).toBe('incierto')
    expect(resultadoDePago({ ...base, aprobado: false, estado: 'autorizado' })).toBe('incierto')
  })
})

describe('admiteReintento', () => {
  it('solo rechazado y anulado', () => {
    expect(admiteReintento('rechazado')).toBe(true)
    expect(admiteReintento('anulado')).toBe(true)
    expect(admiteReintento('incierto')).toBe(false)
    expect(admiteReintento('aprobado')).toBe(false)
    expect(admiteReintento('revision')).toBe(false)
  })
})
