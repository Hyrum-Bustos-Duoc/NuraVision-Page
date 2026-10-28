import { largoEnCaracteres, MENSAJE_PERFIL, normalizarTelefono, validarPerfilPropio } from './usuario.reglas'

describe('normalizarTelefono (ejemplos de design.md)', () => {
  it.each([
    ['9 1234 5678', '+56912345678'],
    ['+56 9 1234-5678', '+56912345678'],
    ['56912345678', '+56912345678'],
    ['(2) 2345 6789', '+56223456789'],
  ])('%s es valido y queda %s', (escrito, canonico) => {
    expect(normalizarTelefono(escrito)).toBe(canonico)
  })

  it.each(['12345678', '+54 9 1234 5678', '091234567', '9123456789'])('%s es invalido', (escrito) => {
    expect(normalizarTelefono(escrito)).toBeNull()
  })

  it('campo vacio o solo separadores es "sin telefono"', () => {
    expect(normalizarTelefono('')).toBe('')
    expect(normalizarTelefono('  ')).toBe('')
  })

  it('el canonico ya guardado se mantiene', () => {
    expect(normalizarTelefono('+56987654321')).toBe('+56987654321')
  })
})

const HOY = '2026-10-28'
const valido = { nombre: 'Ana Pérez', telefono: '9 1234 5678', fechaNacimiento: '1990-03-04' }

describe('validarPerfilPropio', () => {
  it('normaliza: recorta el nombre y deja el telefono canonico', () => {
    expect(validarPerfilPropio({ ...valido, nombre: '  Ana Pérez  ' }, HOY)).toEqual({
      ok: true,
      datos: { nombre: 'Ana Pérez', telefono: '+56912345678', fechaNacimiento: '1990-03-04' },
    })
  })

  it('acepta telefono y cumpleaños vacios', () => {
    expect(validarPerfilPropio({ ...valido, telefono: '', fechaNacimiento: null }, HOY)).toEqual({
      ok: true,
      datos: { nombre: 'Ana Pérez', telefono: '', fechaNacimiento: null },
    })
  })

  it('nombre vacio o de espacios: «Necesitamos tu nombre.»', () => {
    for (const nombre of ['', '   ']) {
      expect(validarPerfilPropio({ ...valido, nombre }, HOY)).toEqual({
        ok: false,
        errores: { nombre: MENSAJE_PERFIL.nombreVacio },
      })
    }
  })

  it('120 emojis se aceptan (puntos de codigo, como char_length); 121 no', () => {
    const emojis120 = '💅'.repeat(120)
    expect(emojis120.length).toBe(240)
    expect(largoEnCaracteres(emojis120)).toBe(120)
    expect(validarPerfilPropio({ ...valido, nombre: emojis120 }, HOY).ok).toBe(true)
    expect(validarPerfilPropio({ ...valido, nombre: 'a'.repeat(120) }, HOY).ok).toBe(true)
    expect(validarPerfilPropio({ ...valido, nombre: 'a'.repeat(121) }, HOY)).toEqual({
      ok: false,
      errores: { nombre: 'El nombre admite hasta 120 caracteres.' },
    })
  })

  it('cumpleaños: 1920-01-01 y hoy si; 1919-12-31, mañana y una fecha que no existe no', () => {
    for (const fecha of ['1920-01-01', HOY]) {
      expect(validarPerfilPropio({ ...valido, fechaNacimiento: fecha }, HOY).ok).toBe(true)
    }
    for (const fecha of ['1919-12-31', '2026-10-29', '1990-02-30']) {
      expect(validarPerfilPropio({ ...valido, fechaNacimiento: fecha }, HOY)).toEqual({
        ok: false,
        errores: { fechaNacimiento: 'La fecha de nacimiento no es válida.' },
      })
    }
  })

  it('reporta todos los campos invalidos a la vez', () => {
    expect(validarPerfilPropio({ nombre: '', telefono: '123', fechaNacimiento: '1900-01-01' }, HOY)).toEqual({
      ok: false,
      errores: {
        nombre: 'Necesitamos tu nombre.',
        telefono: 'El teléfono debe ser un número chileno de 9 dígitos.',
        fechaNacimiento: 'La fecha de nacimiento no es válida.',
      },
    })
  })
})
