import type { UsuarioAuth } from '../domain/auth.types'
import { rutaDeRetorno, rutaTrasIniciarSesion } from './ruta-inicial'

const clienta: UsuarioAuth = {
  id: 'u1',
  email: 'ana@correo.cl',
  nombre: 'Ana',
  telefono: null,
  esStaff: false,
  profesionalId: null,
}

describe('rutaDeRetorno', () => {
  it('acepta rutas internas', () => {
    expect(rutaDeRetorno('/checkout')).toBe('/checkout')
    expect(rutaDeRetorno('/tienda?categoria=piel')).toBe('/tienda?categoria=piel')
  })

  it('rechaza destinos externos o raros', () => {
    expect(rutaDeRetorno('https://otro.sitio')).toBeNull()
    expect(rutaDeRetorno('//otro.sitio')).toBeNull()
    expect(rutaDeRetorno('/\\otro.sitio')).toBeNull()
    expect(rutaDeRetorno('checkout')).toBeNull()
    expect(rutaDeRetorno(null)).toBeNull()
  })

  it('no vuelve al login ni al registro', () => {
    expect(rutaDeRetorno('/login')).toBeNull()
    expect(rutaDeRetorno('/registro?volver=/x')).toBeNull()
  })
})

describe('rutaTrasIniciarSesion', () => {
  it('la clienta vuelve a donde estaba', () => {
    expect(rutaTrasIniciarSesion(clienta, '/checkout')).toBe('/checkout')
  })

  it('sin retorno valido va a sus reservas', () => {
    expect(rutaTrasIniciarSesion(clienta, null)).toBe('/mis-reservas')
  })

  it('el panel interno manda sobre el retorno', () => {
    expect(rutaTrasIniciarSesion({ ...clienta, esStaff: true }, '/checkout')).toBe('/admin/reservas')
    expect(rutaTrasIniciarSesion({ ...clienta, profesionalId: '3' }, '/checkout')).toBe('/profesional')
  })
})
