import type { CarruselesSitio, ContenidoSitio } from './contenido.types'

/** Topes de largo: evitan que un texto pegado por error rompa el diseño. */
export const MAX_TEXTO_CORTO = 120
export const MAX_TEXTO_LARGO = 600
export const MAX_ANUNCIOS = 10
/** Fotos por carrusel: mas no se ven en una visita y cada URL pesa en el JSON. */
export const MAX_FOTOS_CARRUSEL = 30

type Plano = Record<string, unknown>

const esObjeto = (v: unknown): v is Plano => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Mezcla lo guardado sobre el valor por defecto, campo por campo.
 *
 * La regla: se toma lo guardado solo si tiene el MISMO tipo que el defecto
 * (texto con texto, lista con lista). Asi una fila vieja, a la que le faltan
 * campos agregados despues, o un valor mal escrito a mano en la base, no
 * rompen la pagina: ese campo cae al texto original y el resto se respeta.
 */
export function mezclarContenido<T>(defecto: T, guardado: unknown): T {
  if (guardado === undefined || guardado === null) return defecto

  if (Array.isArray(defecto)) {
    if (!Array.isArray(guardado)) return defecto
    // Listas de textos o de objetos: cada elemento se valida contra la forma
    // del primero del defecto. Una lista vacia guardada es valida (p. ej. sin
    // anuncios); una lista vacia por defecto acepta lo guardado tal cual.
    const modelo = defecto[0]
    if (modelo === undefined) return guardado as T
    return guardado.map((item) => mezclarContenido(modelo, item)) as T
  }

  if (esObjeto(defecto)) {
    if (!esObjeto(guardado)) return defecto
    const resultado: Plano = { ...defecto }
    for (const clave of Object.keys(defecto)) {
      resultado[clave] = mezclarContenido((defecto as Plano)[clave], guardado[clave])
    }
    return resultado as T
  }

  // Hojas: textos y URL. Una imagen por defecto puede ser null y aceptar texto.
  if (defecto === null) return (typeof guardado === 'string' ? guardado : null) as T
  return (typeof guardado === typeof defecto ? guardado : defecto) as T
}

/**
 * `analisis` es un mapa por id de opcion: no se mezcla con `mezclarContenido`
 * porque sus claves no estan fijas en el tipo. Solo se aceptan los ids que ya
 * existen en el defecto; un id desconocido no tiene a donde mostrarse.
 */
export function mezclarAnalisis(
  defecto: ContenidoSitio['analisis'],
  guardado: unknown,
): ContenidoSitio['analisis'] {
  if (!esObjeto(guardado)) return defecto
  const resultado: ContenidoSitio['analisis'] = {}
  for (const [id, opcion] of Object.entries(defecto)) {
    resultado[id] = mezclarContenido(opcion, guardado[id])
  }
  return resultado
}

/**
 * Lo guardado en la base -> contenido completo y seguro de mostrar.
 *
 * `imagenPermitida` decide de que origenes se aceptan fotos. Una URL de otro
 * sitio en la portada haria que cada visitante le avisara a ese servidor que
 * entro (IP, navegador): se vuelve a la foto original.
 */
export function contenidoDesdeGuardado(
  defecto: ContenidoSitio,
  guardado: unknown,
  imagenPermitida: (url: string) => boolean = () => true,
): ContenidoSitio {
  const base = mezclarContenido(defecto, guardado)
  // En las fotos un `null` guardado SI cuenta: es "Quitar foto". La mezcla
  // general lo trataria como "falta" y volveria a la original.
  const fotosGuardadas = esObjeto(guardado) && esObjeto(guardado.imagenes) ? guardado.imagenes : {}
  const imagenes = { ...base.imagenes }
  for (const clave of Object.keys(imagenes) as (keyof typeof imagenes)[]) {
    if (fotosGuardadas[clave] === null) {
      imagenes[clave] = null
      continue
    }
    const url = imagenes[clave]
    if (url !== null && !imagenPermitida(url)) imagenes[clave] = defecto.imagenes[clave]
  }
  return {
    ...base,
    imagenes,
    carruseles: mezclarCarruseles(defecto.carruseles, esObjeto(guardado) ? guardado.carruseles : undefined, imagenPermitida),
    analisis: mezclarAnalisis(defecto.analisis, esObjeto(guardado) ? guardado.analisis : undefined),
  }
}

/**
 * Cada carrusel guardado se respeta tal cual (tambien vacio), quitando lo que
 * no sea texto o venga de un origen no permitido. No pasa por
 * `mezclarContenido`: esa cambiaria un elemento invalido por la primera foto
 * del defecto, y la foto saldria repetida.
 */
