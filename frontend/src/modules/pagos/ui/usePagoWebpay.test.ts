// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { usePagoWebpay } from './usePagoWebpay'

// QA (nv-qa, 2026-10-11): regresion del bfcache. Al salir bien a Webpay
// `enviando` queda en true a proposito; si el navegador restaura la pagina
// congelada (pageshow con persisted), el boton no puede quedar bloqueado.
vi.mock('../infrastructure/supabase-pago.repository', () => ({
  pagoRepository: {
    iniciar: vi.fn().mockResolvedValue({ token: 't', url: 'https://webpay.test', ordenCompra: 'RS1-a', monto: 5000 }),
    confirmar: vi.fn(),
  },
}))
vi.mock('../infrastructure/webpay.formulario', () => ({ enviarAWebpay: vi.fn() }))

function pageshow(persisted: boolean) {
  const evento = new Event('pageshow') as Event & { persisted: boolean }
  Object.defineProperty(evento, 'persisted', { value: persisted })
  window.dispatchEvent(evento)
}

describe('usePagoWebpay', () => {
  it('QA: al volver desde el bfcache deja de estar enviando', async () => {
    const { result } = renderHook(() => usePagoWebpay())
    await act(() => result.current.pagar({ tipo: 'reserva', codigo: 'NV-2010-1234' }))
    expect(result.current.enviando).toBe(true)

    act(() => pageshow(false))
    expect(result.current.enviando).toBe(true)

    act(() => pageshow(true))
    expect(result.current.enviando).toBe(false)
  })

  it('QA: recuerda que se estaba pagando antes de salir a Webpay', async () => {
    window.sessionStorage.clear()
    const { result } = renderHook(() => usePagoWebpay())
    await act(() => result.current.pagar({ tipo: 'reserva', codigo: 'NV-2010-1234' }))
    expect(JSON.parse(window.sessionStorage.getItem('nuravision:pago-pendiente') ?? 'null')).toEqual({
      tipo: 'reserva',
      codigo: 'NV-2010-1234',
    })
  })
})
