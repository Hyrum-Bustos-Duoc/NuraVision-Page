import type { ServiceCategoryId } from '@/shared/types'
import type { Json, Tables, TablesInsert } from '@/shared/types/supabase'
import { serviceCategories } from '../domain/serviceCategories'
import { normalizarTexto } from '@/shared/lib/texto'
import type {
  DatosServicio,
  OpcionVariante,
  Servicio,
  VarianteServicio,
} from '../domain/servicio.types'

export type ServicioRow = Tables<'servicios'>
export type ServicioInsert = TablesInsert<'servicios'>

/** Categoria que se asigna cuando la fila no trae una reconocible. */
const CATEGORIA_POR_DEFECTO: ServiceCategoryId = 'unas'

/**
 * Solo los sinonimos que NO son ya un id del dominio.
 *
 * `categoria` es texto libre en el esquema, asi que llega con la
 * nomenclatura que use quien carga los datos. Los ids canonicos
 * ('unas', 'cabello', 'piel', 'diagnostico') no se repiten aqui: se aceptan
 * leyendo `serviceCategories`, de modo que agregar una categoria al dominio
 * baste para que el mapper la reconozca y no haya que recordar esta tabla.
 *
 * Nota: 'diagnostico' NO se traduce a 'piel'. Es una categoria propia del
 * dominio y colapsarla dejaria los servicios de diagnostico etiquetados como
 * tratamientos de piel, que es otra cosa.
 */
const SINONIMOS: Record<string, ServiceCategoryId> = {
  manicure: 'unas',
  estilismo: 'cabello',
  estetica: 'piel',
}

/**
 * Texto de la base -> categoria del dominio.
 *
 * Nunca lanza: una categoria desconocida degrada al valor por defecto para no
 * tumbar el listado completo por una fila mal cargada. Queda un aviso en
 * consola porque el dato sigue estando mal y conviene que se note.
 */
function toCategoria(value: string | null | undefined, servicioId: number): ServiceCategoryId {
  if (!value) return CATEGORIA_POR_DEFECTO

  const normalizada = normalizarTexto(value)
  if (!normalizada) return CATEGORIA_POR_DEFECTO

  // Primero el catalogo del dominio, despues los sinonimos.
  const canonica = serviceCategories.find((categoria) => categoria.id === normalizada)
  if (canonica) return canonica.id

  const sinonimo = SINONIMOS[normalizada]
  if (sinonimo) return sinonimo

  const aceptados = [...serviceCategories.map((c) => c.id), ...Object.keys(SINONIMOS)].join(', ')
  console.warn(
    `[servicios] El servicio ${servicioId} tiene la categoria "${value}", que no se reconoce. ` +
      `Se usa "${CATEGORIA_POR_DEFECTO}". Valores aceptados: ${aceptados}.`,
  )
  return CATEGORIA_POR_DEFECTO
}

/** Fila de la base de datos -> entidad de dominio. */
export function toServicio(row: ServicioRow): Servicio {
  return {
    id: String(row.id),
    nombre: row.nombre,
    categoria: toCategoria(row.categoria, row.id),
    descripcion: row.descripcion ?? '',
    duracionMinutos: row.duracion_minutos,
    precioBase: row.precio_base,
    activo: row.activo,
    imagenUrl: row.imagen_url?.trim() ? row.imagen_url : null,
    descripcionLarga: row.descripcion_larga ?? '',
    incluye: aListaDeTextos(row.incluye),
    variantes: aVariante(row.variantes),
  }
}

/**
 * `variantes` -> la pregunta del servicio, o `null`.
 *
 * El check de 0011 garantiza la ESTRUCTURA —objeto, con pregunta y una lista de
 * opciones no vacia— pero NO la forma de cada opcion: eso serian varias lineas
 * de SQL por campo. Aqui se valida opcion por opcion y las incompletas se
 * descartan, en vez de dejar que una sin precio llegue a la pantalla y se
 * convierta en un `NaN` en el total.
 *
 * Si tras el filtrado no queda ninguna opcion valida, devuelve `null`: el
 * servicio se comporta como uno normal, con su `precioBase`. Es preferible a
 * mostrar una pregunta que no se puede responder.
 *
 * `?? null` cubre ademas la base donde 0011 no se aplico: la columna no existe y
 * llega `undefined`.
 */
