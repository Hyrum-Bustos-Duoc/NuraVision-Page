import type { ServiceCategoryId } from '@/shared/types'

/**
 * Entidad de dominio de un servicio.
 *
 * Es la forma que consume la aplicacion, no la de la base de datos: usa
 * camelCase, `categoria` ya validada contra el catalogo del modulo y el id
 * como string, porque asi viaja en las rutas (`/servicios/:id`).
 *
 * Convive con el tipo `Service` de @/shared/types, que es el del prototipo
 * basado en seeds. Cuando la UI migre a la base de datos, `Service` deberia
 * desaparecer y quedar solo este.
 */
export interface Servicio {
  id: string
  nombre: string
  categoria: ServiceCategoryId
  descripcion: string
  duracionMinutos: number
  precioBase: number
  activo: boolean
  /** Foto propia. `null` = la deduce `servicio.imagenes.ts` a partir del nombre. */
  imagenUrl: string | null
  /** Texto de la pagina de detalle. `descripcion` es el breve de las tarjetas. */
  descripcionLarga: string
  /** Lo que contempla el servicio. Lista vacia si no se detallo. */
  incluye: string[]
}

/**
 * Lo que el panel de administracion escribe de un servicio.
 *
 * No incluye `id`: al crear no existe todavia, y al editar lo aporta quien
 * llama. Tampoco `duracion_bloques`, que es una columna sin versionar cuyo
 * significado no esta documentado (ver 0010): el panel no la toca.
 */
export interface DatosServicio {
  nombre: string
  categoria: ServiceCategoryId
  descripcion: string
  duracionMinutos: number
  precioBase: number
  activo: boolean
  imagenUrl: string | null
  descripcionLarga: string
  incluye: string[]
}
