import { describe, expect, it } from 'vitest'
import { leerErrorDeEnlace } from './recuperacion.enlace'

describe('leerErrorDeEnlace', () => {
  it('no ve error donde no lo hay', () => {
    expect(leerErrorDeEnlace('')).toBeNull()
    expect(leerErrorDeEnlace('#')).toBeNull()
    // El hash de un enlace que SI funciono trae los tokens, no un error.
    expect(leerErrorDeEnlace('#access_token=abc&type=recovery')).toBeNull()
  })

  it('reconoce el enlace caducado y lo explica en español', () => {
    const r = leerErrorDeEnlace(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )
    expect(r?.codigo).toBe('otp_expired')
    expect(r?.mensaje).toContain('caducó')
    // El texto en ingles de Supabase no debe llegar a la pantalla.
    expect(r?.mensaje).not.toContain('Email link')
  })

  it('reconoce el acceso denegado cuando no viene error_code', () => {
    const r = leerErrorDeEnlace('#error=access_denied')
    expect(r?.codigo).toBe('access_denied')
    expect(r?.mensaje).toContain('ya no sirve')
  })

  it('prefiere error_code sobre error', () => {
    const r = leerErrorDeEnlace('#error=access_denied&error_code=otp_expired')
    expect(r?.codigo).toBe('otp_expired')
  })

  it('da un mensaje generico ante un codigo desconocido', () => {
    const r = leerErrorDeEnlace('#error_code=algo_que_no_conocemos')
    expect(r?.codigo).toBe('algo_que_no_conocemos')
    expect(r?.mensaje).toContain('Pide uno nuevo')
  })

  it('funciona con o sin el signo de numeral', () => {
    expect(leerErrorDeEnlace('error_code=otp_expired')?.codigo).toBe('otp_expired')
    expect(leerErrorDeEnlace('#error_code=otp_expired')?.codigo).toBe('otp_expired')
  })

  it('trata un codigo vacio como ausencia de error', () => {
    expect(leerErrorDeEnlace('#error=&error_code=')).toBeNull()
    expect(leerErrorDeEnlace('#error_code=%20%20')).toBeNull()
  })
})
