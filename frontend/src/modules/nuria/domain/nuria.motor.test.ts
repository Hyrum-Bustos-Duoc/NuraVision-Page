import { PREGUNTAS_AYUDA, PROMPTS_DESTACADOS, normalizar, responder, respuestaUpsell } from './nuria.motor'
import type { ContextoNuria } from './nuria.types'

// Nombres reales del catalogo de servicios en produccion, no los del prototipo.
const contexto: ContextoNuria = {
  productos: [
    { slug: 'aceite-de-cuticula-nura', nombre: 'Aceite de cutícula Nura', servicioId: '6' },
    { slug: 'crema-de-manos-reparadora', nombre: 'Crema de manos reparadora', servicioId: '6' },
    { slug: 'kit-ritual-manos', nombre: 'Kit Ritual Manos en casa', servicioId: '6' },
    { slug: 'champu-reconstructor', nombre: 'Champú reconstructor', servicioId: '5' },
    { slug: 'gel-limpiador-suave', nombre: 'Gel limpiador suave', servicioId: null },
    { slug: 'protector-solar-fps-50', nombre: 'Protector solar FPS 50', servicioId: null },
    { slug: 'gift-card-estudio-nura', nombre: 'Gift card Estudio Nura', servicioId: null },
  ],
  servicios: [
    { id: '1', nombre: 'Corte de Pelo Mujer', duracionMinutos: 60, precioTexto: '$20.000' },
    { id: '5', nombre: 'Tratamiento Capilar', duracionMinutos: 60, precioTexto: '$30.000' },
    { id: '6', nombre: 'Manicura Completa', duracionMinutos: 120, precioTexto: '$10.000' },
    { id: '23', nombre: 'Cejas', duracionMinutos: 30, precioTexto: '$8.000' },
  ],
  carrito: { unidades: 0, totalTexto: '$0' },
  ultimaRecomendacion: [],
}

describe('normalizar', () => {
  it('quita tildes y mayusculas', () => {
    expect(normalizar('Uñas QUEBRADIZAS, cutícula')).toBe('unas quebradizas, cuticula')
  })
})

describe('prompts destacados', () => {
  it('"Mis uñas se quiebran" recomienda productos de manos', () => {
    const r = responder(PROMPTS_DESTACADOS[0], contexto)
    expect(r.mensaje.productos).toEqual(['aceite-de-cuticula-nura', 'crema-de-manos-reparadora', 'kit-ritual-manos'])
    expect(r.recomendacion).toEqual(r.mensaje.productos)
    expect(r.mensaje.chips).toContain('Agregar todo al carrito')
    expect(r.mensaje.chips).toContain('Reservar manicura completa')
  })

  it('"Reserva una manicure para mañana" ofrece el servicio real', () => {
    const r = responder(PROMPTS_DESTACADOS[1], contexto)
    expect(r.mensaje.servicioId).toBe('6')
    expect(r.mensaje.texto).toContain('Manicura Completa dura 120 min')
  })

  it('"Arma mi rutina para piel sensible" recomienda limpieza y protector', () => {
    expect(responder(PROMPTS_DESTACADOS[2], contexto).mensaje.productos).toEqual([
      'gel-limpiador-suave',
      'protector-solar-fps-50',
    ])
  })
})

describe('agregar todo', () => {
  it('agrega la ultima recomendacion disponible', () => {
    const r = responder('agregar todo al carrito', {
      ...contexto,
      ultimaRecomendacion: ['aceite-de-cuticula-nura', 'no-existe'],
    })
    expect(r.agregar).toEqual(['aceite-de-cuticula-nura'])
    expect(r.mensaje.acciones).toEqual(['ver-carrito', 'ir-a-pagar'])
  })

  it('sin recomendacion previa no agrega nada', () => {
    expect(responder('agrega todo', contexto).agregar).toBeUndefined()
  })
})

describe('carrito', () => {
  it('vacio invita a elegir', () => {
    expect(responder('ver mi carrito', contexto).mensaje.texto).toMatch(/vacío/)
  })

  it('con productos resume y ofrece pagar', () => {
    const r = responder('ir a pagar', { ...contexto, carrito: { unidades: 3, totalTexto: '$29.700' } })
    expect(r.mensaje.texto).toBe('Llevas 3 ítems por $29.700. ¿Vamos al pago?')
  })
})

describe('politicas (links de Ayuda del footer)', () => {
  it('despacho, devoluciones y cancelacion', () => {
    expect(responder(PREGUNTAS_AYUDA.despacho, contexto).mensaje.texto).toMatch(/tres opciones/)
    expect(responder(PREGUNTAS_AYUDA.devoluciones, contexto).mensaje.texto).toMatch(/10 días/)
    expect(responder(PREGUNTAS_AYUDA.cancelacion, contexto).mensaje.texto).toMatch(/12 horas/)
  })
})

describe('reservas', () => {
  it('"Reservar una hora" pregunta que servicio (no lo confunde con uñas)', () => {
    const r = responder('Reservar una hora', contexto)
    expect(r.mensaje.texto).toBe('¿Qué servicio quieres reservar?')
  })

  it('"ahora" no se lee como pedir hora', () => {
    expect(responder('ahora mismo', contexto).mensaje.texto).toMatch(/aprendiendo/)
  })

  it('un servicio que no esta en el catalogo no se inventa', () => {
    const r = responder('quiero reservar pedicure', contexto)
    expect(r.mensaje.servicioId).toBeUndefined()
    expect(r.mensaje.acciones).toEqual(['ver-servicios'])
  })

  it('reservar + tema usa el servicio del tema', () => {
    expect(responder('quiero agendar algo para el cabello', contexto).mensaje.servicioId).toBe('5')
  })

  it('cejas encuentra el servicio real', () => {
    expect(responder('Reservar cejas', contexto).mensaje.servicioId).toBe('23')
  })
})

describe('respuestaUpsell', () => {
  it('ofrece el producto para la cita', () => {
    const r = respuestaUpsell({ slug: 'aceite-de-cuticula-nura', nombre: 'Aceite de cutícula Nura' })
    expect(r.mensaje.paraLaCita).toBe(true)
    expect(r.mensaje.chips).toEqual(['No, gracias', 'Ir a pagar'])
  })
})
