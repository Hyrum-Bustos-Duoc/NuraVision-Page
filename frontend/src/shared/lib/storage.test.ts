import type { AppData, Booking } from '@/shared/types'
import { loadStoredData } from './storage'

const VACIO: AppData = { users: [], services: [], professionals: [], bookings: [] }

const RESERVA: Booking = {
  id: 'b-1',
  code: 'NV-2010-1234',
  serviceId: '7',
  professionalId: '3',
  clientName: 'Ana',
  dateISO: '2026-10-20',
  time: '10:00',
  durationMin: 60,
  price: 18000,
  abono: 5000,
  status: 'confirmada',
}

afterEach(() => window.localStorage.clear())

describe('loadStoredData: abono de las reservas locales', () => {
  it('conserva el abono guardado', () => {
    window.localStorage.setItem('nuravision:data:v2', JSON.stringify({ bookings: [RESERVA] }))
    expect(loadStoredData(VACIO).bookings[0].abono).toBe(5000)
  })

  it('lee como 0 una reserva guardada antes del campo', () => {
    const { abono: _omitido, ...antigua } = RESERVA
    window.localStorage.setItem('nuravision:data:v2', JSON.stringify({ bookings: [antigua] }))
    expect(loadStoredData(VACIO).bookings[0].abono).toBe(0)
  })
})