function aVariante(valor: Json | null | undefined): VarianteServicio | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'object' || Array.isArray(valor)) return null

  const { pregunta, opciones } = valor as Record<string, unknown>
  if (typeof pregunta !== 'string' || pregunta.trim() === '') return null
  if (!Array.isArray(opciones)) return null

  const validas: OpcionVariante[] = []
  for (const item of opciones) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const { id, etiqueta, precio } = item as Record<string, unknown>

    // El precio tiene que ser un numero de verdad: un "15000" en texto sumaria
    // como cadena y el total saldria "015000".
    if (typeof precio !== 'number' || !Number.isFinite(precio) || precio < 0) continue
    if (typeof etiqueta !== 'string' || etiqueta.trim() === '') continue

    validas.push({
      // Sin id utilizable se usa la etiqueta: es lo que identifica la eleccion
      // en la reserva, y quedarse sin id la volveria imposible de guardar.
      id: typeof id === 'string' && id.trim() !== '' ? id.trim() : etiqueta.trim(),
      etiqueta: etiqueta.trim(),
      precio,
    })
  }

  if (validas.length === 0) return null

  return { pregunta: pregunta.trim(), opciones: validas }
}

/**
 * `incluye` -> lista de textos.
 *
 * La base garantiza que es una lista (check `servicios_incluye_es_lista`) pero NO
 * que sus elementos sean cadenas: es `jsonb` y ahi cabe cualquier cosa. Lo que no
 * sea texto con contenido se descarta, en vez de dejar que un numero o un objeto
 * llegue a la vista tipado como string.
 *
 * `?? []` cubre ademas la base donde 0010 no se aplico: la columna no existe,
 * llega `undefined`, y recorrerla lanzaria.
 */
function aListaDeTextos(valor: Json | undefined): string[] {
  if (!Array.isArray(valor)) return []
  return valor
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v !== '')
}

/**
 * Datos del panel -> fila para la base.
 *
 * `categoria` se guarda con el id canonico del dominio ('unas', 'cabello',
 * 'piel', 'diagnostico') y no con su etiqueta visible. La columna es texto libre
 * y ya conviven ahi las dos formas —el seed escribio 'Uñas', 'Estilismo'—, pero
 * escribir el id hace el viaje de vuelta exacto: `toCategoria` lo reconoce sin
 * pasar por la tabla de sinonimos, que es la parte que se puede quedar corta.
 *
 * `duracion_bloques` no se envia. Es una columna sin versionar cuyo significado
 * no esta documentado y los datos no aclaran (hay 120 minutos con 1 bloque), asi
 * que inventarle un valor seria peor que dejar el que tenga por defecto; 0010 le
 * asegura uno para que omitirla no rompa el alta.
 */
export function fromDatosServicio(datos: DatosServicio): ServicioInsert {
  return {
    nombre: datos.nombre.trim(),
    categoria: datos.categoria,
    // La columna admite null; una descripcion en blanco se guarda como null en
    // vez de como cadena vacia, para que no haya dos formas de decir "sin
    // descripcion" en la misma tabla.
    descripcion: datos.descripcion.trim() === '' ? null : datos.descripcion.trim(),
    duracion_minutos: datos.duracionMinutos,
    precio_base: datos.precioBase,
    activo: datos.activo,
    imagen_url: datos.imagenUrl?.trim() ? datos.imagenUrl.trim() : null,
    descripcion_larga:
      datos.descripcionLarga.trim() === '' ? null : datos.descripcionLarga.trim(),
    incluye: datos.incluye.map((i) => i.trim()).filter((i) => i !== ''),
    /**
     * Se envia `null` y no un objeto vacio cuando no hay variantes: el check de
     * 0011 rechazaria un objeto sin pregunta ni opciones, y null es lo que la
     * columna entiende por "este servicio no pregunta nada".
     *
     * Las opciones se limpian igual que al leerlas —misma exigencia en los dos
     * sentidos— para no guardar una que despues el mapper descartaria, que seria
     * una variante que desaparece sola tras recargar.
     */
    variantes: aFilaVariante(datos.variantes),
  }
}

function aFilaVariante(variante: VarianteServicio | null): Json | null {
  if (!variante) return null

  const opciones = variante.opciones
    .filter((o) => o.etiqueta.trim() !== '' && Number.isFinite(o.precio) && o.precio >= 0)
    .map((o) => ({
      id: o.id.trim() !== '' ? o.id.trim() : o.etiqueta.trim(),
      etiqueta: o.etiqueta.trim(),
      precio: o.precio,
    }))

  // Sin pregunta o sin opciones no es una variante a medias: es ninguna.
  if (variante.pregunta.trim() === '' || opciones.length === 0) return null

  return { pregunta: variante.pregunta.trim(), opciones }
}
