import type { EstadoReserva } from '@/shared/types/supabase'
import type { VarianteElegida } from '@/modules/reservas/domain/reserva.types'

export type { EstadoReserva }

/**
 * Una reserva vista por el estudio.
 *
 * Es deliberadamente distinta de la entidad del modulo `reservas`, que modela
 * la reserva vista por quien la hizo. Aqui aparecen el nombre, el correo y el
 * telefono de la clienta porque el estudio necesita poder contactarla; alli no
 * tienen sentido, porque quien mira ya sabe quien es.
 *
 * Dos modulos, dos vistas del mismo dato, cada uno con lo que le corresponde:
 * es la razon de que `admin` no reutilice `Reserva` de `reservas`.
 */
export interface ReservaGestion {
  id: string
  codigo: string
  servicioId: string
  profesionalId: string
  /** ISO corto, "YYYY-MM-DD". */
  fecha: string
  /** "HH:MM" */
  horaInicio: string
  /** "HH:MM" */
  horaFin: string
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string | null
  /** uuid de la cuenta, o `null` si reservo como invitada. */
  clienteId: string | null
  estado: EstadoReserva
  /**
   * Lo que la clienta eligio al reservar, o `null` si el servicio no preguntaba.
   *
   * Importa que el estudio lo vea: es lo unico que dice a que precio se acordo
   * la hora. `reservas` no tiene columna de precio, asi que sin esto el panel
   * mostraria el precio que el servicio tenga HOY.
   */
  varianteElegida: VarianteElegida | null
}

/**
 * Filtros del listado.
 *
 * Un campo ausente significa "sin filtrar", no "vacio": por eso son opcionales
 * y no admiten cadena vacia. Asi el repositorio no tiene que distinguir entre
 * "el estudio no eligio estado" y "eligio uno que no existe".
 */
export interface FiltrosReservas {
  estado?: EstadoReserva
  profesionalId?: string
}

/** Estados que el estudio puede filtrar, en el orden en que se ofrecen. */
export const ESTADOS_FILTRABLES: EstadoReserva[] = [
  'pendiente',
  'confirmada',
  'completada',
  'cancelada',
]

/**
 * Una reserva solo se confirma desde 'pendiente'.
 *
 * Confirmar una cancelada la reviviria sin que nadie lo pida, y una completada
 * ya paso. La interfaz usa esto para no ofrecer el boton donde no aplica.
 */
export function esConfirmable(reserva: ReservaGestion): boolean {
  return reserva.estado === 'pendiente'
}
