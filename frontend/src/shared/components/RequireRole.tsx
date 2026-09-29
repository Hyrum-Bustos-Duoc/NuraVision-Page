import { Navigate, Outlet } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { useAuth } from '@/modules/auth/ui/useAuth'
import type { Role } from '@/shared/types'

/**
 * Guarda de ruta por rol.
 *
 * Conviven dos sesiones y hasta ahora solo se miraba una: la del prototipo,
 * guardada en memoria por `useAppState`. El efecto era que una cuenta REAL de
 * Supabase marcada como personal no podia entrar a `/admin`, y una vinculada a
 * una ficha del equipo no podia entrar a `/profesional`: la guarda las mandaba
 * al login aunque tuvieran el permiso.
 *
 * Ahora cada rol se resuelve mirando las dos, con la misma regla que usa la
 * base de datos:
 *
 *   · administrador -> `es_staff` en `app_metadata` (lo que exige 0006).
 *   · profesional   -> ficha vinculada en `app_metadata`.
 *   · cliente       -> cualquier sesion iniciada.
 *
 * ESTO NO ES LA DEFENSA. Solo decide que pantalla se pinta; quien decide que
 * datos se ven sigue siendo Row Level Security. Saltarse esta guarda no da
 * acceso a nada que la base no conceda por su cuenta.
 */
export function RequireRole({ role }: { role: Role }) {
  const { currentUser } = useAppState()
  const { usuario, cargando } = useAuth()

  // Mientras se restaura la sesion guardada no se sabe todavia si tiene
  // permiso. Redirigir ahora mandaria al login a quien si lo tiene, solo por
  // llegar antes que su propia sesion.
  if (cargando) return null

  const porPrototipo = currentUser?.role === role

  const porSupabase =
    usuario !== null &&
    (role === 'administrador'
      ? usuario.esStaff
      : role === 'profesional'
        ? usuario.profesionalId !== null
        : true)

  if (!porPrototipo && !porSupabase) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
