/** Valores del enum `estado_reserva` en la base de datos. */
export type EstadoReserva = 'pendiente' | 'confirmada' | 'completada' | 'cancelada'

/**
 * La opcion que la clienta eligio, tal como se guarda en la reserva.
 *
 * ES UNA COPIA, NO UNA REFERENCIA, y el tipo vive aqui —en reservas— y no en el
 * modulo de servicios justamente por eso: no es "la opcion del servicio", es lo
 * que se acordo el dia de la reserva. Guardar solo `opcionId` seria lo natural,
 * pero las opciones viven dentro del servicio y el estudio las va a editar:
 * cambiar el precio de "Largo" reescribiria el de todas las reservas pasadas, y
 * borrar una opcion dejaria reservas apuntando a algo que ya no existe.
 *
 * Pesa mas de lo habitual porque `reservas` NO tiene columna de precio: hoy el
 * precio de una reserva se recalcula del servicio. Para los servicios con
 * variantes, esta copia es la unica constancia de lo cobrado.
 */
export interface VarianteElegida {
  /** La pregunta tal como se le mostro. Puede haber cambiado despues. */
  pregunta: string
  /** `id` de la opcion en el servicio, para poder cruzarla si sigue existiendo. */
  opcionId: string
  etiqueta: string
  /** Precio final acordado. No es un recargo. */
  precio: number
}

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
  /**
   * Lo elegido en el paso de variantes, o `null` si el servicio no pregunta
   * nada. Se escribe UNA VEZ, al crear la reserva: 0005 no concede el UPDATE de
   * `detalles_extra`, asi que despues es un registro inmutable de lo acordado.
   */
  varianteElegida: VarianteElegida | null
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
  /** Lo que se eligio al reservar, o `null` si el servicio no preguntaba nada. */
  varianteElegida: VarianteElegida | null
}
