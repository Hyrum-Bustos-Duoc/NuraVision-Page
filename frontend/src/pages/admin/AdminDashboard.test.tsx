// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Indicadores, RangoFechas } from '@/modules/admin/application'
import type { FiltrosReservas, ReservaGestion } from '@/modules/admin/domain/reserva-gestion.types'
import AdminDashboard from './AdminDashboard'

/**
 * Dashboard con los repositorios reemplazados por dobles en memoria: se
 * comprueba que la pagina PIDE los rangos correctos para el dia de Chile y que
 * pinta las cifras de la base, no solo que pinta algo.
 */

const dobles = vi.hoisted(() => ({
  obtener: vi.fn<(rango: RangoFechas) => Promise<Indicadores>>(),
  listar: vi.fn<(filtros: FiltrosReservas) => Promise<ReservaGestion[]>>(),
}))

vi.mock('@/shared/infrastructure/supabase/client', () => ({ supabase: {} }))
vi.mock('@/modules/admin/infrastructure/supabase-indicadores.repository', () => ({
  indicadoresRepository: { obtener: dobles.obtener },
}))
vi.mock('@/modules/admin/infrastructure/supabase-reserva-gestion.repository', () => ({
  reservaGestionRepository: { listar: dobles.listar, confirmar: vi.fn() },
}))
vi.mock('@/modules/profesionales/ui/useProfesionales', () => ({
  useProfesionales: () => ({
    profesionales: [{ id: '1', nombre: 'Daniela Soto' }],
    cargando: false,
    error: null,
  }),
}))
const sinNombres = { porId: new Map(), cargando: false, error: null }
vi.mock('@/modules/servicios/ui/useServiciosPorIds', () => ({ useServiciosPorIds: () => sinNombres }))
vi.mock('@/modules/profesionales/ui/useProfesionalesPorIds', () => ({
  useProfesionalesPorIds: () => sinNombres,
}))

/** Meses 'YYYY-MM' de un rango, como los devuelve la funcion. */
function mesesDe({ desde, hasta }: RangoFechas): string[] {
  const meses: string[] = []
  let [anio, mes] = desde.split('-').map(Number)
  const fin = hasta.slice(0, 7)
  for (;;) {
    const clave = `${anio}-${String(mes).padStart(2, '0')}`
    meses.push(clave)
    if (clave === fin) return meses
    mes += 1
    if (mes === 13) {
      mes = 1
      anio += 1
    }
  }
}

function respuesta(rango: RangoFechas, cambios: Partial<Indicadores> = {}): Indicadores {
  return {
    ...rango,
    reservas: 0,
    porEstado: { pendiente: 0, confirmada: 0, completada: 0, cancelada: 0 },
    ingresosEstimados: 0,
    clientasDistintas: 0,
    clientasRegistradas: 0,
    porMes: mesesDe(rango).map((mes) => ({ mes, reservas: 0, canceladas: 0 })),
    porServicio: [],
    porProfesional: [],
    ...cambios,
  }
}

/** Escenario «Cifras coinciden con la base» de la spec, con hoy = 2026-10-29. */
function baseDeOctubre(rango: RangoFechas): Promise<Indicadores> {
  if (rango.desde === rango.hasta) {
    return Promise.resolve(
      respuesta(rango, {
        reservas: 5,
        porEstado: { pendiente: 2, confirmada: 1, completada: 1, cancelada: 1 },
      }),
    )
  }
  return Promise.resolve(
    respuesta(rango, {
      reservas: 52,
      clientasRegistradas: 96,
      porMes: mesesDe(rango).map((mes) =>
        mes === '2026-10' ? { mes, reservas: 40, canceladas: 4 } : { mes, reservas: 2, canceladas: 0 },
      ),
      porServicio: [{ servicioId: '3', nombre: 'Manicure semipermanente', reservas: 21 }],
    }),
  )
}

