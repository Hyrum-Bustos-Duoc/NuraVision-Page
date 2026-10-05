import { fromDatosProducto, toProducto, toProductoAdmin, type ProductoRow } from './producto.mapper'

const fila: ProductoRow = {
  id: 9,
  slug: 'kit-ritual-manos',
  nombre: 'Kit Ritual Manos en casa',
  categoria: 'kits',
  tamano: 'Aceite + crema + lima',
  precio: 29900,
  precio_anterior: 34700,
  imagen_url: null,
  insignia: 'kit',
  servicio_id: 6,
  descripcion: 'Todo lo necesario',
  modo_uso: 'Lima',
  ingredientes: 'Aceite',
  stock: null,
  activo: true,
  orden: 90,
  creado_en: '2026-10-04T00:00:00Z',
}

describe('toProducto', () => {
  it('traduce la fila al dominio', () => {
    expect(toProducto(fila)).toMatchObject({
      id: '9',
      slug: 'kit-ritual-manos',
      categoria: 'kits',
      precio: 29900,
      precioAnterior: 34700,
      insignia: 'kit',
      servicioId: '6',
    })
  })

  it('descarta un precio anterior que no es mayor que el actual', () => {
    expect(toProducto({ ...fila, precio_anterior: 1000 })?.precioAnterior).toBeNull()
  })

  it('ignora una insignia desconocida y una url vacia', () => {
    const p = toProducto({ ...fila, insignia: 'oferta', imagen_url: '  ' })
    expect(p?.insignia).toBeNull()
    expect(p?.imagenUrl).toBeNull()
  })

  it('descarta una categoria fuera del vocabulario', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toProducto({ ...fila, categoria: 'zapatos' })).toBeNull()
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })
})

describe('toProductoAdmin', () => {
  it('conserva una fila con categoria desconocida y la marca', () => {
    const p = toProductoAdmin({ ...fila, categoria: 'cremas' })
    expect(p).toMatchObject({ categoria: 'cremas', categoriaValida: false, activo: true, orden: 90 })
  })

  it('no oculta un precio anterior incoherente: el panel tiene que verlo', () => {
    expect(toProductoAdmin({ ...fila, precio_anterior: 1000 }).precioAnterior).toBe(1000)
  })
})

describe('fromDatosProducto', () => {
  it('recorta textos, vacia la imagen en blanco y convierte el servicio a numero', () => {
    const p = toProductoAdmin(fila)
    const insert = fromDatosProducto({
      ...p,
      categoria: 'kits',
      nombre: '  Kit  ',
      imagenUrl: '   ',
      servicioId: '6',
    })
    expect(insert).toMatchObject({ nombre: 'Kit', imagen_url: null, servicio_id: 6 })
    expect(insert).not.toHaveProperty('id')
  })
})
