// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Indicadores, RangoFechas } from '../domain/indicadores.types'
import { useIndicadores } from './useIndicadores'

/**
 * Carreras entre respuestas: al cambiar de rango rapido, la respuesta de un
 * rango anterior (exito o error) que llega tarde no debe pisar la del rango
 * vigente. El e2e cubre el exito tardio sobre la pantalla; aqui, el error
 * tardio y la vuelta al mismo rango, que no se ven desde la interfaz.
 */

const dobles = vi.hoisted(() => ({ obtener: vi.fn<(rango: RangoFechas) => Promise<Indicadores>>() }))
vi.mock('@/shared/infrastructure/supabase/client', () => ({ supabase: {} }))
vi.mock('../infrastructure/supabase-indicadores.repository', () => ({
  indicadoresRepository: { obtener: dobles.obtener },
}))

function diferida() {
  let resolver!: (v: Indicadores) => void
  let rechazar!: (e: Error) => void
  const promesa = new Promise<Indicadores>((res, rej) => {
    resolver = res
    rechazar = rej
  })
  return { promesa, resolver, rechazar }
}

const indicadores = (rango: RangoFechas, reservas: number): Indicadores => ({
  ...rango,
  reservas,
  porEstado: { pendiente: reservas, confirmada: 0, completada: 0, cancelada: 0 },
  ingresosEstimados: 0,
  clientasDistintas: 0,
  clientasRegistradas: 0,
  porMes: [{ mes: rango.desde.slice(0, 7), reservas, canceladas: 0 }],
  porServicio: [],
  porProfesional: [],
})

const A = { desde: '2026-01-01', hasta: '2026-10-31' }
const B = { desde: '2026-10-01', hasta: '2026-10-31' }

// Con llaves: una funcion devuelta por beforeEach, Vitest la ejecuta como limpieza.
beforeEach(() => {
  dobles.obtener.mockReset()
})

it('un error tardío del rango anterior no reemplaza los datos del rango vigente', async () => {
  const lentaA = diferida()
  dobles.obtener.mockImplementation((r) =>
    r.desde === A.desde ? lentaA.promesa : Promise.resolve(indicadores(r, 7)),
  )

  const { result, rerender } = renderHook(({ rango }) => useIndicadores(rango), {
    initialProps: { rango: A as RangoFechas | null },
  })
  rerender({ rango: B })
  await waitFor(() => expect(result.current.indicadores?.reservas).toBe(7))

  await act(async () => lentaA.rechazar(new Error('fallo de A')))

  expect(result.current.error).toBeNull()
  expect(result.current.indicadores?.desde).toBe(B.desde)
})

it('A -> B -> A: muestra la segunda respuesta de A, no la primera que llegó tarde', async () => {
  const primeraA = diferida()
  const segundaA = diferida()
  const deA = [primeraA, segundaA]
  dobles.obtener.mockImplementation((r) =>
    r.desde === A.desde ? deA.shift()!.promesa : new Promise(() => {}),
  )

  const { result, rerender } = renderHook(({ rango }) => useIndicadores(rango), {
    initialProps: { rango: A },
  })
  rerender({ rango: B })
  rerender({ rango: A })
  expect(result.current.cargando).toBe(true)

  await act(async () => segundaA.resolver(indicadores(A, 2)))
  await act(async () => primeraA.resolver(indicadores(A, 999)))

  expect(result.current.indicadores?.reservas).toBe(2)
  expect(dobles.obtener).toHaveBeenCalledTimes(3)
})

it('con rango nulo no consulta ni queda cargando', () => {
  const { result } = renderHook(() => useIndicadores(null))
  expect(result.current).toMatchObject({ indicadores: null, cargando: false, error: null })
  expect(dobles.obtener).not.toHaveBeenCalled()
})
