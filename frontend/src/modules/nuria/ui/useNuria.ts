import { useContext } from 'react'
import { NuriaContext, type NuriaValue } from './nuria.context'

export function useNuria(): NuriaValue {
  const ctx = useContext(NuriaContext)
  if (!ctx) throw new Error('useNuria debe usarse dentro de NuriaProvider')
  return ctx
}
