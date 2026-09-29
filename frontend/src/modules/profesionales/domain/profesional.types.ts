import type { ServiceCategoryId } from '@/shared/types'

/**
 * Entidad de dominio de un profesional.
 *
 * Convive con el tipo `Professional` de @/shared/types, que es el del prototipo
 * basado en seeds. Ese trae ademas `availability` y `serviceIds`, que no son
 * columnas de esta tabla sino otras dos —`disponibilidad` y
 * `profesional_servicios`—, y por eso el asistente de reserva sigue necesitando
 * el otro tipo para calcular horarios.
 *
 * `experienciaAnios`, `biografia` y `categoria` si son columnas desde 0010: el
 * formulario del panel las pedia desde el principio y hasta entonces se
 * rellenaban con 0 y cadena vacia.
 */
export interface Profesional {
  id: string
  nombre: string
  especialidad: string
  /** `null` cuando no hay foto cargada. */
  avatarUrl: string | null
  activo: boolean
  /** Años de oficio. 0 = sin declarar. */
  experienciaAnios: number
  /** Reseña de la ficha publica. `null` si no se escribio. */
  biografia: string | null
  /**
   * Area principal, ya validada contra el catalogo del modulo servicios.
   *
   * `null` cuando la fila no trae ninguna o no se reconoce. NO se degrada a un
   * valor por defecto como hace `servicios`: ahi una categoria equivocada solo
   * descoloca un filtro, mientras que aqui decidiria en que seccion del sitio
   * aparece una persona real.
   */
  categoria: ServiceCategoryId | null
}

/**
 * Lo que el panel de administracion escribe de un profesional.
 *
 * Incluye los servicios que realiza y no solo las columnas de la tabla, porque
 * para quien usa el formulario son parte de la misma ficha. Que por debajo sean
 * dos tablas —y una tercera para el horario— es un detalle de la persistencia.
 */
export interface DatosProfesional {
  nombre: string
  especialidad: string
  avatarUrl: string | null
  activo: boolean
  experienciaAnios: number
  biografia: string | null
  categoria: ServiceCategoryId | null
  /** Ids de `servicios` que realiza. Reemplaza la lista anterior por completo. */
  servicioIds: string[]
}
