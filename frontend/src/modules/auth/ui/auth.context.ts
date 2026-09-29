import { createContext } from 'react'
import type { Credenciales, DatosRegistro, ResultadoRegistro, UsuarioAuth } from '../domain/auth.types'

export interface AuthValue {
  /** Usuario de la sesion, o `null` si nadie inicio sesion. */
  usuario: UsuarioAuth | null
  /**
   * `true` mientras se restaura la sesion guardada al arrancar.
   *
   * Importa distinguirlo de "no hay sesion": durante ese instante el usuario
   * todavia es null, y tratarlo como invitado haria parpadear las pantallas
   * que dependen de la sesion.
   */
  cargando: boolean

  /** Crea la cuenta. Lanza una excepcion con el motivo si falla. */
  signUp: (datos: DatosRegistro) => Promise<ResultadoRegistro>
  /** Inicia sesion. Lanza una excepcion con el motivo si falla. */
  signInWithPassword: (credenciales: Credenciales) => Promise<UsuarioAuth>
  signOut: () => Promise<void>
}

/**
 * El contexto vive aparte del proveedor y del hook a proposito: un archivo con
 * componentes que ademas exporta otras cosas rompe el refresco en caliente de
 * Vite (regla react/only-export-components).
 */
export const AuthContext = createContext<AuthValue | null>(null)
