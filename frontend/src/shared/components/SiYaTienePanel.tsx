import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { rutaDePanel } from '@/modules/auth/ui/ruta-inicial'

/**
 * Aparta de las pantallas de entrada a quien ya tiene un panel interno.
 *
 * Envuelve `/login` y `/registro`: si la sesion de Supabase pertenece al
 * personal o a una profesional, no tiene sentido volver a pedirle credenciales
 * —ya esta dentro— y lo util es dejarla donde trabaja.
 *
 * A una clienta no se le aparta: `rutaDePanel` devuelve `null` para ella y el
 * formulario se pinta normal. Podria parecer natural mandarla a `/mis-reservas`,
 * pero entrar a `/login` teniendo sesion suele significar «quiero entrar con
 * otra cuenta», y ahi impedirselo seria peor que no hacer nada.
 *
 * OJO: a quien SI tiene panel se le impide precisamente eso, que es lo que se
 * pidio. Para cambiar de cuenta tiene que cerrar sesion antes, con el boton del
 * pie del panel lateral.
 */
export function SiYaTienePanel({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth()

  // Mientras se restaura la sesion guardada todavia no se sabe si hay panel.
  // Pintar el formulario ahora lo haria parpadear justo antes de irse.
  if (cargando) return null

  const destino = usuario ? rutaDePanel(usuario) : null
  if (destino) return <Navigate to={destino} replace />

  return <>{children}</>
}
