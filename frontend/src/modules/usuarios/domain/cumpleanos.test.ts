import { hoyISO } from '@/shared/lib/calendario'
import { formatDiaMes } from '@/shared/lib/format'
import { diasHastaCumpleanos, etiquetaDiasRestantes, proximosCumpleanos } from './cumpleanos'

const cuenta = (id: string, fechaNacimiento: string | null) => ({ id, fechaNacimiento })
const ids = (lista: { cuenta: { id: string } }[]) => lista.map((x) => x.cuenta.id)

describe('proximosCumpleanos (escenarios de la spec)', () => {
  it('ordena por dias restantes con «Hoy», «Mañana», «en 12 días» y «en 30 días»', () => {
    const lista = proximosCumpleanos(
      [cuenta('nov', '1990-11-07'), cuenta('hoy', '1985-10-08'), cuenta('20', '2000-10-20'), cuenta('man', '1999-10-09')],
      '2026-10-08',
    )
    expect(ids(lista)).toEqual(['hoy', 'man', '20', 'nov'])
    expect(lista.map((x) => etiquetaDiasRestantes(x.dias))).toEqual(['Hoy', 'Mañana', 'en 12 días', 'en 30 días'])
  })

  it('deja fuera el dia 31 de la ventana y el cumpleaños recien pasado', () => {
    expect(diasHastaCumpleanos('1990-11-08', '2026-10-08')).toBe(31)
    expect(diasHastaCumpleanos('1990-10-07', '2026-10-08')).toBe(364)
    expect(proximosCumpleanos([cuenta('a', '1990-11-08'), cuenta('b', '1990-10-07')], '2026-10-08')).toEqual([])
  })

  it('cruza el cambio de año', () => {
    expect(diasHastaCumpleanos('1990-01-05', '2026-12-20')).toBe(16)
  })

  it('29 de febrero: el 28 en años no bisiestos y el 29 en los bisiestos', () => {
    expect(diasHastaCumpleanos('2000-02-29', '2027-02-27')).toBe(1)
    expect(diasHastaCumpleanos('2000-02-29', '2027-02-28')).toBe(0)
    expect(diasHastaCumpleanos('2000-02-29', '2028-02-28')).toBe(1)
    expect(proximosCumpleanos([cuenta('a', '2000-02-29')], '2027-03-01')).toEqual([])
    // Se muestra la fecha declarada, aunque se cuente desde el 28.
    expect(formatDiaMes('2000-02-29')).toBe('29 de febrero')
  })

  it('cuenta dias de calendario a traves del cambio de horario de septiembre', () => {
    expect(diasHastaCumpleanos('1990-09-15', '2026-09-01')).toBe(14)
  })

  it('excluye las cuentas sin fecha', () => {
    expect(proximosCumpleanos([cuenta('a', null), cuenta('b', '1990-10-08')], '2026-10-08').map((x) => x.cuenta.id)).toEqual(['b'])
  })
})

describe('en America/Santiago', () => {
  const zonaPrevia = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/Santiago'
  })
  afterAll(() => {
    process.env.TZ = zonaPrevia
  })

  it('a las 22:30 del 8 de octubre (ya 9 en UTC) el cumpleaños del 8 es «Hoy»', () => {
    const ahora = new Date('2026-10-09T01:30:00Z')
    expect(ahora.getHours()).toBe(22)
    const hoy = hoyISO(ahora)
    expect(hoy).toBe('2026-10-08')
    const [primera] = proximosCumpleanos([cuenta('a', '1990-10-08')], hoy)
    expect(etiquetaDiasRestantes(primera.dias)).toBe('Hoy')
  })

  it('el dia del cambio de horario no corre la cuenta', () => {
    // 2026-09-06: Chile adelanta la hora (ese dia dura 23 horas).
    expect(diasHastaCumpleanos('1990-09-15', '2026-09-01')).toBe(14)
    expect(diasHastaCumpleanos('1990-09-07', '2026-09-05')).toBe(2)
  })

  it('muestra la fecha guardada sin desplazarla', () => {
    expect(formatDiaMes('1990-03-04')).toBe('4 de marzo')
  })
})
