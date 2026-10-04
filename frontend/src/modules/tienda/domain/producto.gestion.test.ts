import { motivoParaNoGuardarProducto, slugDesdeNombre } from './producto.gestion'
import type { DatosProducto } from './producto.types'

const valido: DatosProducto = {
  slug: 'aceite-de-cuticula-nura',
  nombre: 'Aceite de cutícula Nura',
  categoria: 'unas_manos',
  tamano: '15 ml',
  precio: 12900,
  precioAnterior: null,
  imagenUrl: null,
  insignia: null,
  servicioId: null,
  descripcion: '',
  modoUso: '',
  ingredientes: '',
  stock: null,
  activo: true,
  orden: 10,
}

describe('slugDesdeNombre', () => {
  it('quita tildes, simbolos y espacios', () => {
    expect(slugDesdeNombre('Sérum Capilar Nº 2')).toBe('serum-capilar-n-2')
    expect(slugDesdeNombre('  Kit  ritual — manos!  ')).toBe('kit-ritual-manos')
    expect(slugDesdeNombre('Uñas')).toBe('unas')
  })
})

describe('motivoParaNoGuardarProducto', () => {
  it('acepta un producto valido', () => {
    expect(motivoParaNoGuardarProducto(valido)).toBeNull()
  })

  it.each<[string, Partial<DatosProducto>]>([
    ['nombre vacio', { nombre: '  ' }],
    ['slug con mayusculas', { slug: 'Aceite' }],
    ['slug con doble guion', { slug: 'a--b' }],
    ['precio cero', { precio: 0 }],
    ['precio con decimales', { precio: 12.5 }],
    ['precio anterior menor', { precioAnterior: 10000 }],
    ['precio anterior igual', { precioAnterior: 12900 }],
    ['stock negativo', { stock: -1 }],
    ['orden con decimales', { orden: 1.5 }],
  ])('rechaza %s', (_, cambio) => {
    expect(motivoParaNoGuardarProducto({ ...valido, ...cambio })).not.toBeNull()
  })

  it('acepta precio anterior mayor y stock en cero', () => {
    expect(motivoParaNoGuardarProducto({ ...valido, precioAnterior: 15900, stock: 0 })).toBeNull()
  })
})
