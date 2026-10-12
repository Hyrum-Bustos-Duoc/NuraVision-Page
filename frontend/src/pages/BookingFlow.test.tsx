// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Servicio } from '@/modules/servicios/domain/servicio.types'
import type { DayAvailability, WeeklyAvailability } from '@/shared/types'
import BookingFlow from './BookingFlow'

/**
 * El paso de confirmacion y el de abono con la pasarela simulada.
 *
 * Se simulan los hooks que leen la base y el de Webpay: lo que se prueba es que
 * camino toma la pagina segun el abono del servicio, no la red.
 */

const crear = vi.fn<(nueva: { codigo: string }, opciones?: { conCorreo?: boolean }) => Promise<boolean>>()
const avisar = vi.fn<(codigo: string) => void>()
const pagar = vi.fn<(destino: { tipo: string; codigo: string }) => Promise<boolean>>()
const addBooking = vi.fn()
let servicio: Servicio
let errorDeWebpay: string | null = null

vi.mock('@/shared/infrastructure/supabase/client', () => ({ supabase: {} }))
vi.mock('@/shared/components/ScrollToTop', () => ({ useScrollToTopOnChange: () => {} }))
vi.mock('@/shared/state/AppState', () => ({
  useAppState: () => ({
    currentUser: null,
    bookingDraft: {
      serviceId: servicio.id,
      professionalId: '3',
      dateISO: '2026-10-20',
      time: '10:00',
    },
    setBookingDraft: vi.fn(),
    addBooking,
    bookings: [],
  }),
}))
vi.mock('@/modules/auth/ui/useAuth', () => ({
  useAuth: () => ({
    usuario: { id: 'u1', nombre: 'Ana Pérez', email: 'ana@correo.cl', telefono: '+56911112222' },
  }),
}))
vi.mock('@/modules/servicios/ui/useServicioDetalle', () => ({
  useServicioDetalle: () => ({ estado: 'listo', servicio }),
}))
vi.mock('@/modules/servicios/ui/useServicios', () => ({
  useServicios: () => ({ servicios: [], cargando: false, error: null }),
}))
vi.mock('@/modules/profesionales/ui/useProfesionalesPorServicio', () => ({
  useProfesionalesPorServicio: () => ({
    profesionales: [
      {
        id: '3',
        nombre: 'Camila Reyes',
        especialidad: 'Manicurista',
        avatarUrl: null,
        activo: true,
        experienciaAnios: 5,
        biografia: null,
        categoria: null,
      },
    ],
    cargando: false,
    error: null,
  }),
}))

const dia: DayAvailability = { enabled: true, start: '09:00', end: '18:00', breaks: [] }
const HORARIO: WeeklyAvailability = { 0: dia, 1: dia, 2: dia, 3: dia, 4: dia, 5: dia, 6: dia }
vi.mock('@/modules/profesionales/ui/useDisponibilidad', () => ({
  useDisponibilidad: () => ({
    bloques: [],
    horario: HORARIO,
    sinHorario: false,
    cargando: false,
    error: null,
  }),
}))
vi.mock('@/modules/reservas/ui/useCrearReserva', () => ({
  useCrearReserva: () => ({
    crear,
    avisar,
    guardando: false,
    error: null,
    correoEnviado: null,
    limpiarError: () => {},
  }),
}))
vi.mock('@/modules/pagos/ui/usePagoWebpay', () => ({
  usePagoWebpay: () => ({ pagar, enviando: false, error: errorDeWebpay, yaPagado: false }),
}))

function servicioCon(abono: number): Servicio {
  return {
    id: '7',
    nombre: abono > 0 ? 'Manicura Completa' : 'Corte de Pelo',
    categoria: abono > 0 ? 'unas' : 'cabello',
    descripcion: '',
    duracionMinutos: 60,
    precioBase: 18000,
    activo: true,
    imagenUrl: null,
    descripcionLarga: '',
    incluye: [],
    variantes: null,
    abono,
  }
}

function pintar() {
  render(
    <MemoryRouter>
      <BookingFlow />
    </MemoryRouter>,
  )
}

