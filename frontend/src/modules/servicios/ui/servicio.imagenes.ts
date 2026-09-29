import type { ServiceCategoryId } from '@/shared/types'
import { normalizarTexto } from '@/shared/lib/texto'

/**
 * Imagen de cada servicio del catalogo.
 *
 * Mientras la tabla `servicios` no tenga columna de imagen, las tarjetas
 * caerian en el marcador a rayas. Esto las llena sin tocar el esquema.
 *
 * ----------------------------------------------------------------------------
 * POR QUE SE EMPAREJA POR PALABRAS Y NO POR NOMBRE EXACTO
 * ----------------------------------------------------------------------------
 * La primera version usaba un mapa de nombre exacto -> imagen. Duro hasta la
 * primera vez que el estudio edito el catalogo: renombrar "Corte de Pelo" a
 * "Corte de Pelo Mujer" o partir "Cejas y Pestañas" en dos servicios basto
 * para que 8 de 17 servicios dejaran de encontrar su imagen y cayeran todos en
 * la generica de su categoria. El resultado en pantalla eran cuatro tarjetas
 * con la misma foto de un salon vacio.
 *
 * Y lo peor no fue el fallo, sino que fue SILENCIOSO: cada servicio seguia
 * mostrando una imagen, solo que la equivocada.
 *
 * Por eso ahora se busca por palabras dentro del nombre. Un servicio que se
 * llame "Cejas", "Arreglo de cejas" o "Diseño de cejas con henna" cae en la
 * misma regla, y una errata como "Extenciones" (que es como esta escrito hoy
 * en la base) tampoco lo rompe.
 *
 * Cuando `servicios` tenga su propia columna de imagen, este archivo se borra
 * y la URL pasa a venir de la base.
 */

const BASE = 'https://images.unsplash.com'

/** Recorte y compresion iguales para todas: 600px basta para una tarjeta. */
const PARAMS = 'auto=format&fit=crop&w=600&q=80'

function foto(id: string): string {
  return `${BASE}/${id}?${PARAMS}`
}

/**
 * Reglas de emparejamiento, EN ORDEN: gana la primera que coincida.
 *
 * El orden es parte de la logica, no un detalle de estilo. "Esmaltado
 * permanente" tiene que probarse antes que "esmaltado" a secas, y los alisados
 * concretos antes que el alisado generico; al reves, la regla amplia se
 * tragaria a la especifica y la de abajo no se evaluaria nunca.
 *
 * Los patrones se comparan contra el nombre YA normalizado, asi que se
 * escriben sin tildes.
 */
