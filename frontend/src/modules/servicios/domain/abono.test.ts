import { describe, expect, it } from 'vitest'
import { desglosarPago } from './abono'

const SIN_ABONO = { cobrarAbono: false, montoAbono: null }
const CON_ABONO = { cobrarAbono: true, montoAbono: 5000 }

describe('desglosarPago', () => {
  it('cobra el total cuando el servicio no pide abono', () => {
    expect(desglosarPago(20000, SIN_ABONO)).toEqual({
      total: 20000,
      aPagarAhora: 20000,
      saldo: 0,
      esAbono: false,
    })
  })

  it('cobra solo el abono y deja el resto como saldo', () => {
    expect(desglosarPago(40000, CON_ABONO)).toEqual({
      total: 40000,
      aPagarAhora: 5000,
      saldo: 35000,
      esAbono: true,
    })
  })

  // El estudio configura un abono fijo, pero con variantes el total varia: un
  // abono por encima del precio seria cobrar de mas.
  it('nunca cobra mas que el total', () => {
    const r = desglosarPago(3000, { cobrarAbono: true, montoAbono: 5000 })
    expect(r.aPagarAhora).toBe(3000)
    expect(r.saldo).toBe(0)
  })

  it('deja de llamarlo abono cuando no queda saldo', () => {
    // El abono coincide exactamente con el total.
    expect(desglosarPago(5000, CON_ABONO)).toEqual({
      total: 5000,
      aPagarAhora: 5000,
      saldo: 0,
      esAbono: false,
    })
    // Y cuando el abono lo supera.
    expect(desglosarPago(3000, CON_ABONO).esAbono).toBe(false)
  })

  it('ignora un abono mal configurado y cobra el total', () => {
    for (const malo of [null, 0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = desglosarPago(20000, { cobrarAbono: true, montoAbono: malo as number | null })
      expect(r.aPagarAhora).toBe(20000)
      expect(r.esAbono).toBe(false)
    }
  })

  it('el saldo siempre cierra la cuenta', () => {
    for (const total of [1000, 5000, 12345, 40000]) {
      const r = desglosarPago(total, CON_ABONO)
      expect(r.aPagarAhora + r.saldo).toBe(r.total)
      expect(r.aPagarAhora).toBeGreaterThan(0)
      expect(r.saldo).toBeGreaterThanOrEqual(0)
    }
  })

  it('redondea a pesos enteros, que es lo que acepta Transbank', () => {
    const r = desglosarPago(19999.6, { cobrarAbono: true, montoAbono: 4999.4 })
    expect(r.total).toBe(20000)
    expect(r.aPagarAhora).toBe(4999)
    expect(r.saldo).toBe(15001)
  })

  it('no inventa cifras con un total invalido', () => {
    for (const total of [0, -5000, Number.NaN]) {
      const r = desglosarPago(total, CON_ABONO)
      expect(r.total).toBe(0)
      expect(r.aPagarAhora).toBe(0)
      expect(r.saldo).toBe(0)
    }
  })
})
