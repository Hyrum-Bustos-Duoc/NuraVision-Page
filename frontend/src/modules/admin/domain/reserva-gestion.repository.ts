import type { FiltrosReservas, ReservaGestion } from './reserva-gestion.types'

/**
 * Puerto de gestion de reservas para el estudio.
 *
 * A diferencia del puerto de `reservas`, este SI lista las de todo el mundo:
 * es el punto del sistema donde eso es legitimo. Que lo sea de verdad depende
 * de las politicas de la base y no de este archivo: las concede
 * 0006_admin_staff_policy.sql, y solo a quien tenga `es_staff` en su
 * `app_metadata`. Para cualquier otra sesion, listar devuelve vacio y
 * confirmar falla.
 */
export interface ReservaGestionRepository {
  /** Reservas que cumplen los filtros, de la mas reciente a la mas antigua. */
  listar(filtros: FiltrosReservas): Promise<ReservaGestion[]>

  /** Pasa la reserva a 'confirmada' y devuelve la fila actualizada. */
  confirmar(id: string): Promise<ReservaGestion>
}
