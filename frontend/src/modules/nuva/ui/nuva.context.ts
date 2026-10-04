import { createContext } from 'react'
import type { Mensaje, MensajeNuva } from '../domain/nuva.types'

/** Horario elegido en la tarjeta de servicio, ya resuelto contra la agenda. */
export interface HorarioElegido {
  etiqueta: string
  dateISO: string
  time: string
  profesionalId: string
  profesionalNombre: string
}

export interface NuvaValue {
  abierto: boolean
  abrir: () => void
  cerrar: () => void
  alternar: () => void
  mensajes: Mensaje[]
  escribiendo: boolean
  /** Slugs ya agregados desde el chat: su boton queda en "Agregado ✓". */
  agregados: ReadonlySet<string>
  /** Abre el panel y envia el texto como si lo hubiera escrito la persona. */
  enviar: (texto: string) => void
  agregarProducto: (mensaje: MensajeNuva, slug: string) => void
  elegirHorario: (mensaje: MensajeNuva, horario: HorarioElegido) => void
  /** Respuesta local al chip "No, gracias" (no pasa por el motor). */
  declinar: () => void
  reiniciar: () => void
}

export const NuvaContext = createContext<NuvaValue | null>(null)
