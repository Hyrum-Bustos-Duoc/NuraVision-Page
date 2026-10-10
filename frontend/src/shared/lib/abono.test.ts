import { aAbono, saldoTrasAbono } from './abono'

describe('aAbono', () => {
  it('deja pasar enteros >= 0', () => {
    expect(aAbono(0)).toBe(0)
    expect(aAbono(5000)).toBe(5000)
  })

  it('lee como 0 lo ausente o mal formado', () => {
    expect(aAbono(undefined)).toBe(0)
    expect(aAbono(null)).toBe(0)
    expect(aAbono('5000')).toBe(0)
    expect(aAbono(-1)).toBe(0)
    expect(aAbono(4999.5)).toBe(0)
    expect(aAbono(Number.NaN)).toBe(0)
  })
})

describe('saldoTrasAbono', () => {
  it('descuenta el abono del precio', () => {
    expect(saldoTrasAbono(18000, 5000)).toBe(13000)
    expect(saldoTrasAbono(20000, 4000)).toBe(16000)
  })

  it('nunca es negativo', () => {
    expect(saldoTrasAbono(3000, 5000)).toBe(0)
  })
})
