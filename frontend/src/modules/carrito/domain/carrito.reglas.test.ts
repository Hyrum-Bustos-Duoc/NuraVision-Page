import {
  agregarLinea,
  cambiarCantidad,
  contarUnidades,
  MAXIMO_POR_LINEA,
  parsearLineas,
  podarLineas,
  quitarLinea,
} from './carrito.reglas'

describe('agregarLinea', () => {
  it('agrega una linea nueva', () => {
    expect(agregarLinea([], 'aceite')).toEqual([{ slug: 'aceite', cantidad: 1 }])
  })

  it('suma la cantidad si el producto ya esta', () => {
    const lineas = agregarLinea(agregarLinea([], 'aceite'), 'aceite', 2)
    expect(lineas).toEqual([{ slug: 'aceite', cantidad: 3 }])
  })

  it('no supera el maximo por linea', () => {
    expect(agregarLinea([{ slug: 'kit', cantidad: 19 }], 'kit', 5)[0].cantidad).toBe(MAXIMO_POR_LINEA)
  })

  it('ignora cantidades no positivas', () => {
    const lineas = [{ slug: 'kit', cantidad: 1 }]
    expect(agregarLinea(lineas, 'kit', 0)).toBe(lineas)
  })
})

describe('cambiarCantidad', () => {
  it('fija la cantidad', () => {
    expect(cambiarCantidad([{ slug: 'kit', cantidad: 1 }], 'kit', 4)).toEqual([{ slug: 'kit', cantidad: 4 }])
  })

  it('llevarla a cero elimina la linea', () => {
    expect(cambiarCantidad([{ slug: 'kit', cantidad: 1 }], 'kit', 0)).toEqual([])
  })
})

describe('quitarLinea y contarUnidades', () => {
  it('quita solo la linea pedida y cuenta unidades', () => {
    const lineas = [
      { slug: 'kit', cantidad: 2 },
      { slug: 'aceite', cantidad: 3 },
    ]
    expect(contarUnidades(lineas)).toBe(5)
    expect(quitarLinea(lineas, 'kit')).toEqual([{ slug: 'aceite', cantidad: 3 }])
  })
})

describe('podarLineas', () => {
  it('descarta productos que ya no existen', () => {
    const lineas = [
      { slug: 'kit', cantidad: 1 },
      { slug: 'descontinuado', cantidad: 1 },
    ]
    expect(podarLineas(lineas, (slug) => slug === 'kit')).toEqual([{ slug: 'kit', cantidad: 1 }])
  })

  it('devuelve la misma referencia si no hay nada que podar', () => {
    const lineas = [{ slug: 'kit', cantidad: 1 }]
    expect(podarLineas(lineas, () => true)).toBe(lineas)
  })
})

describe('parsearLineas', () => {
  it('acepta lineas validas y agrupa duplicadas', () => {
    expect(
      parsearLineas([
        { slug: 'kit', cantidad: 1 },
        { slug: 'kit', cantidad: 2 },
      ]),
    ).toEqual([{ slug: 'kit', cantidad: 3 }])
  })

  it('descarta lo que no tiene forma de linea', () => {
    expect(parsearLineas('basura')).toEqual([])
    expect(parsearLineas([null, { slug: 1 }, { slug: 'kit', cantidad: '2' }, { slug: 'ok', cantidad: -3 }])).toEqual([])
  })
})
