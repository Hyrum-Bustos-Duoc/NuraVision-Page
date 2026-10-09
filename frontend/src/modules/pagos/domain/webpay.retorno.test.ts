import { describe, expect, it } from 'vitest'
import { leerRetornoWebpay, retornoVacio } from './webpay.retorno'

describe('leerRetornoWebpay', () => {
  it('lee el token de un pago completado', () => {
    expect(leerRetornoWebpay('?token_ws=abc123')).toEqual({
      tokenWs: 'abc123',
      tbkToken: null,
    })
  })

  it('lee el token de un abandono', () => {
    const r = leerRetornoWebpay('?TBK_TOKEN=xyz&TBK_ORDEN_COMPRA=PD1-aa&TBK_ID_SESION=s1')
    expect(r).toEqual({ tokenWs: null, tbkToken: 'xyz' })
  })

  it('funciona sin el signo de interrogacion', () => {
    expect(leerRetornoWebpay('token_ws=abc').tokenWs).toBe('abc')
  })

  // El caso que Transbank documenta al reintentar sobre una sesion anulada: si
  // hay un cobro real que confirmar, ese manda.
  it('da prioridad a token_ws cuando llegan los dos', () => {
    const r = leerRetornoWebpay('?token_ws=nuevo&TBK_TOKEN=viejo')
    expect(r).toEqual({ tokenWs: 'nuevo', tbkToken: null })
  })

  it('trata los valores vacios como ausentes', () => {
    expect(leerRetornoWebpay('?token_ws=&TBK_TOKEN=')).toEqual({
      tokenWs: null,
      tbkToken: null,
    })
    expect(leerRetornoWebpay('?token_ws=%20%20').tokenWs).toBeNull()
  })

  it('no inventa nada con una URL sin parametros', () => {
    expect(leerRetornoWebpay('')).toEqual({ tokenWs: null, tbkToken: null })
  })
})

describe('retornoVacio', () => {
  it('reconoce que no hay nada que procesar', () => {
    expect(retornoVacio({ tokenWs: null, tbkToken: null })).toBe(true)
  })

  it('no confunde un abandono con una URL vacia', () => {
    expect(retornoVacio({ tokenWs: null, tbkToken: 'xyz' })).toBe(false)
    expect(retornoVacio({ tokenWs: 'abc', tbkToken: null })).toBe(false)
  })
})
