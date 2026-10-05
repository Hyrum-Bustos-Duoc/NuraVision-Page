import { useContext } from 'react'
import { CatalogoContext, type CatalogoValue } from './catalogo.context'

/** Catalogo de la tienda. */
export function useCatalogo(): CatalogoValue {
  const ctx = useContext(CatalogoContext)
  if (!ctx) throw new Error('useCatalogo debe usarse dentro de CatalogoProvider')
  return ctx
}
