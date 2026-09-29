/** Valores del enum `estado_reserva` en la base de datos. */
export type EstadoReserva = 'pendiente' | 'confirmada' | 'completada' | 'cancelada'

/**
 * Datos necesarios para crear una reserva.
 *
 * El contacto es obligatorio aunque haya cuenta: quien reserva sin sesion no
 * tiene perfil, y el correo es el unico vinculo con su hora.
 */
export interface NuevaReserva {
  servicioId: string
  profesionalId: string
  /** ISO corto, "YYYY-MM-DD". */
  fecha: string
  /** "HH:MM" */
  horaInicio: string
  /** "HH:MM". Se calcula con la duracion del servicio al momento de reservar. */
  horaFin: string
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string
  /** Codigo visible que se le muestra a quien reserva sin cuenta. */
  codigo: string
  /**
   * uuid de la cuenta que reserva, o `null` si reserva como invitada.
   *
   * Es lo que despues permite leerla: la politica de RLS entrega las filas
   * cuyo `cliente_id` coincide con `auth.uid()` (0004_auth_reservas_policy).
   * Una reserva guardada con `null` no la puede recuperar nadie, ni siquiera
   * quien la hizo: solo le queda el `codigo`.
   */
  clienteId: string | null
}

/**
 * Reserva leida de la base.
 *
 * Solo se pueden leer las propias, y solo con sesion iniciada. Sin sesion esta
 * entidad no llega nunca desde el repositorio.
 */
export interface Reserva {
  id: string
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
  codigo: string
  estado: EstadoReserva
}
