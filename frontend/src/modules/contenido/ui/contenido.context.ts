import { createContext } from 'react'
import type { ContenidoSitio, DestinoFoto } from '../domain/contenido.types'

export interface ContenidoValue {
  contenido: ContenidoSitio
  cargando: boolean
  /** `false` si falta la migracion 0014: el sitio usa los textos originales. */
  editable: boolean
  error: string | null
  actualizadoEn: string | null
  /** Guarda y publica. Lanza con un mensaje listo para mostrar. */
  guardar: (contenido: ContenidoSitio) => Promise<void>
  subirImagen: (destino: DestinoFoto, archivo: File) => Promise<string>
}

/** Vive aparte del proveedor por la regla react/only-export-components. */
export const ContenidoContext = createContext<ContenidoValue | null>(null)
