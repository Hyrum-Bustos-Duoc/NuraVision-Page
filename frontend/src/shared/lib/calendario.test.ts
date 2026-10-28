import {
  diasEntre,
  esFechaISO,
  fechaDesdePartes,
  fechaLegible,
  hoyEnElEstudio,
  hoyISO,
  inicioDeSemana,
  limitarFecha,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from './calendario'

describe('semanasDelMes', () => {
  it('empieza la semana en lunes: octubre de 2026 arranca un jueves', () => {
    const [primera] = semanasDelMes(2026, 9)
    expect(primera.slice(0, 3)).toEqual([null, null, null])
    expect(primera[3]).toEqual({ iso: '2026-10-01', dia: 1 })
    expect(primera[6]).toEqual({ iso: '2026-10-04', dia: 4 })
  })

  it('un mes que empieza en domingo deja seis huecos delante', () => {
    // 1 de febrero de 2026 es domingo.
    const [primera] = semanasDelMes(2026, 1)
    expect(primera.filter((c) => c === null)).toHaveLength(6)
    expect(primera[6]?.iso).toBe('2026-02-01')
  })

  it('un mes que empieza en lunes no deja huecos delante', () => {
    // 1 de febrero de 2021 es lunes.
    expect(semanasDelMes(2021, 1)[0][0]?.iso).toBe('2021-02-01')
  })

  it('siempre devuelve seis semanas de siete dias, con todos los dias del mes', () => {
    for (const [anio, mes, dias] of [
      [2021, 1, 28],
      [2024, 1, 29],
      [2026, 7, 31],
      [1990, 3, 30],
    ]) {
      const semanas = semanasDelMes(anio, mes)
      expect(semanas).toHaveLength(6)
      semanas.forEach((s) => expect(s).toHaveLength(7))
      expect(semanas.flat().filter((c) => c !== null)).toHaveLength(dias)
    }
  })
})

describe('formato ISO sin desfase de zona', () => {
  it('construye la fecha con ceros a la izquierda y sin hora', () => {
    expect(fechaDesdePartes(1990, 2, 4)).toBe('1990-03-04')
  })

  it('hoy usa la fecha local, no la UTC', () => {
    // 23:30 del 8 de octubre en hora local: en UTC ya podria ser el dia 9.
    expect(hoyISO(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08')
    expect(hoyISO(new Date(2026, 9, 8, 0, 5))).toBe('2026-10-08')
  })

  it('ida y vuelta por todos los dias de un año bisiesto no corre ninguna fecha', () => {
    let iso = '2024-01-01'
    for (let i = 0; i < 366; i++) {
      expect(esFechaISO(iso)).toBe(true)
      iso = sumarDias(iso, 1)
    }
    expect(iso).toBe('2025-01-01')
  })

  it('valida que la fecha exista', () => {
    expect(esFechaISO('1990-02-28')).toBe(true)
    expect(esFechaISO('2024-02-29')).toBe(true)
    expect(esFechaISO('2023-02-29')).toBe(false)
    expect(esFechaISO('1990-13-01')).toBe(false)
    expect(esFechaISO('1990-3-4')).toBe(false)
    expect(esFechaISO('1990-03-04T00:00:00Z')).toBe(false)
    expect(esFechaISO('')).toBe(false)
  })
})

describe('navegacion', () => {
  it('cambiar de mes se queda en el ultimo dia si el dia no existe', () => {
    expect(sumarMeses('2026-03-31', -1)).toBe('2026-02-28')
    expect(sumarMeses('2024-01-31', 1)).toBe('2024-02-29')
    expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-15')
    expect(sumarMeses('2026-01-15', -1)).toBe('2025-12-15')
    expect(sumarMeses('2024-02-29', 12)).toBe('2025-02-28')
  })

  it('el inicio de semana es el lunes', () => {
    expect(inicioDeSemana('2026-10-08')).toBe('2026-10-05')
    expect(inicioDeSemana('2026-10-05')).toBe('2026-10-05')
    expect(inicioDeSemana('2026-10-11')).toBe('2026-10-05')
  })
})

describe('limitarFecha', () => {
  const min = '1920-01-01'
  const hoy = '2026-10-08'

  it('no permite fechas futuras', () => {
    expect(limitarFecha('2026-10-09', min, hoy)).toBe(hoy)
    expect(limitarFecha(sumarMeses(hoy, 1), min, hoy)).toBe(hoy)
  })

  it('no baja del minimo', () => {
    expect(limitarFecha('1919-12-31', min, hoy)).toBe(min)
  })

  it('deja pasar lo que esta dentro, incluidos los extremos', () => {
    expect(limitarFecha('1990-03-04', min, hoy)).toBe('1990-03-04')
    expect(limitarFecha(hoy, min, hoy)).toBe(hoy)
    expect(limitarFecha(min, min, hoy)).toBe(min)
  })
})

it('fechaLegible da el dia de la semana y el año en español', () => {
  expect(fechaLegible('2026-10-08')).toBe('jueves 8 de octubre de 2026')
  expect(fechaLegible('1990-03-04')).toBe('domingo 4 de marzo de 1990')
})

describe('diasEntre', () => {
  it('cuenta dias de calendario, incluido el cambio de horario y el de año', () => {
    expect(diasEntre('2026-10-08', '2026-10-08')).toBe(0)
    expect(diasEntre('2026-09-01', '2026-09-15')).toBe(14)
    expect(diasEntre('2026-12-20', '2027-01-05')).toBe(16)
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2)
    expect(diasEntre('2026-10-08', '2026-10-07')).toBe(-1)
  })
})

describe('hoyEnElEstudio', () => {
  it('usa el calendario de Chile, no el UTC: 22:30 del 8 de octubre ya es 9 en UTC', () => {
    expect(hoyEnElEstudio(new Date('2026-10-09T01:30:00Z'))).toBe('2026-10-08')
  })

  it('cambia de dia a medianoche de Chile y no a la de UTC', () => {
    // Octubre es horario de verano (UTC-3): la medianoche cae a las 03:00 UTC.
    expect(hoyEnElEstudio(new Date('2026-10-09T02:59:00Z'))).toBe('2026-10-08')
    expect(hoyEnElEstudio(new Date('2026-10-09T03:00:00Z'))).toBe('2026-10-09')
    // Junio es horario de invierno (UTC-4): la medianoche cae a las 04:00 UTC.
    expect(hoyEnElEstudio(new Date('2026-06-15T03:59:00Z'))).toBe('2026-06-14')
    expect(hoyEnElEstudio(new Date('2026-06-15T04:00:00Z'))).toBe('2026-06-15')
  })

  it('devuelve un texto que esFechaISO acepta', () => {
    expect(esFechaISO(hoyEnElEstudio(new Date('2027-01-01T12:00:00Z')))).toBe(true)
  })
})
