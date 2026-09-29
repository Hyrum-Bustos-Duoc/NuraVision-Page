import { useContext } from 'react'
import { AuthContext, type AuthValue } from './auth.context'

/** Sesion actual y acciones de autenticacion. */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
