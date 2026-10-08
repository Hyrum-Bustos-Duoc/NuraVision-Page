import {
  erroresDeTarjeta,
  formatearNumeroTarjeta,
  formatearVencimiento,
  type DatosTarjeta,
} from './tarjeta-demo'

// El dia de los escenarios de la spec.
const HOY = new Date(2026, 9, 8)

const VALIDA: DatosTarjeta = {
  titular: 'Ana Pérez',
  numero: '4242 4242 4242 4242',
  vencimiento: '12/27',
  cvv: '123',
}

describe('erroresDeTarjeta', () => {
  it('aprueba una tarjeta bien formada', () => {
    expect(erroresDeTarjeta(VALIDA, HOY)).toEqual({})
  })

  it('acepta el numero sin espacios', () => {
    expect(erroresDeTarjeta({ ...VALIDA, numero: '4242424242424242' }, HOY)).toEqual({})
  })

  it('exige titular', () => {
    expect(erroresDeTarjeta({ ...VALIDA, titular: '   ' }, HOY).titular).toBeDefined()
  })

  it('rechaza un numero de 15 digitos', () => {
    expect(erroresDeTarjeta({ ...VALIDA, numero: '4242 4242 4242 424' }, HOY).numero).toBe(
      'El número de tarjeta debe tener 16 dígitos.',
    )
  })

  it('rechaza un numero con letras', () => {
    expect(erroresDeTarjeta({ ...VALIDA, numero: '4242 4242 4242 424a' }, HOY).numero).toBeDefined()
  })

  it('el 2026-10-08, 09/26 esta vencida', () => {
    expect(erroresDeTarjeta({ ...VALIDA, vencimiento: '09/26' }, HOY).vencimiento).toBe(
      'La tarjeta está vencida.',
    )
  })

  it('el mes en curso todavia es valido', () => {
    expect(erroresDeTarjeta({ ...VALIDA, vencimiento: '10/26' }, HOY)).toEqual({})
  })

  it('un año anterior esta vencido aunque el mes sea mayor', () => {
    expect(erroresDeTarjeta({ ...VALIDA, vencimiento: '12/25' }, HOY).vencimiento).toBe(
      'La tarjeta está vencida.',
    )
  })

  it('rechaza un mes inexistente y el formato incompleto', () => {
    expect(erroresDeTarjeta({ ...VALIDA, vencimiento: '13/27' }, HOY).vencimiento).toMatch(/mes/)
    expect(erroresDeTarjeta({ ...VALIDA, vencimiento: '00/27' }, HOY).vencimiento).toMatch(/mes/)
    expect(erroresDeTarjeta({ ...VALIDA, vencimiento: '1/27' }, HOY).vencimiento).toMatch(/MM\/AA/)
    expect(erroresDeTarjeta({ ...VALIDA, vencimiento: '' }, HOY).vencimiento).toMatch(/MM\/AA/)
  })

  it('exige CVV de exactamente 3 digitos', () => {
    expect(erroresDeTarjeta({ ...VALIDA, cvv: '12' }, HOY).cvv).toBeDefined()
    expect(erroresDeTarjeta({ ...VALIDA, cvv: '1234' }, HOY).cvv).toBeDefined()
    expect(erroresDeTarjeta({ ...VALIDA, cvv: '12a' }, HOY).cvv).toBeDefined()
  })
})

describe('formatearNumeroTarjeta', () => {
  it('agrupa de a cuatro y descarta lo que no es digito', () => {
    expect(formatearNumeroTarjeta('4242424242424242')).toBe('4242 4242 4242 4242')
    expect(formatearNumeroTarjeta('4242-42')).toBe('4242 42')
    expect(formatearNumeroTarjeta('4242')).toBe('4242')
  })

  it('corta en 16 digitos', () => {
    expect(formatearNumeroTarjeta('42424242424242429999')).toBe('4242 4242 4242 4242')
  })
})

describe('formatearVencimiento', () => {
  it('pone la barra al pasar del mes', () => {
    expect(formatearVencimiento('1')).toBe('1')
    expect(formatearVencimiento('12')).toBe('12')
    expect(formatearVencimiento('122')).toBe('12/2')
    expect(formatearVencimiento('12/27')).toBe('12/27')
    expect(formatearVencimiento('122799')).toBe('12/27')
  })
})
