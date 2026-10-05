import { useContext } from 'react'
import { NuvaContext, type NuvaValue } from './nuva.context'

export function useNuva(): NuvaValue {
  const ctx = useContext(NuvaContext)
  if (!ctx) throw new Error('useNuva debe usarse dentro de NuvaProvider')
  return ctx
}