const REGLAS: { patron: RegExp; foto: string }[] = [
  // --- Estetica ---
  // La mirada marcada va en pestanas; en cejas va el trabajo sobre el rostro.
  // El retrato tiene unos labios rojos muy prominentes y en una tarjeta de
  // cejas lo primero que se lee son ellos: es justo el fallo que se reporto.
  // Antes que nada lo que lleva "pestanas": un servicio de cejas Y pestañas
  // deberia ilustrarse con la mirada completa.
  { patron: /pestana|lifting/, foto: foto('photo-1616683693504-3ea7e9ad6fec') },
  { patron: /\bceja/, foto: foto('photo-1570172619644-dfd03ed5d881') },
  { patron: /maquillaje|make ?up/, foto: foto('photo-1571875257727-256c39da42af') },
  { patron: /depilaci|depilado|cera\b/, foto: foto('photo-1519823551278-64ac92734fb1') },
  { patron: /facial|limpieza de cutis/, foto: foto('photo-1616394584738-fc6e612e71b9') },

  // --- Uñas ---
  // Las extensiones van antes que el esmaltado: "Extenciones Softgel" no lleva
  // la palabra esmaltado, pero si apareciera un "Esmaltado sobre extension",
  // la foto que corresponde es la de la extension.
  { patron: /softgel|soft gel|gel ?x/, foto: foto('photo-1607779097040-26e80aa78e66') },
  { patron: /poligel|poly ?gel|acrilic|esculpid|extenci|extension/, foto: foto('photo-1519014816548-bf5fe059798b') },
  { patron: /esmaltado permanente|semipermanente|gel/, foto: foto('photo-1604654894610-df63bc536371') },
  { patron: /esmaltado|esmalte/, foto: foto('photo-1610992015732-2449b76344bc') },
  { patron: /manicur|pedicur|\bunas?\b/, foto: foto('photo-1632345031435-8727f6897d53') },

  // --- Cabello ---
  { patron: /keratina|queratina|botox capilar/, foto: foto('photo-1554519934-e32b1629d9ee') },
  // Cada alisado con su propia foto: son tres servicios distintos y con una
  // sola regla generica las tres tarjetas salian identicas.
  { patron: /organic/, foto: foto('photo-1522337360788-8b13dee7a37e') },
  { patron: /fotonic|alisad|liso|planchad/, foto: foto('photo-1522338140262-f46f5913618a') },
  { patron: /coloraci|tinte|mechas|balayage|iluminaci/, foto: foto('photo-1634449571010-02389ed0f9b0') },
  { patron: /tratamiento|hidrataci|nutric|botox/, foto: foto('photo-1595476108010-b4d1f102b1b1') },
  { patron: /brushing|secado|blower/, foto: foto('photo-1519699047748-de8e457a634e') },
  { patron: /peinad|reco?gido|ondas|trenza/, foto: foto('photo-1560869713-7d0a29430803') },
  { patron: /corte|flequillo|puntas/, foto: foto('photo-1562322140-8baeececf3df') },
]

/**
 * Respaldo por categoria, para un servicio cuyo nombre no active ninguna regla.
 *
 * Son imagenes deliberadamente genericas: representan el area, no un servicio
 * concreto, porque no se sabe cual va a caer aqui.
 */
const POR_CATEGORIA: Record<ServiceCategoryId, string> = {
  unas: foto('photo-1632345031435-8727f6897d53'),
  cabello: foto('photo-1633681926022-84c23e8cb2d6'),
  piel: foto('photo-1616394584738-fc6e612e71b9'),
  diagnostico: foto('photo-1560750588-73207b1ef5b8'),
}

/** Ultimo recurso: una imagen neutra del estudio. */
export const IMAGEN_POR_DEFECTO = foto('photo-1560750588-73207b1ef5b8')

/**
 * Devuelve la imagen de un servicio.
 *
 * Nunca devuelve undefined: siempre hay algo que pintar. Esa es la diferencia
 * con dejarlo en manos de `AppImage`, que caeria en el marcador a rayas.
 *
 * Tres niveles, del mas especifico al mas general:
 *   1. la primera regla cuyo patron aparezca en el nombre,
 *   2. la categoria,
 *   3. la imagen por defecto.
 */
export function imagenDeServicio(nombre: string, categoria?: ServiceCategoryId): string {
  const limpio = normalizarTexto(nombre)

  const regla = REGLAS.find(({ patron }) => patron.test(limpio))
  if (regla) return regla.foto

  if (categoria) {
    const porCategoria = POR_CATEGORIA[categoria]
    if (porCategoria) return porCategoria
  }

  return IMAGEN_POR_DEFECTO
}

/**
 * La foto de un servicio, con la de la base por delante.
 *
 * Desde 0010 `servicios` tiene columna `imagen_url`, asi que el estudio puede
 * cargar la suya desde el panel. Cuando existe, manda: las reglas de `REGLAS`
 * adivinan a partir del nombre y por buenas que sean siguen siendo una
 * suposicion sobre el contenido de una foto.
 *
 * Sin columna cargada se cae al camino de siempre, que nunca deja un hueco.
 * Por eso esta funcion —y no `imagenDeServicio`— es la que deberian usar las
 * vistas que tienen la entidad completa a mano.
 */
export function fotoDeServicio(servicio: {
  nombre: string
  categoria: ServiceCategoryId
  imagenUrl: string | null
}): string {
  return servicio.imagenUrl ?? imagenDeServicio(servicio.nombre, servicio.categoria)
}
