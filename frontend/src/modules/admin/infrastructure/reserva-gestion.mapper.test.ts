import { toReservaGestion, type ReservaRow } from './reserva-gestion.mapper'

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

describe('toReservaGestion: abono', () => {
  it('lee el abono de la fila', () => {
    expect(toReservaGestion(fila()).abono).toBe(5000)
    expect(toReservaGestion(fila({ abono: 0 })).abono).toBe(0)
  })

  it('trata como 0 una base sin la columna (0015 sin aplicar)', () => {
    const { abono: _omitida, ...sinColumna } = fila()
    // El cast es lo que se prueba: la base sin migrar no envia la columna.
    expect(toReservaGestion(sinColumna as ReservaRow).abono).toBe(0)
  })
})
