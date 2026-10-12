// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Comprobante, RetornoWebpay } from '../domain/pago.types'
import ConfirmacionPago from './ConfirmacionPago'

const confirmar = vi.fn<(retorno: RetornoWebpay) => Promise<Comprobante>>()

vi.mock('../infrastructure/supabase-pago.repository', () => ({
  pagoRepository: { confirmar: (r: RetornoWebpay) => confirmar(r), iniciar: vi.fn() },
}))

const APROBADO: Comprobante = {
  estado: 'autorizado',
  aprobado: true,
  ordenCompra: 'RS7-abc',
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

/** Lo que responde el servidor mientras otra peticion cierra el cobro. */
const PROCESANDO: Comprobante = {
  ...APROBADO,
  estado: 'iniciado',
  aprobado: false,
  codigoAutorizacion: null,
  tipoPago: null,
  cuotas: null,
  tarjetaFinal: null,
  // Asi lo manda el servidor: procesando viene con repetida y sin aprobar.
  repetida: true,
  procesando: true,
}

function pintar({ estricto = false } = {}) {
  const arbol = (
    <MemoryRouter initialEntries={['/confirmacion-pago?token_ws=tok-1']}>
      <ConfirmacionPago />
    </MemoryRouter>
  )
  render(estricto ? <StrictMode>{arbol}</StrictMode> : arbol)
}

/** Deja correr promesas y temporizadores pendientes dentro de `act`. */
const avanzar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('ConfirmacionPago', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    confirmar.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('con procesando muestra "Confirmando" y vuelve a preguntar hasta el comprobante', async () => {
    confirmar
      .mockResolvedValueOnce(PROCESANDO)
      .mockResolvedValueOnce(PROCESANDO)
      .mockResolvedValueOnce({ ...APROBADO, repetida: true })
    pintar()

    await avanzar(0)
    expect(screen.getByText('Confirmando tu pago…')).toBeInTheDocument()
    expect(screen.queryByText(/rechazado/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no se te cobró/i)).not.toBeInTheDocument()

    await avanzar(2000)
    expect(screen.getByText('Confirmando tu pago…')).toBeInTheDocument()

    await avanzar(2000)
    expect(screen.getByText('¡Pago aprobado!')).toBeInTheDocument()
    expect(confirmar).toHaveBeenCalledTimes(3)
  })

  it('si sigue procesando ~30 s, dice que se sigue verificando y deja de preguntar', async () => {
    confirmar.mockResolvedValue(PROCESANDO)
    pintar()

    await avanzar(30_000)
    expect(screen.getByText('Seguimos verificando tu pago')).toBeInTheDocument()
    // No se promete un correo que nadie garantiza enviar.
    expect(screen.queryByText(/correo/)).not.toBeInTheDocument()
    expect(screen.queryByText(/rechazado/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no se te cobró/i)).not.toBeInTheDocument()

    const hechas = confirmar.mock.calls.length
    expect(hechas).toBe(15)
    await avanzar(10_000)
    expect(confirmar).toHaveBeenCalledTimes(hechas)
  })

  // El doble montaje: la primera peticion reclama el cobro y su respuesta se
  // descarta; la segunda recibe `procesando`. La pantalla no debe quedarse ahi.
  it('en StrictMode la respuesta descartada no deja la pantalla atascada', async () => {
    let resolverPrimera: (c: Comprobante) => void = () => {}
    confirmar
      .mockReturnValueOnce(new Promise((r) => (resolverPrimera = r)))
      .mockResolvedValueOnce(PROCESANDO)
      .mockResolvedValue({ ...APROBADO, repetida: true })
    pintar({ estricto: true })

    await avanzar(0)
    expect(screen.getByText('Confirmando tu pago…')).toBeInTheDocument()

    // La primera responde tarde con el resultado real: se ignora sin romper nada.
    resolverPrimera(APROBADO)
    await avanzar(2000)
    expect(screen.getByText('¡Pago aprobado!')).toBeInTheDocument()
  })

  it('una respuesta repetida sin codigo muestra el comprobante sin la fila de reserva', async () => {
    confirmar.mockResolvedValue({ ...APROBADO, codigo: null, repetida: true })
    pintar()

    await avanzar(0)
    expect(screen.getByText('¡Pago aprobado!')).toBeInTheDocument()
    expect(screen.queryByText('Reserva')).not.toBeInTheDocument()
    expect(screen.getByText('Saldo a pagar en el local').nextSibling).toHaveTextContent('$13.000')
  })

  it('un rechazo real si se informa como rechazo', async () => {
    confirmar.mockResolvedValue({
      ...PROCESANDO,
      estado: 'rechazado',
      procesando: undefined,
      motivo: 'El banco rechazó la transacción.',
    })
    pintar()

    await avanzar(0)
    expect(screen.getByText('Pago rechazado')).toBeInTheDocument()
    expect(screen.getByText('El banco rechazó la transacción. No se te cobró.')).toBeInTheDocument()
  })

  it('un cobro en error dice que no vuelva a pagar y no ofrece reintentar', async () => {
    confirmar.mockResolvedValue({
      ...PROCESANDO,
      estado: 'error',
      procesando: undefined,
      motivo: 'No pudimos confirmar el estado del pago con Transbank.',
    })
    pintar()

    await avanzar(0)
    expect(screen.getByText('No pudimos confirmar el resultado del pago')).toBeInTheDocument()
    expect(screen.getByText(/No vuelvas a pagar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar el pago' })).not.toBeInTheDocument()
  })

  // Se cobro, pero la reserva ya no estaba pendiente (p. ej. se cancelo).
  it('aprobado con motivo no presenta la hora como confirmada', async () => {
    confirmar.mockResolvedValue({ ...APROBADO, motivo: 'La reserva ya estaba cancelada.' })
    pintar()

    await avanzar(0)
    expect(screen.getByText(/La reserva ya estaba cancelada\./)).toBeInTheDocument()
    expect(screen.getByText(/te devolverá el dinero/)).toBeInTheDocument()
    expect(screen.queryByText(/confirmada/)).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo a pagar en el local')).not.toBeInTheDocument()
  })

  it('volver a consultar relanza la confirmacion tras el limite', async () => {
    confirmar.mockResolvedValue(PROCESANDO)
    pintar()
    await avanzar(30_000)

    confirmar.mockResolvedValue({ ...APROBADO, repetida: true })
    await act(async () => screen.getByRole('button', { name: 'Volver a consultar' }).click())
    await avanzar(0)
    expect(screen.getByText('¡Pago aprobado!')).toBeInTheDocument()
  })

  // Un abandono sin comprobante no trae codigo: se reintenta lo recordado al
  // salir a Webpay.
  it('un abandono sin codigo ofrece reintentar con el pago recordado', async () => {
    window.sessionStorage.setItem(
      'nuravision:pago-pendiente',
      JSON.stringify({ tipo: 'reserva', codigo: 'NV-2010-1234' }),
    )
    confirmar.mockResolvedValue({
      ...PROCESANDO,
      estado: 'anulado',
      procesando: undefined,
      repetida: undefined,
      codigo: null,
    })
    pintar()

    await avanzar(0)
    expect(screen.getByText('Pago cancelado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar el pago' })).toBeInTheDocument()
    window.sessionStorage.clear()
  })

  // --- QA (nv-qa, 2026-10-11): casos que encontro QA --------------------------------------

  // webpay-confirmar-transaccion deja 'error' cuando NO sabe si se cobro (commit y
  // consulta de estado sin respuesta) o cuando SI se cobro (segundo autorizado,
  // 23505). Al recargar, la respuesta repetida llega sin `motivo`.
  it('QA: la recarga de un cobro en error no afirma que no se cobro', async () => {
    confirmar.mockResolvedValue({
      ...PROCESANDO,
      estado: 'error',
      procesando: undefined,
      motivo: undefined,
    })
    pintar()

    await avanzar(0)
    expect(screen.queryByText(/no se te cobró/i)).not.toBeInTheDocument()
  })

  // Spec pagos-webpay, «Pantalla de resultado del pago»: no aprobado con el
  // motivo y una accion para reintentar el pago.
  it('QA: un pago rechazado ofrece reintentar el pago', async () => {
    confirmar.mockResolvedValue({
      ...PROCESANDO,
      estado: 'rechazado',
      procesando: undefined,
      repetida: undefined,
      motivo: 'El pago fue rechazado por el medio de pago.',
    })
    pintar()

    await avanzar(0)
    const acciones = [
      ...screen.queryAllByRole('button', { name: /reintentar|pagar de nuevo|intentar/i }),
      ...screen.queryAllByRole('link', { name: /reintentar|pagar de nuevo|intentar/i }),
    ]
    expect(acciones.length).toBeGreaterThan(0)
  })

  // Spec: «si a los 30 segundos no hay estado final, SHALL decir que el pago se
  // esta verificando y ofrecer volver a consultar».
  it('QA: tras 30 s en procesando ofrece volver a consultar', async () => {
    confirmar.mockResolvedValue(PROCESANDO)
    pintar()

    await avanzar(30_000)
    expect(screen.getByText('Seguimos verificando tu pago')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /consultar|verificar|actualizar/i })).toBeInTheDocument()
  })

  // QA (nv-qa, 2026-10-11, segunda pasada): la reserva guardada camino a Webpay
  // (BookingFlow, sessionStorage) no se olvida al aprobarse el pago. En la misma
  // pestaña, elegir de nuevo esa hora con el mismo contacto reutiliza un codigo
  // ya pagado: Webpay responde 409 "ya esta pagado" y el paso Abono dice
  // "sin el abono no esta confirmada. Reintenta el pago".
  it('QA: un pago aprobado olvida la reserva sin pagar de esta pestaña', async () => {
    window.sessionStorage.setItem(
      'nuravision:reserva-sin-pagar',
      JSON.stringify({ clave: '7||3|2026-10-20|10:00', contacto: 'Ana|ana@correo.cl|+569', codigo: 'NV-2010-1234' }),
    )
    confirmar.mockResolvedValue(APROBADO)
    pintar()

    await avanzar(0)
    expect(screen.getByText('¡Pago aprobado!')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('nuravision:reserva-sin-pagar')).toBeNull()
    window.sessionStorage.clear()
  })
})

