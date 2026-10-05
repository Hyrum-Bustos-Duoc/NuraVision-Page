import type { Producto } from './producto.types'
import {
  etiquetaImagen,
  filtrarPorCategoria,
  muestraBannerCombo,
  productosDeServicio,
  productosRelacionados,
} from './producto.reglas'
import { filtroDesdeParam } from './categorias'

function producto(slug: string, categoria: Producto['categoria'], extra: Partial<Producto> = {}): Producto {
  return {
    id: slug,
    slug,
    nombre: slug,
    categoria,
    tamano: '',
    precio: 1000,
    precioAnterior: null,
    imagenUrl: null,
    insignia: null,
    servicioId: null,
    descripcion: '',
    modoUso: '',
    ingredientes: '',
    stock: null,
    ...extra,
  }
}

const catalogo = [
  producto('aceite', 'unas_manos', { servicioId: '6' }),
  producto('crema', 'unas_manos', { servicioId: '6' }),
  producto('champu', 'cabello'),
  producto('mascarilla', 'cabello'),
  producto('protector', 'piel'),
  producto('kit', 'kits', { servicioId: '6' }),
  producto('gift', 'gift_cards'),
]

describe('filtrarPorCategoria', () => {
  it('con "todos" devuelve el catalogo completo', () => {
    expect(filtrarPorCategoria(catalogo, 'todos')).toHaveLength(7)
  })

  it('filtra por una sola categoria', () => {
    expect(filtrarPorCategoria(catalogo, 'cabello').map((p) => p.slug)).toEqual([
      'champu',
      'mascarilla',
    ])
  })
})

describe('filtroDesdeParam', () => {
  it('acepta un id valido e ignora lo desconocido', () => {
    expect(filtroDesdeParam('piel')).toBe('piel')
    expect(filtroDesdeParam('zapatos')).toBe('todos')
    expect(filtroDesdeParam(null)).toBe('todos')
  })
})

describe('muestraBannerCombo', () => {
  it('aparece con Todos, Kits y Uñas y manos', () => {
    expect(muestraBannerCombo('todos')).toBe(true)
    expect(muestraBannerCombo('kits')).toBe(true)
    expect(muestraBannerCombo('unas_manos')).toBe(true)
  })

  it('no aparece en el resto', () => {
    expect(muestraBannerCombo('cabello')).toBe(false)
    expect(muestraBannerCombo('gift_cards')).toBe(false)
  })
})

describe('productosRelacionados', () => {
  it('prioriza la misma categoria y los kits, sin el actual', () => {
    const relacionados = productosRelacionados(catalogo[0], catalogo)
    expect(relacionados.map((p) => p.slug)).toEqual(['crema', 'kit', 'champu', 'mascarilla'])
  })

  it('completa con el resto del catalogo y no repite', () => {
    const relacionados = productosRelacionados(catalogo[4], catalogo)
    const slugs = relacionados.map((p) => p.slug)
    expect(slugs).toHaveLength(4)
    expect(new Set(slugs).size).toBe(4)
    expect(slugs).not.toContain('protector')
    expect(slugs[0]).toBe('kit')
  })

  it('con un catalogo chico devuelve lo que haya', () => {
    expect(productosRelacionados(catalogo[0], catalogo.slice(0, 2))).toHaveLength(1)
  })
})

describe('productosDeServicio', () => {
  it('devuelve los productos vinculados al servicio', () => {
    expect(productosDeServicio(catalogo, '6').map((p) => p.slug)).toEqual(['aceite', 'crema', 'kit'])
  })
})

describe('etiquetaImagen', () => {
  it('quita palabras de relleno y deja dos', () => {
    expect(etiquetaImagen({ nombre: 'Aceite de cutícula Nura' })).toBe('aceite cutícula')
    expect(etiquetaImagen({ nombre: 'Gift card Estudio Nura' })).toBe('gift card')
  })
})
