import { useContext } from 'react'
import { ContenidoContext, type ContenidoValue } from './contenido.context'

export function useContenido(): ContenidoValue {
  const ctx = useContext(ContenidoContext)
  if (!ctx) throw new Error('useContenido debe usarse dentro de ContenidoProvider')
  return ctx
}
