import { createContext } from 'react'
import type { Producto } from '@/modules/tienda/application'
import type { LineaCarrito } from '../domain/carrito.types'

/** Linea ya resuelta contra el catalogo vigente. */
export interface ItemCarrito {
  producto: Producto
  cantidad: number
  /** precio × cantidad, con el precio del catalogo actual. */
  total: number
}

export interface CarritoValue {
  lineas: LineaCarrito[]
  items: ItemCarrito[]
  /** Suma de cantidades: es el numero del header. */
  unidades: number
  subtotal: number
  /**
   * Agrega unidades. Abre el drawer salvo que se pida lo contrario: el combo y
   * Nuva agregan sin sacar a la persona de lo que esta haciendo.
   */
  agregar: (slug: string, cantidad?: number, opciones?: { abrir?: boolean }) => void
  cambiarCantidad: (slug: string, cantidad: number) => void
  quitar: (slug: string) => void
  vaciar: () => void

  abierto: boolean
  abrir: () => void
  cerrar: () => void

  /**
   * El combo y el upsell de Nuva piden entregar en la cita. El checkout lo usa
   * como opcion por defecto si la persona tiene una reserva vigente.
   */
  prefiereEntregaEnCita: boolean
  preferirEntregaEnCita: (valor: boolean) => void
}

export const CarritoContext = createContext<CarritoValue | null>(null)