function rangosPedidos(): RangoFechas[] {
  return dobles.obtener.mock.calls.map(([rango]) => rango)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  dobles.obtener.mockReset()
  dobles.listar.mockReset()
  dobles.listar.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminDashboard: fecha del estudio', () => {
  // Con el proceso en la zona de Chile: el caso en que `toISOString()` ya
  // daria el dia siguiente.
  const tzOriginal = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/Santiago'
  })
  afterAll(() => {
    process.env.TZ = tzOriginal
  })

  it('a las 22:30 del 31 de octubre en Chile pide octubre y el día 31', async () => {
    vi.setSystemTime(new Date('2026-11-01T01:30:00Z'))
    dobles.obtener.mockImplementation((rango) => Promise.resolve(respuesta(rango)))

    render(<AdminDashboard />)

    await screen.findByText('Octubre 2026')
    expect(screen.getByText('Estudio Nura · 31 de octubre, 2026')).toBeInTheDocument()
    expect(rangosPedidos()).toEqual(
      expect.arrayContaining([
        { desde: '2026-04-01', hasta: '2026-10-31' },
        { desde: '2026-10-31', hasta: '2026-10-31' },
      ]),
    )
  })

  it('el 15 de enero de 2027 la evolución va de julio de 2026 a enero de 2027', async () => {
    vi.setSystemTime(new Date('2027-01-15T15:00:00Z'))
    dobles.obtener.mockImplementation((rango) => Promise.resolve(respuesta(rango)))

    render(<AdminDashboard />)

    expect(await screen.findByText('Julio 2026 – Enero 2027')).toBeInTheDocument()
    expect(screen.getByText('Estudio Nura · 15 de enero, 2027')).toBeInTheDocument()
    expect(rangosPedidos()).toContainEqual({ desde: '2026-07-01', hasta: '2027-01-31' })
  })
})

describe('AdminDashboard: cifras', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-29T15:00:00Z'))
  })

  it('muestra las cifras de la base: 40, 10.0% sin resaltar, 4 hoy y 3 por atender', async () => {
    dobles.obtener.mockImplementation(baseDeOctubre)

    render(<AdminDashboard />)

    expect(await screen.findByText('40')).toBeInTheDocument()
    expect(screen.getByText('10.0%')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('3 por atender')).toBeInTheDocument()
    expect(screen.getByText('96')).toBeInTheDocument()
    expect(screen.getByText('Manicure semipermanente')).toBeInTheDocument()
    // 10% no supera el umbral: el rotulo no va en rojo.
    expect(screen.getByText('Sobre las reservas del mes')).not.toHaveClass('text-danger')
  })

  it('mientras la base no responde, las tarjetas no muestran 0', () => {
    dobles.obtener.mockReturnValue(new Promise(() => {}))

    render(<AdminDashboard />)

    expect(screen.getAllByText('…')).toHaveLength(4)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
  })

  it('si la lectura falla muestra el motivo sin ceros, y reintentar la repite', async () => {
    dobles.obtener.mockRejectedValue(new Error('Solo el personal del estudio puede ver los indicadores.'))

    render(<AdminDashboard />)

    expect(
      await screen.findByText('Solo el personal del estudio puede ver los indicadores.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Reservas del mes')).not.toBeInTheDocument()
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()

    const llamadasAntes = dobles.obtener.mock.calls.length
    dobles.obtener.mockImplementation(baseDeOctubre)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('3 por atender')).toBeInTheDocument()
    expect(dobles.obtener.mock.calls.length).toBeGreaterThan(llamadasAntes)
  })
})

describe('AdminDashboard: reservas recientes', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-29T15:00:00Z'))
    dobles.obtener.mockImplementation((rango) => Promise.resolve(respuesta(rango)))
  })

  it('pide como máximo 8 filas y filtra por estado en la base', async () => {
    render(<AdminDashboard />)

    await waitFor(() => expect(dobles.listar).toHaveBeenCalledWith({ limite: 8 }))

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'pendiente')

    await waitFor(() =>
      expect(dobles.listar).toHaveBeenLastCalledWith({ estado: 'pendiente', limite: 8 }),
    )
    // Solo los 4 estados de la base: 'en_curso' no existe.
    const opciones = screen
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'))
      .filter((v) => v !== 'todos' && v !== '1')
    expect(opciones).toEqual(['pendiente', 'confirmada', 'completada', 'cancelada'])
  })

  it('sin resultados muestra el mensaje vacío', async () => {
    render(<AdminDashboard />)

    expect(await screen.findByText('No hay reservas para estos filtros')).toBeInTheDocument()
  })

  it('pinta las filas que devuelve la base', async () => {
    dobles.listar.mockResolvedValue([
      {
        id: '7',
        codigo: 'NV-0001',
        servicioId: '3',
        profesionalId: '1',
        fecha: '2026-10-29',
        horaInicio: '10:00',
        horaFin: '11:00',
        clienteNombre: 'Valentina Rojas',
        clienteEmail: 'vale@correo.cl',
        clienteTelefono: null,
        clienteId: null,
        estado: 'pendiente',
        varianteElegida: null,
        abono: 0,
      },
    ])

    render(<AdminDashboard />)

    expect(await screen.findByText('Valentina Rojas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  })
})
