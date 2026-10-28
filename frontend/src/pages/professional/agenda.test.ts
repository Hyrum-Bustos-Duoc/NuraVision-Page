import type { ReservaGestion } from '@/modules/admin/domain/reserva-gestion.types'
import type { DayAvailability, Professional } from '@/shared/types'
import { bloquesDelDia, estadoFranja, minutosDeJornada, reservasDeAgenda } from './agenda'

const cerrado: DayAvailability = { enabled: false, start: '10:00', end: '18:00', breaks: [] }
const jornada: DayAvailability = {
  enabled: true,
  start: '10:00',
  end: '14:00',
  breaks: [{ id: 'p1', start: '12:00', end: '13:00', label: 'Almuerzo' }],
}

// 2026-10-28 es miercoles (3); el 29, jueves, no atiende.
const profesional: Professional = {
  id: '1',
  name: 'Daniela',
  role: 'Manicurista',
  experienceYears: 3,
  bio: '',
  serviceIds: [],
  availability: { 0: cerrado, 1: jornada, 2: jornada, 3: jornada, 4: cerrado, 5: jornada, 6: cerrado },
}

let secuencia = 0
function reserva(fecha: string, horaInicio: string, horaFin: string, extra: Partial<ReservaGestion> = {}): ReservaGestion {
  secuencia += 1
  return {
    id: String(secuencia),
    codigo: `NV-${secuencia}`,
    servicioId: '6',
    profesionalId: '1',
    fecha,
    horaInicio,
    horaFin,
    clienteNombre: `Clienta ${secuencia}`,
    clienteEmail: 'c@correo.cl',
    clienteTelefono: null,
    clienteId: null,
    estado: 'confirmada',
    varianteElegida: null,
    abono: 0,
    ...extra,
  }
}

describe('reservasDeAgenda', () => {
  it('quita las canceladas y ordena por fecha y hora ascendente', () => {
    const tarde = reserva('2026-10-28', '15:00', '16:00')
    const manana = reserva('2026-10-28', '10:00', '11:00')
    const ayer = reserva('2026-10-27', '18:00', '19:00')
    const cancelada = reserva('2026-10-28', '11:00', '12:00', { estado: 'cancelada' })
    // El repositorio entrega de la mas reciente a la mas antigua.
    expect(reservasDeAgenda([tarde, cancelada, manana, ayer])).toEqual([ayer, manana, tarde])
  })

  it('lista vacia da lista vacia', () => {
    expect(reservasDeAgenda([])).toEqual([])
  })
})

describe('estadoFranja', () => {
  const iso = '2026-10-28'

  it('una reserva que se solapa con la hora la ocupa, aunque empiece a media hora', () => {
    const r = reserva(iso, '10:30', '11:30')
    expect(estadoFranja(profesional, iso, '10:00', 60, [r])).toEqual({ tipo: 'reservada', reserva: r })
    expect(estadoFranja(profesional, iso, '11:00', 60, [r])).toEqual({ tipo: 'reservada', reserva: r })
  })

  it('el borde final no ocupa la franja siguiente', () => {
    const r = reserva(iso, '10:00', '11:00')
    expect(estadoFranja(profesional, iso, '11:00', 60, [r])).toEqual({ tipo: 'libre' })
  })

  it('una reserva de otro dia no ocupa esta franja', () => {
    const r = reserva('2026-10-27', '10:00', '11:00')
    expect(estadoFranja(profesional, iso, '10:00', 60, [r])).toEqual({ tipo: 'libre' })
  })

  it('sin reservas: pausa, libre o fuera de horario segun la jornada, sin inventar ocupadas', () => {
    expect(estadoFranja(profesional, iso, '09:00', 60, [])).toEqual({ tipo: 'fuera_horario' })
    expect(estadoFranja(profesional, iso, '11:00', 60, [])).toEqual({ tipo: 'libre' })
    expect(estadoFranja(profesional, iso, '12:00', 60, [])).toEqual({ tipo: 'pausa' })
    expect(estadoFranja(profesional, iso, '14:00', 60, [])).toEqual({ tipo: 'fuera_horario' })
  })

  it('una reserva en un dia sin jornada se muestra igual', () => {
    const r = reserva('2026-10-29', '10:00', '11:00')
    expect(estadoFranja(profesional, '2026-10-29', '10:00', 60, [r]).tipo).toBe('reservada')
    expect(estadoFranja(profesional, '2026-10-29', '11:00', 60, [r]).tipo).toBe('fuera_horario')
  })
})

