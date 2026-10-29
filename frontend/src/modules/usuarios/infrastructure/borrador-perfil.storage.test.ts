// @vitest-environment jsdom
import { borradorPerfilAlmacen } from './borrador-perfil.storage'

const CLAVE = 'nuravision:borrador-perfil'
const PENDIENTE = { usuarioId: 'u1', borrador: { nombre: 'Beatriz', telefono: '9 8765 4321', fechaNacimiento: '1990-03-04' } }

afterEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe('borradorPerfilAlmacen', () => {
  it('lo recordado se lee igual y se olvida', () => {
    borradorPerfilAlmacen.recordar(PENDIENTE)
    expect(borradorPerfilAlmacen.leer()).toEqual(PENDIENTE)
    borradorPerfilAlmacen.olvidar()
    expect(borradorPerfilAlmacen.leer()).toBeNull()
  })

  it.each([
    ['JSON roto', '{no'],
    ['sin cuenta', JSON.stringify({ borrador: PENDIENTE.borrador })],
    ['cuenta vacia', JSON.stringify({ ...PENDIENTE, usuarioId: '' })],
    ['telefono que no es texto', JSON.stringify({ ...PENDIENTE, borrador: { ...PENDIENTE.borrador, telefono: 9 } })],
    ['sin fecha', JSON.stringify({ ...PENDIENTE, borrador: { nombre: 'Ana', telefono: '' } })],
  ])('un dato editado a mano (%s) se lee como null', (_caso, crudo) => {
    window.sessionStorage.setItem(CLAVE, crudo)
    expect(borradorPerfilAlmacen.leer()).toBeNull()
  })

  it('un almacenamiento que lanza no rompe ninguna de las tres operaciones', () => {
    const falla = () => {
      throw new DOMException('cuota', 'QuotaExceededError')
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(falla)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(falla)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(falla)
    expect(() => borradorPerfilAlmacen.recordar(PENDIENTE)).not.toThrow()
    expect(borradorPerfilAlmacen.leer()).toBeNull()
    expect(() => borradorPerfilAlmacen.olvidar()).not.toThrow()
  })
})