function mezclarCarruseles(
  defecto: CarruselesSitio,
  guardado: unknown,
  imagenPermitida: (url: string) => boolean,
): CarruselesSitio {
  const guardados = esObjeto(guardado) ? guardado : {}
  const lista = (clave: keyof CarruselesSitio): string[] => {
    const valor = guardados[clave]
    if (!Array.isArray(valor)) return defecto[clave]
    return valor.filter((url): url is string => typeof url === 'string' && imagenPermitida(url))
  }
  return { estudio: lista('estudio'), tienda: lista('tienda') }
}

/** Correo simple, sin parametros: `?bcc=` en un mailto copiaria a terceros. */
export function esCorreoSimple(correo: string): boolean {
  return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(correo)
}

/**
 * Fotos del propio sitio bajo `/carrusel/`. Lista blanca de caracteres en vez
 * de buscar lo prohibido: asi quedan fuera `//otro.com` (otro origen), `..` y
 * su forma codificada `%2e%2e`, esquemas y parametros.
 */
const RUTA_LOCAL = /^\/carrusel\/(?:[\w-]+\/)*[\w-]+\.(?:jpe?g|png|webp|avif)$/i

/**
 * Origenes de foto aceptados: el bucket del proyecto, Unsplash y las fotos locales del carrusel.
 *
 * Las remotas se comparan ya normalizadas por `URL`, que es lo que pide el
 * navegador: `contenido/../otro/x.jpg` (o `%2e%2e`, o con tabuladores en
 * medio) prefija bien como texto pero se resuelve fuera del bucket. Ademas se
 * rechaza `%2e`, `%2f` y `%5c` que sobrevivan en la ruta: el navegador no los
 * toca, pero un servidor o CDN que los decodifique si los trataria como `.`, `/`
 * y `\`. Unsplash lleva parametros, por eso aqui no sirve una lista blanca de
 * caracteres como en `RUTA_LOCAL`.
 */
export function crearFiltroImagenes(urlSupabase: string): (url: string) => boolean {
  const origenes = [`${urlSupabase.replace(/\/$/, '')}/storage/v1/object/public/contenido/`, 'https://images.unsplash.com/']
  const remotaPermitida = (url: string) => {
    if (!URL.canParse(url)) return false
    const { href, pathname } = new URL(url)
    return origenes.some((o) => href.startsWith(o)) && !/%2e|%2f|%5c/i.test(pathname)
  }
  return (url) => RUTA_LOCAL.test(url) || remotaPermitida(url)
}

export interface Fragmento {
  texto: string
  enfasis: boolean
  /** Salto de linea antes de este fragmento. */
  salto: boolean
}

/**
 * "Belleza en el estudio, *cuidado* en casa" -> fragmentos con y sin enfasis.
 * Los saltos de linea se conservan. Un asterisco sin pareja se muestra tal cual.
 */
export function fragmentosConEnfasis(texto: string): Fragmento[] {
  const fragmentos: Fragmento[] = []
  texto.split('\n').forEach((linea, nLinea) => {
    const partes = linea.split('*')
    // Con un numero par de partes hay un asterisco suelto: no hay enfasis.
    const balanceado = partes.length % 2 === 1
    let primero = true
    if (!balanceado) {
      fragmentos.push({ texto: linea, enfasis: false, salto: nLinea > 0 })
      return
    }
    partes.forEach((parte, i) => {
      if (!parte) return
      fragmentos.push({ texto: parte, enfasis: i % 2 === 1, salto: nLinea > 0 && primero })
      primero = false
    })
  })
  return fragmentos
}

/** Motivo para no guardar, o `null`. Solo topes de largo y listas no vacias donde importa. */
export function motivoParaNoGuardarContenido(c: ContenidoSitio): string | null {
  const textos: [string, string, number][] = [
    ['El título de la portada', c.portada.titulo, MAX_TEXTO_CORTO],
    ['La descripción de la portada', c.portada.descripcion, MAX_TEXTO_LARGO],
    ['La cita del inicio de sesión', c.login.cita, MAX_TEXTO_LARGO],
  ]
  for (const [nombre, valor, max] of textos) {
    if (!valor.trim()) return `${nombre} no puede quedar vacío.`
    if (valor.length > max) return `${nombre} supera los ${max} caracteres.`
  }
  if (c.anuncios.length > MAX_ANUNCIOS) return `La barra admite hasta ${MAX_ANUNCIOS} anuncios.`
  if (c.anuncios.some((a) => a.length > MAX_TEXTO_CORTO)) {
    return `Cada anuncio admite hasta ${MAX_TEXTO_CORTO} caracteres.`
  }
  if (c.carruseles.estudio.length > MAX_FOTOS_CARRUSEL || c.carruseles.tienda.length > MAX_FOTOS_CARRUSEL) {
    return `Cada carrusel admite hasta ${MAX_FOTOS_CARRUSEL} fotos.`
  }
  return null
}
