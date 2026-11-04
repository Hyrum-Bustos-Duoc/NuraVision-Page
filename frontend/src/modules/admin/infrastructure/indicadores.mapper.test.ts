import { toIndicadores, type IndicadoresRow } from './indicadores.mapper'

const FILA: IndicadoresRow = {
  desde: '2026-04-01',
  hasta: '2026-10-31',
  reservas: 214,
  por_estado: { pendiente: 12, confirmada: 30, completada: 150, cancelada: 22 },
  ingresos_estimados: 4820000,
  clientas_distintas: 131,
  clientas_registradas: 96,
  por_mes: [
    { mes: '2026-04', reservas: 25, canceladas: 3 },
    { mes: '2026-05', reservas: 0, canceladas: 0 },
  ],
  por_servicio: [{ servicio_id: 3, nombre: 'Manicure semipermanente', reservas: 61 }],
  por_profesional: [{ profesional_id: 2, nombre: 'Berenice', reservas: 80 }],
}

describe('toIndicadores', () => {
  it('traduce el objeto del contrato de design.md y pasa los ids a texto', () => {
    expect(toIndicadores(FILA)).toEqual({
      desde: '2026-04-01',
      hasta: '2026-10-31',
      reservas: 214,
      porEstado: { pendiente: 12, confirmada: 30, completada: 150, cancelada: 22 },
      ingresosEstimados: 4820000,
      clientasDistintas: 131,
      clientasRegistradas: 96,
      porMes: [
        { mes: '2026-04', reservas: 25, canceladas: 3 },
        { mes: '2026-05', reservas: 0, canceladas: 0 },
      ],
      porServicio: [{ servicioId: '3', nombre: 'Manicure semipermanente', reservas: 61 }],
      porProfesional: [{ profesionalId: '2', nombre: 'Berenice', reservas: 80 }],
    })
  })

  it('rango vacío: listas vacías y ceros tal cual', () => {
    const vacio = toIndicadores({
      ...FILA,
      reservas: 0,
      por_estado: { pendiente: 0, confirmada: 0, completada: 0, cancelada: 0 },
      ingresos_estimados: 0,
      clientas_distintas: 0,
      por_servicio: [],
      por_profesional: [],
    })
    expect(vacio.porServicio).toEqual([])
    expect(vacio.porProfesional).toEqual([])
    expect(vacio.reservas).toBe(0)
  })
})
