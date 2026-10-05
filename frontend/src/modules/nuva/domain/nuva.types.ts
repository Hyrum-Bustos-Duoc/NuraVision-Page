/** Accion que Nuva ofrece como pildora bajo su mensaje. */
export type AccionNuva = 'ver-carrito' | 'ir-a-pagar' | 'ver-reservas' | 'confirmar-reserva' | 'ver-servicios'

export interface MensajeUsuaria {
  id: number
  de: 'usuaria'
  texto: string
}

export interface MensajeNuva {
  id: number
  de: 'nuva'
  texto: string
  /** Slugs del carrusel de productos. */
  productos?: string[]
  /** Si se agregan desde este mensaje, se entregan en la cita (upsell). */
  paraLaCita?: boolean
  /** Tarjeta de servicio con horarios. */
  servicioId?: string
  /** Horario ya elegido en la tarjeta: bloquea las demas pildoras. */
  horarioElegido?: string
  acciones?: AccionNuva[]
  chips?: string[]
}

export type Mensaje = MensajeUsuaria | MensajeNuva

/** Lo que el motor necesita saber del mundo para responder. */
export interface ContextoNuva {
  productos: { slug: string; nombre: string; servicioId: string | null }[]
  servicios: { id: string; nombre: string; duracionMinutos: number; precioTexto: string }[]
  carrito: { unidades: number; totalTexto: string }
  /** Ultima recomendacion de productos, para "agregar todo". */
  ultimaRecomendacion: string[]
}

/**
 * Respuesta del motor. `agregar` es un efecto que la interfaz ejecuta (el motor
 * es puro y no toca el carrito).
 */
export interface RespuestaNuva {
  mensaje: Omit<MensajeNuva, 'id' | 'de'>
  agregar?: string[]
  /** Nueva "ultima recomendacion", si esta respuesta recomienda productos. */
  recomendacion?: string[]
}
