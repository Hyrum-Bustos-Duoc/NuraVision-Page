import { describe, expect, it } from 'vitest'
import {
  LARGO_MINIMO_PASSWORD,
  motivoParaNoCambiarPassword,
  motivoParaNoUsarEmail,
} from './password.reglas'

describe('motivoParaNoUsarEmail', () => {
  it('acepta un correo normal', () => {
    expect(motivoParaNoUsarEmail('ana@correo.cl')).toBeNull()
  })

  it('tolera espacios alrededor', () => {
    expect(motivoParaNoUsarEmail('  ana@correo.cl  ')).toBeNull()
  })

  it('pide el correo cuando esta vacio', () => {
    expect(motivoParaNoUsarEmail('')).toBe('Escribe tu correo electrónico.')
    expect(motivoParaNoUsarEmail('   ')).toBe('Escribe tu correo electrónico.')
  })

  it('rechaza lo que no tiene forma de correo', () => {
    for (const malo of ['ana', 'ana@', '@correo.cl', 'ana@correo', 'a na@correo.cl']) {
      expect(motivoParaNoUsarEmail(malo)).toBe('El formato del correo no es válido.')
    }
  })
})

describe('motivoParaNoCambiarPassword', () => {
  const buena = 'contrasena-larga'

  it('acepta dos contraseñas iguales y suficientemente largas', () => {
    expect(motivoParaNoCambiarPassword(buena, buena)).toBeNull()
  })

  it('acepta justo el minimo', () => {
    const justa = 'a'.repeat(LARGO_MINIMO_PASSWORD)
    expect(motivoParaNoCambiarPassword(justa, justa)).toBeNull()
  })

  it('rechaza una por debajo del minimo', () => {
    const corta = 'a'.repeat(LARGO_MINIMO_PASSWORD - 1)
    expect(motivoParaNoCambiarPassword(corta, corta)).toBe(
      `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
    )
  })

  it('pide escribirla cuando esta vacia', () => {
    expect(motivoParaNoCambiarPassword('', '')).toBe('Escribe tu nueva contraseña.')
  })

  it('pide la confirmacion cuando falta', () => {
    expect(motivoParaNoCambiarPassword(buena, '')).toBe('Repite la contraseña para confirmarla.')
  })

  it('avisa cuando no coinciden', () => {
    expect(motivoParaNoCambiarPassword(buena, buena + 'x')).toBe(
      'Las dos contraseñas no coinciden.',
    )
  })

  /**
   * El orden importa: quien escribe "123" dos veces tiene DOS problemas, y
   * enterarse de que "coinciden" antes que de que es corta obliga a reintentar
   * para descubrir el verdadero.
   */
  it('juzga primero el largo y despues la coincidencia', () => {
    expect(motivoParaNoCambiarPassword('123', '123')).toBe(
      `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
    )
  })

  // Los espacios son caracteres validos: recortarlos cambiaria la contraseña
  // que la persona cree haber escrito.
  it('no recorta espacios al comparar', () => {
    expect(motivoParaNoCambiarPassword('contrasena ', 'contrasena')).toBe(
      'Las dos contraseñas no coinciden.',
    )
    const conEspacios = '  clave secreta  '
    expect(motivoParaNoCambiarPassword(conEspacios, conEspacios)).toBeNull()
  })
})
