import {
  calcularTotales,
  costoEnvio,
  descuentoCombo,
  erroresDeEntrega,
  metodoPermitido,
} from './pedido.reglas'

const kit = { categoria: 'kits', servicioId: '6', precio: 29900, cantidad: 1 }
const aceite = { categoria: 'unas_manos', servicioId: '6', precio: 9900, cantidad: 1 }

// Los mismos casos que se probaron contra crear_pedido() en Postgres: si estos
// numeros cambian, la funcion tambien debe cambiar.
describe('calcularTotales (espejo de crear_pedido)', () => {
  it('despacho bajo el umbral cobra $3.990', () => {
    expect(calcularTotales([{ ...aceite, cantidad: 2 }], 'despacho', null)).toEqual({
      subtotal: 19800,
      envio: 3990,
      descuento: 0,
      total: 23790,
    })
  })

  it('despacho desde $40.000 es gratis', () => {
    expect(calcularTotales([{ ...kit, cantidad: 2 }], 'despacho', null).envio).toBe(0)
    expect(costoEnvio('despacho', 40000)).toBe(0)
    expect(costoEnvio('despacho', 39999)).toBe(3990)
  })

  it('retiro y cita nunca cobran envio', () => {
    expect(costoEnvio('retiro', 100)).toBe(0)
    expect(costoEnvio('cita', 100)).toBe(0)
  })

  it('entrega en cita del servicio del kit aplica el 15 % solo al kit', () => {
    expect(calcularTotales([kit, aceite], 'cita', '6')).toEqual({
      subtotal: 39800,
      envio: 0,
      descuento: 4485,
      total: 35315,
    })
  })
})

describe('descuentoCombo', () => {
  it('no aplica fuera de la cita ni con otro servicio', () => {
    expect(descuentoCombo([kit], 'retiro', '6')).toBe(0)
    expect(descuentoCombo([kit], 'cita', '5')).toBe(0)
    expect(descuentoCombo([kit], 'cita', null)).toBe(0)
  })
})

describe('metodoPermitido', () => {
  it('pagar en el estudio no va con despacho', () => {
    expect(metodoPermitido('estudio', 'despacho')).toBe(false)
    expect(metodoPermitido('estudio', 'retiro')).toBe(true)
    expect(metodoPermitido('webpay', 'despacho')).toBe(true)
  })
})

describe('erroresDeEntrega', () => {
  const base = { nombre: 'Ana', email: 'ana@correo.cl', entrega: 'retiro' as const }

  it('retiro con contacto completo no tiene errores', () => {
    expect(erroresDeEntrega(base)).toEqual({})
  })

  it('exige nombre y un correo valido', () => {
    expect(erroresDeEntrega({ ...base, nombre: ' ', email: 'ana' })).toMatchObject({
      nombre: expect.any(String),
      email: expect.any(String),
    })
  })

  it('despacho exige direccion y comuna con cobertura', () => {
    expect(erroresDeEntrega({ ...base, entrega: 'despacho' })).toMatchObject({
      direccion: expect.any(String),
      comuna: expect.any(String),
    })
    expect(
      erroresDeEntrega({ ...base, entrega: 'despacho', direccion: 'Calle 1', comuna: 'Santiago' }).comuna,
    ).toMatch(/Viña del Mar/)
    expect(
      erroresDeEntrega({ ...base, entrega: 'despacho', direccion: 'Calle 1', comuna: 'valparaiso' }),
    ).toEqual({})
  })

  it('la cita exige elegir una reserva', () => {
    expect(erroresDeEntrega({ ...base, entrega: 'cita' }).reserva).toBeDefined()
    expect(erroresDeEntrega({ ...base, entrega: 'cita', reservaId: '3' })).toEqual({})
  })
})
