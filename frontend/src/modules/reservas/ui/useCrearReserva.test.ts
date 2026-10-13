// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { NuevaReserva } from '../domain/reserva.types'
import { useCrearReserva } from './useCrearReserva'

const crear = vi.fn<(nueva: NuevaReserva) => Promise<void>>()

vi.mock('../infrastructure/supabase-reserva.repository', () => ({
  reservaRepository: { crear: (nueva: NuevaReserva) => crear(nueva) },
}))
const pedirEnvio = vi.fn<(codigo: string) => Promise<boolean>>(() => Promise.resolve(true))

vi.mock('../infrastructure/supabase-confirmacion.repository', () => ({
  confirmacionRepository: { pedirEnvio: (codigo: string) => pedirEnvio(codigo) },
}))

const NUEVA: NuevaReserva = {
  servicioId: '7',
  profesionalId: '3',
  fecha: '2026-10-20',
  horaInicio: '10:00',
  horaFin: '11:00',
  clienteNombre: 'Ana',
  clienteEmail: 'ana@correo.cl',
  clienteTelefono: '',
  codigo: 'NV-2010-1234',
  clienteId: null,
  varianteElegida: null,
}

describe('useCrearReserva', () => {
  beforeEach(() => {
    crear.mockReset()
    pedirEnvio.mockClear()
  })

  it('camino a Webpay guarda sin correo, y avisar lo manda despues', async () => {
    crear.mockResolvedValue()
    const { result } = renderHook(() => useCrearReserva())

    await act(async () => {
      expect(await result.current.crear(NUEVA, { conCorreo: false })).toBe(true)
    })
    expect(pedirEnvio).not.toHaveBeenCalled()

    await act(async () => {
      result.current.avisar(NUEVA.codigo)
    })
    expect(pedirEnvio).toHaveBeenCalledWith(NUEVA.codigo)
    expect(result.current.correoEnviado).toBe(true)
  })

  it('sin opciones manda el correo al guardar', async () => {
    crear.mockResolvedValue()
    const { result } = renderHook(() => useCrearReserva())

    await act(async () => {
      await result.current.crear(NUEVA)
    })
    expect(pedirEnvio).toHaveBeenCalledTimes(1)
  })

  it('dos envios seguidos crean una sola reserva', async () => {
    let terminar: () => void = () => {}
    crear.mockReturnValue(new Promise<void>((r) => (terminar = r)))
    const { result } = renderHook(() => useCrearReserva())

    let primero: Promise<boolean> = Promise.resolve(false)
    let segundo: Promise<boolean> = Promise.resolve(false)
    act(() => {
      primero = result.current.crear(NUEVA)
      segundo = result.current.crear(NUEVA)
    })
    await act(async () => {
      terminar()
      await primero
    })

    expect(crear).toHaveBeenCalledTimes(1)
    expect(await primero).toBe(true)
    expect(await segundo).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('tras un fallo se puede reintentar', async () => {
    crear.mockRejectedValueOnce(new Error('Ese bloque ya está tomado.')).mockResolvedValueOnce()
    const { result } = renderHook(() => useCrearReserva())

    await act(async () => {
      expect(await result.current.crear(NUEVA)).toBe(false)
    })
    expect(result.current.error).toBe('Ese bloque ya está tomado.')

    await act(async () => {
      expect(await result.current.crear(NUEVA)).toBe(true)
    })
    expect(crear).toHaveBeenCalledTimes(2)
  })

  it('limpiarError olvida el fallo anterior', async () => {
    crear.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useCrearReserva())

    await act(async () => {
      await result.current.crear(NUEVA)
    })
    expect(result.current.error).toBe('boom')

    act(() => result.current.limpiarError())
    expect(result.current.error).toBeNull()
  })
})
