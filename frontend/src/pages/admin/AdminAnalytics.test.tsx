// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Indicadores, RangoFechas } from '@/modules/admin/application'
import AdminAnalytics from './AdminAnalytics'

/** Analitica con el repositorio de indicadores reemplazado por un doble. */

const dobles = vi.hoisted(() => ({
  obtener: vi.fn<(rango: RangoFechas) => Promise<Indicadores>>(),
  catalogo: {
    servicios: [
      { id: '1', categoria: 'unas' },
      { id: '2', categoria: 'unas' },
      { id: '3', categoria: 'cabello' },
    ],
    cargando: false,
    error: null as string | null,
    recargar: vi.fn(),
  },
}))

vi.mock('@/shared/infrastructure/supabase/client', () => ({ supabase: {} }))
vi.mock('@/modules/admin/infrastructure/supabase-indicadores.repository', () => ({
  indicadoresRepository: { obtener: dobles.obtener },
}))
vi.mock('@/modules/servicios/ui/useServiciosGestion', () => ({
  useServiciosGestion: () => dobles.catalogo,
}))

const MESES_2026 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((m) => `2026-${m}`)

function respuesta(rango: RangoFechas, cambios: Partial<Indicadores> = {}): Indicadores {
  return {
    ...rango,
    reservas: 0,
    porEstado: { pendiente: 0, confirmada: 0, completada: 0, cancelada: 0 },
    ingresosEstimados: 0,
    clientasDistintas: 0,
    clientasRegistradas: 0,
    porMes: [],
    porServicio: [],
    porProfesional: [],
    ...cambios,
  }
}

function conDatos(rango: RangoFechas): Promise<Indicadores> {
  return Promise.resolve(
    respuesta(rango, {
      reservas: 20,
      porEstado: { pendiente: 4, confirmada: 6, completada: 5, cancelada: 5 },
      ingresosEstimados: 300000,
      clientasDistintas: 12,
      porMes: MESES_2026.map((mes) => ({ mes, reservas: 2, canceladas: 0 })),
      porServicio: Array.from({ length: 8 }, (_, i) => ({
        servicioId: String(i + 1),
        nombre: `Servicio ${i + 1}`,
        reservas: 9 - i,
      })),
      porProfesional: [{ profesionalId: '2', nombre: 'Berenice', reservas: 15 }],
    }),
  )
}

function rangosPedidos(): RangoFechas[] {
  return dobles.obtener.mock.calls.map(([rango]) => rango)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // 20:00 del 29 de octubre en Chile.
  vi.setSystemTime(new Date('2026-10-29T23:00:00Z'))
  dobles.obtener.mockReset()
  dobles.obtener.mockImplementation(conDatos)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminAnalytics', () => {
  it('«Este año» pide del 1 de enero a hoy y la evolución muestra 10 meses', async () => {
    render(<AdminAnalytics />)
    await userEvent.click(screen.getByRole('button', { name: 'Este año' }))

    await waitFor(() =>
      expect(rangosPedidos()).toContainEqual({ desde: '2026-01-01', hasta: '2026-10-29' }),
    )
    expect(await screen.findByText('Ene 26')).toBeInTheDocument()
    expect(screen.getByText('Oct 26')).toBeInTheDocument()
    expect(screen.getAllByTitle(/reservas$/)).toHaveLength(10)
  })

  it('muestra las cuatro métricas con «Ingresos estimados», top 6 y profesionales', async () => {
    render(<AdminAnalytics />)

    expect(await screen.findByText('Ingresos estimados')).toBeInTheDocument()
    expect(screen.getByText('$300.000')).toBeInTheDocument()
    expect(screen.getByText('Clientas distintas')).toBeInTheDocument()
    expect(screen.getByText('25.0%')).toBeInTheDocument()
    expect(screen.getByText('Servicio 6')).toBeInTheDocument()
    expect(screen.queryByText('Servicio 7')).not.toBeInTheDocument()
    expect(screen.getByText('Berenice')).toBeInTheDocument()
    // Por defecto, los ultimos 6 meses terminados hoy en Chile.
    expect(rangosPedidos()[0]).toEqual({ desde: '2026-04-29', hasta: '2026-10-29' })
  })

  it('cuenta el catálogo real por categoría', async () => {
    render(<AdminAnalytics />)

    await screen.findByText('Catálogo por categoría')
    expect(screen.getByText('Uñas').nextSibling).toHaveTextContent('2 servicios')
    expect(screen.getByText('Cabello').nextSibling).toHaveTextContent('1 servicios')
    expect(screen.getByText('Piel').nextSibling).toHaveTextContent('0 servicios')
  })

  it('con el rango invertido avisa y no llama a la función', async () => {
    render(<AdminAnalytics />)
    await userEvent.click(screen.getByRole('button', { name: 'Personalizado' }))

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-20' } })

    expect(screen.getByText('La fecha inicial debe ser anterior a la final.')).toBeInTheDocument()
    expect(screen.getByText('El rango de fechas no es válido')).toBeInTheDocument()
    expect(rangosPedidos().filter((r) => r.desde > r.hasta)).toEqual([])
    expect(rangosPedidos()).not.toContainEqual({ desde: '2026-10-20', hasta: '2026-10-01' })
  })

  it('período sin reservas: «Sin datos en este período»', async () => {
    dobles.obtener.mockImplementation((rango) => Promise.resolve(respuesta(rango)))
    render(<AdminAnalytics />)

    expect(await screen.findByText('Sin datos en este período')).toBeInTheDocument()
  })

  it('mientras carga no muestra métricas', () => {
    dobles.obtener.mockReturnValue(new Promise(() => {}))
    render(<AdminAnalytics />)

    expect(screen.getByText('Cargando indicadores…')).toBeInTheDocument()
    expect(screen.queryByText('Reservas')).not.toBeInTheDocument()
  })

  it('error con reintento: repite la llamada con el mismo rango', async () => {
    dobles.obtener.mockRejectedValueOnce(new Error('No se pudieron cargar los indicadores: red'))
    render(<AdminAnalytics />)

    expect(await screen.findByText('No se pudieron cargar los indicadores: red')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Ingresos estimados')).toBeInTheDocument()
    const [primera, segunda] = rangosPedidos()
    expect(segunda).toEqual(primera)
  })
})
