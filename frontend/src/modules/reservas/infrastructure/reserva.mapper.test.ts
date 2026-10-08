import { toReserva, toReservaInsert, type ReservaRow } from './reserva.mapper'

function fila(cambios: Partial<ReservaRow> = {}): ReservaRow {
  return {
    id: 1,
    servicio_id: 7,
    profesional_id: 3,
    cliente_id: null,
    fecha: '2026-10-20',
    hora_inicio: '10:00:00',
    hora_fin: '11:00:00',
    cliente_nombre: 'Ana',
    cliente_email: 'ana@correo.cl',
    cliente_telefono: null,
    codigo: 'NV-2010-1234',
    estado: 'pendiente',
    detalles_extra: null,
    abono: 5000,
    ...cambios,
  }
}

describe('toReserva: abono', () => {
  it('lee el abono que fijo la base', () => {
    expect(toReserva(fila()).abono).toBe(5000)
  })

  it('una reserva sin abono queda en 0', () => {
    expect(toReserva(fila({ abono: 0 })).abono).toBe(0)
  })

  it('trata como 0 una base sin la columna (0015 sin aplicar)', () => {
    const { abono: _omitida, ...sinColumna } = fila()
    // El cast es lo que se prueba: el tipo dice que la columna existe y la base
    // sin migrar no la envia.
    expect(toReserva(sinColumna as ReservaRow).abono).toBe(0)
  })
})

describe('toReservaInsert', () => {
  it('no envia abono: lo fija el trigger de la base', () => {
    const insert = toReservaInsert({
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
    })
    expect(insert).not.toHaveProperty('abono')
  })
})
