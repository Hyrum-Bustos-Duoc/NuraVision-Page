import { motivoParaNoGuardarServicio } from './servicio.reglas'
import type { DatosServicio } from './servicio.types'

function datos(cambios: Partial<DatosServicio> = {}): DatosServicio {
  return {
    nombre: 'Manicura Completa',
    categoria: 'unas',
    descripcion: '',
    duracionMinutos: 60,
    precioBase: 18000,
    activo: true,
    imagenUrl: null,
    descripcionLarga: '',
    incluye: [],
    variantes: null,
    abono: 5000,
    ...cambios,
  }
}

describe('motivoParaNoGuardarServicio: abono', () => {
  it('acepta un servicio de uñas con abono entre 1 y su precio', () => {
    expect(motivoParaNoGuardarServicio(datos())).toBeNull()
    expect(motivoParaNoGuardarServicio(datos({ abono: 18000 }))).toBeNull()
  })

  it('rechaza un servicio de uñas con abono 0', () => {
    expect(motivoParaNoGuardarServicio(datos({ abono: 0 }))).toBe(
      'Los servicios de uñas requieren un abono mayor que $0.',
    )
  })

  it('acepta otra categoria con abono 0', () => {
    expect(motivoParaNoGuardarServicio(datos({ categoria: 'cabello', abono: 0 }))).toBeNull()
  })

  it('acepta otra categoria con abono mayor que 0', () => {
    expect(motivoParaNoGuardarServicio(datos({ categoria: 'piel', abono: 3000 }))).toBeNull()
  })

  it('rechaza un abono mayor que el precio sin variantes', () => {
    expect(motivoParaNoGuardarServicio(datos({ abono: 18001 }))).toMatch(/no puede superar/)
  })

  it('topa contra la opcion mas barata, no contra el precio base', () => {
    const motivo = motivoParaNoGuardarServicio(
      datos({
        precioBase: 20000,
        abono: 12000,
        variantes: {
          pregunta: '¿Largo?',
          opciones: [
            { id: 'corto', etiqueta: 'Corto', precio: 10000 },
            { id: 'largo', etiqueta: 'Largo', precio: 25000 },
          ],
        },
      }),
    )
    expect(motivo).toBe('El abono no puede superar el precio del servicio ($10.000).')
  })

  it('rechaza abonos negativos o con decimales', () => {
    expect(motivoParaNoGuardarServicio(datos({ abono: -1 }))).toMatch(/entero/)
    expect(motivoParaNoGuardarServicio(datos({ abono: 4999.5 }))).toMatch(/entero/)
    expect(motivoParaNoGuardarServicio(datos({ abono: Number.NaN }))).toMatch(/entero/)
  })

  it('un servicio de uñas con precio 0 no se puede guardar (consecuencia aceptada)', () => {
    expect(motivoParaNoGuardarServicio(datos({ precioBase: 0, abono: 0 }))).toMatch(/uñas/)
    expect(motivoParaNoGuardarServicio(datos({ precioBase: 0, abono: 1 }))).toMatch(/superar/)
  })

  it('informa antes el error de variantes que el del abono', () => {
    const motivo = motivoParaNoGuardarServicio(
      datos({ abono: 0, variantes: { pregunta: '', opciones: [] } }),
    )
    expect(motivo).toMatch(/pregunta/)
  })
})
