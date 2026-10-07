import type { ContenidoSitio, DestinoFoto } from './contenido.types'

/** Lo guardado tal como viene de la base, sin validar: lo valida `contenidoDesdeGuardado`. */
export interface ContenidoGuardado {
  datos: unknown
  actualizadoEn: string | null
}

export interface ContenidoRepository {
  /** `null` si la tabla todavia no existe (falta aplicar 0014). */
  obtener(): Promise<ContenidoGuardado | null>
  guardar(contenido: ContenidoSitio): Promise<ContenidoGuardado>
  /** Sube una foto y devuelve su URL publica. */
  subirImagen(destino: DestinoFoto, archivo: File): Promise<string>
}
