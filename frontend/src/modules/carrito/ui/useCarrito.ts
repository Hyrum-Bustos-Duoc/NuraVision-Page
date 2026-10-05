import { useContext } from 'react'
import { CarritoContext, type CarritoValue } from './carrito.context'

export function useCarrito(): CarritoValue {
  const ctx = useContext(CarritoContext)
  if (!ctx) throw new Error('useCarrito debe usarse dentro de CarritoProvider')
  return ctx
}
