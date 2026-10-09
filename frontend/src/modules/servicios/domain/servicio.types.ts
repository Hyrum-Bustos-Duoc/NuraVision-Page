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
  /** Pregunta que altera el precio, o `null` si el servicio no pregunta nada. */
  variantes: VarianteServicio | null
  /**
   * Si al reservar se cobra solo un abono en vez del precio completo (0016).
   *
   * Lo decide el estudio servicio por servicio: una hora cara que no se cumple
   * es una perdida de agenda, y una sena pequena compromete sin obligar a pagar
   * todo por adelantado.
   */
  cobrarAbono: boolean
  /**
   * El abono, en pesos. `null` cuando no esta configurado.
   *
   * La base garantiza —check `servicios_abono_necesita_monto`— que no es null
   * si `cobrarAbono` es true, asi que el caso "cobra abono pero no se sabe
   * cuanto" no puede llegar desde la base.
   */
  montoAbono: number | null
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
  variantes: VarianteServicio | null
  /**
   * Si al reservar se cobra solo un abono en vez del precio completo (0016).
   *
   * Lo decide el estudio servicio por servicio: una hora cara que no se cumple
   * es una perdida de agenda, y una sena pequena compromete sin obligar a pagar
   * todo por adelantado.
   */
  cobrarAbono: boolean
  /**
   * El abono, en pesos. `null` cuando no esta configurado.
   *
   * La base garantiza —check `servicios_abono_necesita_monto`— que no es null
   * si `cobrarAbono` es true, asi que el caso "cobra abono pero no se sabe
   * cuanto" no puede llegar desde la base.
   */
  montoAbono: number | null
}

/**
 * Una respuesta posible a la pregunta de un servicio.
 *
 * `precio` es el precio FINAL de la reserva si se elige esta opcion, no un
 * recargo sobre `precioBase`. Es como lo planteo el estudio ("Corto: $15.000",
 * "Largo: $20.000") y es lo que menos se presta a error al configurarlo: se
 * escribe lo que la clienta paga.
 */
export interface OpcionVariante {
  /** Estable: es lo que se guarda en la reserva para identificar la eleccion. */
  id: string
  etiqueta: string
  precio: number
}

/**
 * La pregunta que un servicio le hace a la clienta antes de reservar.
 *
 * `null` en el servicio significa que no pregunta nada, que es el caso de los 17
 * que ya existen. Si no es null, la base garantiza —por el check de 0011— que
 * hay pregunta y al menos una opcion: una pregunta sin respuestas posibles
 * dejaria el flujo de reserva en un callejon sin salida.
 */
export interface VarianteServicio {
  pregunta: string
  opciones: OpcionVariante[]
}

/**
 * El precio con el que anunciar un servicio en el catalogo.
 *
 * Con variantes no hay un precio unico, asi que se muestra el mas bajo como
 * "desde". Se calcula aqui y no en cada vista para que el catalogo, el detalle y
 * el flujo de reserva no puedan discrepar.
 */
export function precioDesde(servicio: Pick<Servicio, 'precioBase' | 'variantes'>): number {
  if (!servicio.variantes || servicio.variantes.opciones.length === 0) {
    return servicio.precioBase
  }
  return Math.min(...servicio.variantes.opciones.map((o) => o.precio))
}
