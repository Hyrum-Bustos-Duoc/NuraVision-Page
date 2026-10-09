import { describe, expect, it } from 'vitest'
import type { Tables } from '@/shared/types/supabase'
import type { DatosServicio } from '../domain/servicio.types'
import { fromDatosServicio, toServicio } from './servicio.mapper'

/**
 * El viaje de ida y vuelta del abono entre la base y el formulario del panel.
 *
 * Es lo que de verdad verifica que la casilla del panel funcione: la pantalla
 * puede pintarse bien y guardar mal. Aqui se comprueban las dos direcciones con
 * filas iguales a las que devuelve PostgREST.
 */

/** Fila como la que llega de la base, con los valores reales del catalogo. */
function fila(parcial: Partial<Tables<'servicios'>> = {}): Tables<'servicios'> {
  return {
    id: 19,
    nombre: 'Alisado Fotónico',
    categoria: 'cabello',
    descripcion: '',
    imagen_url: null,
    descripcion_larga: null,
    incluye: [],
    variantes: null,
    cobrar_abono: false,
    monto_abono: 5000,
    duracion_minutos: 60,
    precio_base: 42000,
    activo: true,
    ...parcial,
  }
}

function borrador(parcial: Partial<DatosServicio> = {}): DatosServicio {
  return {
    nombre: 'Alisado Fotónico',
    categoria: 'cabello',
    descripcion: 'Alisado sin formol.',
    descripcionLarga: '',
    duracionMinutos: 60,
    precioBase: 42000,
    activo: true,
    imagenUrl: null,
    incluye: [],
    variantes: null,
    cobrarAbono: false,
    montoAbono: 5000,
    ...parcial,
  }
}

describe('toServicio · abono', () => {
  it('lee el abono activado', () => {
    const s = toServicio(fila({ cobrar_abono: true, monto_abono: 5000 }))
    expect(s.cobrarAbono).toBe(true)
    expect(s.montoAbono).toBe(5000)
  })

  it('lee el abono apagado', () => {
    const s = toServicio(fila({ cobrar_abono: false }))
    expect(s.cobrarAbono).toBe(false)
  })

  // Las filas que ya existian recibieron el DEFAULT 5000 de la migracion sin
  // tener el abono activo: leerlo no debe encenderlo.
  it('un monto guardado no activa el abono por si solo', () => {
    expect(toServicio(fila({ cobrar_abono: false, monto_abono: 5000 })).cobrarAbono).toBe(false)
  })

  it('tolera un monto nulo', () => {
    expect(toServicio(fila({ monto_abono: null })).montoAbono).toBeNull()
  })
})

describe('fromDatosServicio · abono', () => {
  it('guarda el abono y su monto', () => {
    const f = fromDatosServicio(borrador({ cobrarAbono: true, montoAbono: 5000 }))
    expect(f.cobrar_abono).toBe(true)
    expect(f.monto_abono).toBe(5000)
  })

  /**
   * Con el abono apagado se envia null y NO el monto escrito.
   *
   * Guardar una cifra que no se usa la deja en la base sin que nadie la revise,
   * y reaparece si alguien activa la casilla meses despues con un valor que ya
   * nadie recuerda haber puesto.
   */
  it('descarta el monto cuando el abono esta apagado', () => {
    const f = fromDatosServicio(borrador({ cobrarAbono: false, montoAbono: 9999 }))
    expect(f.cobrar_abono).toBe(false)
    expect(f.monto_abono).toBeNull()
  })

  it('el viaje de ida y vuelta conserva el abono', () => {
    const original = borrador({ cobrarAbono: true, montoAbono: 7500 })
    const vuelta = toServicio(fila({ ...fromDatosServicio(original), id: 19 } as Tables<'servicios'>))
    expect(vuelta.cobrarAbono).toBe(original.cobrarAbono)
    expect(vuelta.montoAbono).toBe(original.montoAbono)
  })
})
