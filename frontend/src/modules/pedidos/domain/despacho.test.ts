import {
  avanceDespachoGratis,
  comunaConDespacho,
  faltaParaDespachoGratis,
} from './despacho'

describe('despacho gratis', () => {
  it('calcula lo que falta (ejemplo de la spec)', () => {
    expect(faltaParaDespachoGratis(29700)).toBe(10300)
    expect(faltaParaDespachoGratis(40000)).toBe(0)
    expect(faltaParaDespachoGratis(55000)).toBe(0)
  })

  it('el avance tiene tope en 1', () => {
    expect(avanceDespachoGratis(0)).toBe(0)
    expect(avanceDespachoGratis(20000)).toBe(0.5)
    expect(avanceDespachoGratis(90000)).toBe(1)
  })
})

describe('comunaConDespacho', () => {
  it('acepta las comunas con cobertura sin importar tildes ni mayusculas', () => {
    expect(comunaConDespacho('Viña del Mar')).toBe(true)
    expect(comunaConDespacho('  vina   del mar ')).toBe(true)
    expect(comunaConDespacho('VALPARAISO')).toBe(true)
  })

  it('rechaza el resto', () => {
    expect(comunaConDespacho('Santiago')).toBe(false)
    expect(comunaConDespacho('')).toBe(false)
  })
})
