import type { NuevaReserva } from '../domain/reserva.types'
import { SupabaseReservaRepository } from './supabase-reserva.repository'

const insert = vi.fn()

vi.mock('@/shared/infrastructure/supabase/client', () => ({
  supabase: { from: () => ({ insert: (fila: unknown) => insert(fila) }) },
}))

const NUEVA: NuevaReserva = {
  servicioId: '7',
  profesionalId: '3',
  fecha: '2026-10-20',
  horaInicio: '10:00',
  horaFin: '11:00',
  clienteNombre: 'Ana',
  clienteEmail: 'ana@correo.cl',
  clienteTelefono: '',
  codigo: 'NV-2010-1234',
  clienteId: null,
  varianteElegida: null,
}

describe('SupabaseReservaRepository.crear', () => {
  beforeEach(() => insert.mockReset())

  // La base rechaza con un `raise exception` (P0001) una reserva cuya opcion de
  // variante falta o no existe. Ese texto es para la clienta: no se envuelve.
  it('muestra tal cual el mensaje de un rechazo P0001 de la base', async () => {
    insert.mockResolvedValue({
      error: { code: 'P0001', message: 'Elige una opción válida para este servicio.' },
    })
    await expect(new SupabaseReservaRepository().crear(NUEVA)).rejects.toThrow(
      /^Elige una opción válida para este servicio\.$/,
    )
  })

  it('cualquier otro error conserva el prefijo generico', async () => {
    insert.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } })
    await expect(new SupabaseReservaRepository().crear(NUEVA)).rejects.toThrow(
      'No se pudo guardar la reserva: boom',
    )
  })
})
