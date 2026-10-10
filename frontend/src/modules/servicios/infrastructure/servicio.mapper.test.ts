import { fromDatosServicio, toServicio, type ServicioRow } from './servicio.mapper'

function fila(cambios: Partial<ServicioRow> = {}): ServicioRow {
  return {
    id: 7,
    nombre: 'Manicura Completa',
    categoria: 'Uñas',
    descripcion: null,
    duracion_minutos: 60,
    precio_base: 18000,
    activo: true,
    imagen_url: null,
    descripcion_larga: null,
    incluye: [],
    variantes: null,
    abono: 5000,
    ...cambios,
  }
}

describe('toServicio: abono', () => {
  it('lee el abono de la fila', () => {
    expect(toServicio(fila()).abono).toBe(5000)
  })

  it('trata como 0 una base sin la columna (0015 sin aplicar)', () => {
    const { abono: _omitida, ...sinColumna } = fila()
    // El cast es lo que se quiere probar: el tipo dice que la columna existe y
    // la base sin migrar no la envia.
    expect(toServicio(sinColumna as ServicioRow).abono).toBe(0)
  })
})

describe('fromDatosServicio: abono', () => {
  it('envia el abono tal cual', () => {
    const servicio = toServicio(fila({ abono: 6000 }))
    expect(fromDatosServicio(servicio).abono).toBe(6000)
  })
})
