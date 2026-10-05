import { createContext } from 'react'
import type { Producto } from '../domain/producto.types'

export interface CatalogoValue {
  productos: Producto[]
  cargando: boolean
  error: string | null
  /** Producto activo por su slug, o `undefined` si no existe o no cargo aun. */
  porSlug: (slug: string) => Producto | undefined
  /** Vuelve a leer el catalogo. Lo usa el panel tras crear o editar productos. */
  recargar: () => void
}

/** Vive aparte del proveedor por la regla react/only-export-components. */
export const CatalogoContext = createContext<CatalogoValue | null>(null)
