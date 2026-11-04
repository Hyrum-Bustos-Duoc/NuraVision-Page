import { toArgumentosActualizarMiPerfil, toDatosPersonales, toPerfilPropio, toUsuario, type PerfilRow } from './usuario.mapper'

const fila: PerfilRow = {
  id: 'u1',
  nombre: 'Ana Pérez',
  email: 'ana@correo.cl',
  telefono: null,
  rol: 'cliente',
  profesional_id: null,
  creado_en: '2026-10-08T00:00:00Z',
  fecha_nacimiento: '1990-03-04',
}

describe('toUsuario: fecha de nacimiento', () => {
  it('pasa la fecha tal cual llega de PostgREST', () => {
    expect(toUsuario(fila).fechaNacimiento).toBe('1990-03-04')
  })

  it('es null si la columna es null', () => {
    expect(toUsuario({ ...fila, fecha_nacimiento: null }).fechaNacimiento).toBeNull()
  })

  it('es null si la columna no existe (base sin 0016)', () => {
    const sinColumna: PerfilRow = { ...fila }
    Reflect.deleteProperty(sinColumna, 'fecha_nacimiento')
    expect(toUsuario(sinColumna).fechaNacimiento).toBeNull()
  })

  it('descarta un valor con otra forma', () => {
    for (const sucio of ['1990-02-30', '1990-03-04T00:00:00Z', '04-03-1990', '']) {
      expect(toUsuario({ ...fila, fecha_nacimiento: sucio }).fechaNacimiento).toBeNull()
    }
  })
})

describe('toPerfilPropio', () => {
  it('un nombre vacio llega vacio, sin el relleno de los listados', () => {
    expect(toUsuario({ ...fila, nombre: '   ' }).nombre).toBe('Sin nombre')
    expect(toPerfilPropio({ ...fila, nombre: '   ' })).toEqual({
      nombre: '',
      telefono: null,
      fechaNacimiento: '1990-03-04',
    })
  })

  it('recorta el nombre y normaliza el telefono como toUsuario', () => {
    expect(toPerfilPropio({ ...fila, nombre: ' Ana ', telefono: '  ' })).toEqual({
      nombre: 'Ana',
      telefono: null,
      fechaNacimiento: '1990-03-04',
    })
  })
})

describe('toArgumentosActualizarMiPerfil', () => {
  it('devuelve exactamente los tres argumentos de la funcion, sin rol', () => {
    expect(
      toArgumentosActualizarMiPerfil({ nombre: 'Ana', telefono: '+56912345678', fechaNacimiento: '1990-03-04' }),
    ).toStrictEqual({ p_nombre: 'Ana', p_telefono: '+56912345678', p_fecha_nacimiento: '1990-03-04' })
  })
})

describe('toDatosPersonales', () => {
  it("telefono '' es null, como en toUsuario", () => {
    expect(toDatosPersonales({ nombre: 'Ana', telefono: '', fecha_nacimiento: null })).toEqual({
      nombre: 'Ana',
      telefono: null,
      fechaNacimiento: null,
    })
  })

  it('pasa el telefono canonico y la fecha tal cual', () => {
    expect(toDatosPersonales({ nombre: 'Ana', telefono: '+56987654321', fecha_nacimiento: '1990-03-04' })).toEqual({
      nombre: 'Ana',
      telefono: '+56987654321',
      fechaNacimiento: '1990-03-04',
    })
  })
})
