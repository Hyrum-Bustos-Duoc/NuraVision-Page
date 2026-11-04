import { hoyEnElEstudio } from '@/shared/lib/calendario'
import {
  problemaDelRango,
  rangoDelDashboard,
  rangoDelPreset,
  resumirDashboard,
  tasaCancelacion,
} from './indicadores.reglas'
import type { Indicadores } from './indicadores.types'

/**
 * Las fechas se prueban con la zona del proceso cambiada a proposito: Node
 * relee `TZ` al vuelo, asi que `new Date(anio, mes, dia)` dentro de
 * `sumarMeses` usa la zona que se fija aqui. El caso que importa es el de
 * Chile despues de las 21:00, cuando en UTC ya es el dia siguiente.
 */
const TZ_ORIGINAL = process.env.TZ

function enZona(zona: string) {
  beforeAll(() => {
    process.env.TZ = zona
  })
  afterAll(() => {
    process.env.TZ = TZ_ORIGINAL
  })
}

function indicadores(cambios: Partial<Indicadores> = {}): Indicadores {
  return {
    desde: '2026-10-01',
    hasta: '2026-10-31',
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

describe('hoy y rangos en Chile', () => {
  enZona('America/Santiago')

  it('a las 22:30 del 31 de octubre en Chile (1 de noviembre en UTC) hoy sigue siendo el 31', () => {
    const instante = new Date('2026-11-01T01:30:00Z')
    // Precondicion: la zona del proceso es de verdad la de Chile.
    expect(instante.getDate()).toBe(31)
    const hoy = hoyEnElEstudio(instante)
    expect(hoy).toBe('2026-10-31')
    // "Reservas del mes" es octubre: el rango de 7 meses termina el 31.
    expect(rangoDelDashboard(hoy)).toEqual({ desde: '2026-04-01', hasta: '2026-10-31' })
  })

  it('pasadas las 21:00 los presets terminan hoy y no mañana', () => {
    // 21:30 del 29 de octubre en Chile = 00:30 del 30 en UTC.
    const hoy = hoyEnElEstudio(new Date('2026-10-30T00:30:00Z'))
    expect(hoy).toBe('2026-10-29')
    expect(rangoDelPreset('30d', hoy)).toEqual({ desde: '2026-09-29', hasta: '2026-10-29' })
    expect(rangoDelPreset('3m', hoy)).toEqual({ desde: '2026-07-29', hasta: '2026-10-29' })
    expect(rangoDelPreset('6m', hoy)).toEqual({ desde: '2026-04-29', hasta: '2026-10-29' })
    expect(rangoDelPreset('anio', hoy)).toEqual({ desde: '2026-01-01', hasta: '2026-10-29' })
  })

  it('cambio de año: el 15 de enero de 2027 la evolución va de julio de 2026 a enero de 2027', () => {
    const hoy = hoyEnElEstudio(new Date('2027-01-15T15:00:00Z'))
    expect(rangoDelDashboard(hoy)).toEqual({ desde: '2026-07-01', hasta: '2027-01-31' })
  })

  it('el mes en curso termina en su último día real', () => {
    expect(rangoDelDashboard('2027-02-10').hasta).toBe('2027-02-28')
    expect(rangoDelDashboard('2028-02-10').hasta).toBe('2028-02-29')
  })

  it('restar meses desde un 31 cae en el último día del mes corto', () => {
    expect(rangoDelPreset('3m', '2026-05-31').desde).toBe('2026-02-28')
  })
})

describe('dispositivo en otra zona', () => {
  enZona('Europe/Madrid')

  it('a las 20:00 del 29 de octubre en Chile (ya 30 en Madrid), 30 días va del 29-09 al 29-10', () => {
    const instante = new Date('2026-10-29T23:00:00Z')
    expect(instante.getDate()).toBe(30)
    const hoy = hoyEnElEstudio(instante)
    expect(hoy).toBe('2026-10-29')
    expect(rangoDelPreset('30d', hoy)).toEqual({ desde: '2026-09-29', hasta: '2026-10-29' })
  })
})

describe('problemaDelRango', () => {
  it('acepta un rango de un día', () => {
    expect(problemaDelRango({ desde: '2026-10-29', hasta: '2026-10-29' })).toBeNull()
  })

  it('rechaza el rango invertido con el aviso de la pantalla', () => {
    expect(problemaDelRango({ desde: '2026-10-20', hasta: '2026-10-01' })).toBe(
      'La fecha inicial debe ser anterior a la final.',
    )
  })

  it('rechaza un campo vaciado', () => {
    expect(problemaDelRango({ desde: '', hasta: '2026-10-01' })).toBe('Completa las dos fechas.')
  })
})

describe('tasaCancelacion', () => {
  it('es 0 y no NaN sin reservas', () => {
    expect(tasaCancelacion(0, 0)).toBe(0)
  })

  it('4 de 40 es 10%', () => {
    expect(tasaCancelacion(4, 40)).toBe(10)
  })
})

describe('resumirDashboard', () => {
  it('cifras del escenario de la spec: 40 del mes, 10.0%, 4 hoy y 3 por atender', () => {
    const sieteMeses = indicadores({
      clientasRegistradas: 96,
      porMes: [
        { mes: '2026-09', reservas: 12, canceladas: 1 },
        { mes: '2026-10', reservas: 40, canceladas: 4 },
      ],
      porServicio: Array.from({ length: 7 }, (_, i) => ({
        servicioId: String(i + 1),
        nombre: `S${i + 1}`,
        reservas: 10 - i,
      })),
    })
    const delDia = indicadores({
      reservas: 5,
      porEstado: { pendiente: 2, confirmada: 1, completada: 1, cancelada: 1 },
    })

    const resumen = resumirDashboard(sieteMeses, delDia, '2026-10-29')

    expect(resumen.reservasDelMes).toBe(40)
    expect(resumen.tasaCancelacionMes.toFixed(1)).toBe('10.0')
    expect(resumen.reservasHoy).toBe(4)
    expect(resumen.porAtenderHoy).toBe(3)
    expect(resumen.clientasRegistradas).toBe(96)
    expect(resumen.topServicios.map((s) => s.servicioId)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('mes sin reservas: tasa 0.0% y todo en 0', () => {
    const resumen = resumirDashboard(
      indicadores({ porMes: [{ mes: '2026-10', reservas: 0, canceladas: 0 }] }),
      indicadores(),
      '2026-10-29',
    )
    expect(resumen.reservasDelMes).toBe(0)
    expect(resumen.tasaCancelacionMes.toFixed(1)).toBe('0.0')
    expect(resumen.reservasHoy).toBe(0)
    expect(resumen.porAtenderHoy).toBe(0)
  })
})
