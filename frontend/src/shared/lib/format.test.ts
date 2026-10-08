import { fechaLocalDeInstante, formatDiaMes } from './format'

describe('fechaLocalDeInstante en America/Santiago', () => {
  const zonaPrevia = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/Santiago'
  })
  afterAll(() => {
    process.env.TZ = zonaPrevia
  })

  it('a las 22:30 del 8 de octubre en Chile (01:30 del 9 en UTC) es el 8', () => {
    expect(fechaLocalDeInstante('2026-10-09T01:30:00Z')).toBe('2026-10-08')
    expect(fechaLocalDeInstante('2026-10-09T01:30:00+00:00')).toBe('2026-10-08')
  })

  it('a mediodia coincide con la fecha UTC', () => {
    expect(fechaLocalDeInstante('2026-10-08T15:00:00.123456+00:00')).toBe('2026-10-08')
  })

  it('cruza el fin de año sin correrse', () => {
    expect(fechaLocalDeInstante('2027-01-01T02:00:00Z')).toBe('2026-12-31')
  })
})

it('formatDiaMes da dia y mes sin año', () => {
  expect(formatDiaMes('1990-01-01')).toBe('1 de enero')
})
