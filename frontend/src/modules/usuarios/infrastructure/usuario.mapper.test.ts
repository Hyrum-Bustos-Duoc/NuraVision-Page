import { toUsuario, type PerfilRow } from './usuario.mapper'

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
