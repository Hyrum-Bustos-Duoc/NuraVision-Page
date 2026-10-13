import { describe, expect, it } from 'vitest'
import { esTimeout, leerRetornoWebpay, retornoVacio } from './webpay.retorno'

describe('leerRetornoWebpay', () => {
  it('lee el token de un pago completado', () => {
    expect(leerRetornoWebpay('?token_ws=abc123')).toEqual({
      tokenWs: 'abc123',
      tbkToken: null,
      ordenCompra: null,
    })
  })

  it('lee el token y la orden de un abandono', () => {
    expect(
      leerRetornoWebpay('?TBK_TOKEN=xyz&TBK_ORDEN_COMPRA=PD1-aa&TBK_ID_SESION=s1'),
    ).toEqual({ tokenWs: null, tbkToken: 'xyz', ordenCompra: 'PD1-aa' })
  })

  // Timeout: Transbank no manda ningun token, solo la orden y la sesion.
  it('reconoce la sesion expirada, que llega sin token', () => {
    const r = leerRetornoWebpay('?TBK_ORDEN_COMPRA=PD1-aa&TBK_ID_SESION=s1')
    expect(r).toEqual({ tokenWs: null, tbkToken: null, ordenCompra: 'PD1-aa' })
    expect(esTimeout(r)).toBe(true)
    expect(retornoVacio(r)).toBe(false)
  })

  it('funciona sin el signo de interrogacion', () => {
    expect(leerRetornoWebpay('token_ws=abc').tokenWs).toBe('abc')
  })

  // El caso que Transbank documenta al reintentar sobre una sesion anulada: si
  // hay un cobro real que confirmar, ese manda.
  it('da prioridad a token_ws cuando llegan los dos', () => {
    const r = leerRetornoWebpay('?token_ws=nuevo&TBK_TOKEN=viejo&TBK_ORDEN_COMPRA=PD1-aa')
    expect(r.tokenWs).toBe('nuevo')
    expect(r.tbkToken).toBeNull()
    // La orden se conserva: identifica el intento aunque no se use para confirmar.
    expect(r.ordenCompra).toBe('PD1-aa')
  })

  it('trata los valores vacios como ausentes', () => {
    expect(leerRetornoWebpay('?token_ws=&TBK_TOKEN=&TBK_ORDEN_COMPRA=')).toEqual({
      tokenWs: null,
      tbkToken: null,
      ordenCompra: null,
    })
    expect(leerRetornoWebpay('?token_ws=%20%20').tokenWs).toBeNull()
  })

  it('no inventa nada con una URL sin parametros', () => {
    expect(leerRetornoWebpay('')).toEqual({
      tokenWs: null,
      tbkToken: null,
      ordenCompra: null,
    })
  })
})

describe('retornoVacio', () => {
  it('reconoce que no hay nada que procesar', () => {
    expect(retornoVacio({ tokenWs: null, tbkToken: null, ordenCompra: null })).toBe(true)
  })

  it('no confunde un abandono ni un timeout con una URL vacia', () => {
    expect(retornoVacio({ tokenWs: null, tbkToken: 'xyz', ordenCompra: null })).toBe(false)
    expect(retornoVacio({ tokenWs: 'abc', tbkToken: null, ordenCompra: null })).toBe(false)
    expect(retornoVacio({ tokenWs: null, tbkToken: null, ordenCompra: 'PD1-aa' })).toBe(false)
  })
})

describe('esTimeout', () => {
  it('solo es timeout si hay orden y ningun token', () => {
    expect(esTimeout({ tokenWs: null, tbkToken: null, ordenCompra: 'PD1' })).toBe(true)
    expect(esTimeout({ tokenWs: null, tbkToken: 'x', ordenCompra: 'PD1' })).toBe(false)
    expect(esTimeout({ tokenWs: 'x', tbkToken: null, ordenCompra: 'PD1' })).toBe(false)
    expect(esTimeout({ tokenWs: null, tbkToken: null, ordenCompra: null })).toBe(false)
  })
})