describe('BookingFlow: como se paga', () => {
  beforeEach(() => {
    crear.mockReset().mockResolvedValue(true)
    pagar.mockReset().mockResolvedValue(true)
    addBooking.mockReset()
    avisar.mockReset()
    errorDeWebpay = null
  })

  describe('servicio con abono', () => {
    beforeEach(() => {
      servicio = servicioCon(5000)
    })

    it('no ofrece pagar en el estudio en la confirmacion', () => {
      pintar()
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
      expect(screen.queryByText('Pagar en el estudio')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continuar al abono' })).toBeInTheDocument()
    })

    it('continuar no crea nada; pagar el abono crea la reserva y abre Webpay con su codigo', async () => {
      const usuario = userEvent.setup()
      pintar()
      await usuario.click(screen.getByRole('button', { name: 'Continuar al abono' }))
      expect(crear).not.toHaveBeenCalled()

      expect(screen.getByText('Abono hoy con Webpay').nextSibling).toHaveTextContent('$5.000')
      expect(screen.getByText('Saldo a pagar en el local').nextSibling).toHaveTextContent(
        '$13.000',
      )

      await usuario.click(screen.getByRole('button', { name: 'Pagar abono con Webpay' }))
      expect(crear).toHaveBeenCalledTimes(1)
      const { codigo } = crear.mock.calls[0][0]
      // Solo viaja el codigo: el monto lo decide el servidor.
      expect(pagar).toHaveBeenCalledWith({ tipo: 'reserva', codigo })
      // Sin pantalla de exito local: el resultado lo da /confirmacion-pago.
      expect(addBooking).not.toHaveBeenCalled()
    })

    it('si la base rechaza la reserva no abre Webpay', async () => {
      crear.mockResolvedValue(false)
      const usuario = userEvent.setup()
      pintar()
      await usuario.click(screen.getByRole('button', { name: 'Continuar al abono' }))
      await usuario.click(screen.getByRole('button', { name: 'Pagar abono con Webpay' }))
      expect(pagar).not.toHaveBeenCalled()
    })
  })

  describe('servicio sin abono', () => {
    beforeEach(() => {
      servicio = servicioCon(0)
    })

    it('ofrece elegir, con pagar en el estudio por defecto', () => {
      pintar()
      expect(screen.getByRole('radio', { name: /Pagar en el estudio/ })).toBeChecked()
      expect(screen.getByRole('radio', { name: /Pagar ahora con Webpay/ })).not.toBeChecked()
      expect(screen.queryByText('Abono')).not.toBeInTheDocument()
    })

    it('pagar en el estudio crea la reserva sin pasar por Webpay', async () => {
      const usuario = userEvent.setup()
      pintar()
      await usuario.click(screen.getByRole('button', { name: 'Confirmar reserva' }))
      expect(crear).toHaveBeenCalledTimes(1)
      expect(pagar).not.toHaveBeenCalled()
      expect(addBooking).toHaveBeenCalledTimes(1)
      expect(await screen.findByText('Tu reserva está confirmada')).toBeInTheDocument()
    })

    it('pagar ahora crea la reserva y abre Webpay por el total', async () => {
      const usuario = userEvent.setup()
      pintar()
      await usuario.click(screen.getByRole('radio', { name: /Pagar ahora con Webpay/ }))
      await usuario.click(screen.getByRole('button', { name: 'Pagar $18.000 con Webpay' }))
      expect(crear).toHaveBeenCalledTimes(1)
      expect(pagar).toHaveBeenCalledWith({ tipo: 'reserva', codigo: crear.mock.calls[0][0].codigo })
      expect(addBooking).not.toHaveBeenCalled()
    })

    it('si Webpay no abre, reintentar y luego pagar en el estudio reutilizan la misma reserva', async () => {
      pagar.mockResolvedValue(false)
      errorDeWebpay = 'La pasarela no respondió.'
      const usuario = userEvent.setup()
      pintar()
      await usuario.click(screen.getByRole('radio', { name: /Pagar ahora con Webpay/ }))
      await usuario.click(screen.getByRole('button', { name: 'Pagar $18.000 con Webpay' }))
      expect(await screen.findByText(/Tu hora quedó reservada/)).toBeInTheDocument()

      await usuario.click(screen.getByRole('button', { name: 'Pagar $18.000 con Webpay' }))
      expect(pagar).toHaveBeenCalledTimes(2)

      await usuario.click(screen.getByRole('radio', { name: /Pagar en el estudio/ }))
      await usuario.click(screen.getByRole('button', { name: 'Confirmar reserva' }))
      expect(crear).toHaveBeenCalledTimes(1)
      expect(addBooking).toHaveBeenCalledWith(
        expect.objectContaining({ code: crear.mock.calls[0][0].codigo, abono: 0 }),
      )
      // Camino a Webpay se guardo sin correo; al quedarse en el estudio se avisa una vez.
      expect(crear.mock.calls[0][1]).toEqual({ conCorreo: false })
      expect(avisar).toHaveBeenCalledTimes(1)
      expect(avisar).toHaveBeenCalledWith(crear.mock.calls[0][0].codigo)
    })
  })
})