describe('bloquesDelDia', () => {
  const iso = '2026-10-28'

  it('sin reservas: la jornada partida por la pausa', () => {
    expect(bloquesDelDia(profesional, iso, [])).toEqual([
      { inicio: '10:00', fin: '12:00', minutos: 120, tipo: 'libre', etiqueta: 'libre' },
      { inicio: '12:00', fin: '13:00', minutos: 60, tipo: 'pausa', etiqueta: 'Almuerzo' },
      { inicio: '13:00', fin: '14:00', minutos: 60, tipo: 'libre', etiqueta: 'libre' },
    ])
  })

  it('una reserva corta el tramo libre en dos', () => {
    const r = reserva(iso, '10:30', '11:00')
    expect(bloquesDelDia(profesional, iso, [r]).filter((b) => b.tipo === 'libre')).toEqual([
      { inicio: '10:00', fin: '10:30', minutos: 30, tipo: 'libre', etiqueta: 'libre' },
      { inicio: '11:00', fin: '12:00', minutos: 60, tipo: 'libre', etiqueta: 'libre' },
      { inicio: '13:00', fin: '14:00', minutos: 60, tipo: 'libre', etiqueta: 'libre' },
    ])
  })

  it('un dia sin jornada no tiene bloques', () => {
    expect(bloquesDelDia(profesional, '2026-10-29', [])).toEqual([])
  })
})

describe('minutosDeJornada', () => {
  it('descuenta las pausas y es 0 el dia que no se atiende', () => {
    expect(minutosDeJornada(profesional, '2026-10-28')).toBe(180)
    expect(minutosDeJornada(profesional, '2026-10-29')).toBe(0)
  })
})

describe('agenda: casos de borde (QA NURA-115)', () => {
  const iso = '2026-10-28'

  it('reservasDeAgenda conserva pendiente, confirmada y completada', () => {
    const estados = ['pendiente', 'confirmada', 'completada'] as const
    const reservas = estados.map((estado, i) => reserva(iso, `1${i}:00`, `1${i}:30`, { estado }))
    expect(reservasDeAgenda(reservas).map((r) => r.estado)).toEqual([...estados])
  })

  it('una reserva que cruza el cierre ocupa la franja fuera de jornada y no deja bloque libre al final', () => {
    // Jornada 10:00-14:00: la reserva de 13:30 a 14:30 se come el ultimo tramo.
    const r = reserva(iso, '13:30', '14:30')
    expect(estadoFranja(profesional, iso, '14:00', 60, [r])).toEqual({ tipo: 'reservada', reserva: r })
    const libres = bloquesDelDia(profesional, iso, [r]).filter((b) => b.tipo === 'libre')
    expect(libres.at(-1)).toEqual({ inicio: '13:00', fin: '13:30', minutos: 30, tipo: 'libre', etiqueta: 'libre' })
  })

  it('una reserva fuera de la jornada no altera los bloques del dia', () => {
    const r = reserva(iso, '08:00', '09:00')
    expect(bloquesDelDia(profesional, iso, [r])).toEqual(bloquesDelDia(profesional, iso, []))
  })

  it('las reservas de otro dia no quitan bloques', () => {
    const r = reserva('2026-10-27', '10:00', '14:00')
    expect(bloquesDelDia(profesional, iso, [r])).toEqual(bloquesDelDia(profesional, iso, []))
  })
})
