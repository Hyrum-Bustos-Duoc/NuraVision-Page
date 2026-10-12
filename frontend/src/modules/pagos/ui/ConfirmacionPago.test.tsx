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
    expect(screen.getByText(/revisa tu correo/)).toBeInTheDocument()
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
    expect(screen.getByText('El banco rechazó la transacción.')).toBeInTheDocument()
  })
})
