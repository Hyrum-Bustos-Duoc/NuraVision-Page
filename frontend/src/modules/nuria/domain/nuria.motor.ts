import type { ContextoNuria, RespuestaNuria } from './nuria.types'

/**
 * Motor de intenciones de Nuria por palabras clave (spec §12.3).
 *
 * Es una funcion pura: recibe el texto y el contexto, devuelve la respuesta. No
 * toca el carrito ni la navegacion; eso lo hace la interfaz con `agregar` y las
 * acciones. Asi se prueba sin React, y el dia que Nuria pase a un modelo real
 * (pendiente de la spec §16) solo cambia este archivo: las tarjetas de UI y las
 * herramientas (agregar, reservar) siguen siendo las mismas.
 */

export const MENSAJE_INICIAL: RespuestaNuria['mensaje'] = {
  texto:
    'Hola, soy Nuria. Te recomiendo productos, armo tu rutina y te dejo lista tu hora en el estudio, todo desde aquí. ¿Qué buscas hoy?',
  chips: ['Mis uñas se quiebran', 'Reservar una manicure', 'Rutina para cabello teñido', 'Busco un regalo'],
}

/** Prompts del hero y de la banda "Dile qué necesitas". */
export const PROMPTS_DESTACADOS = [
  'Mis uñas se quiebran, ¿qué uso?',
  'Reserva una manicure para mañana',
  'Arma mi rutina para piel sensible',
]

/** Preguntas de los links de Ayuda del footer. */
export const PREGUNTAS_AYUDA = {
  despacho: '¿Cómo son los despachos y retiros?',
  devoluciones: '¿Cómo son los cambios y devoluciones?',
  cancelacion: '¿Cuál es la política de cancelación?',
} as const

/** Minusculas y sin tildes: "Uñas" -> "unas". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

type Tema = 'unas' | 'cabello' | 'piel' | 'cuero' | 'regalo'

interface DefinicionTema {
  productos: string[]
  /** Patrones para encontrar el servicio sugerido en el catalogo real. */
  servicio: string[]
  texto: string
}

/**
 * Productos por tema, por slug (los de 0013). Si alguno no esta en el catalogo
 * se omite; si no queda ninguno, el tema responde sin carrusel.
 */
const TEMAS: Record<Tema, DefinicionTema> = {
  unas: {
    productos: ['aceite-de-cuticula-nura', 'crema-de-manos-reparadora', 'kit-ritual-manos'],
    servicio: ['manicur'],
    texto:
      'Para uñas que se quiebran y cutículas secas, esto es lo mismo que usamos en el estudio. El aceite es el que más se nota en una semana.',
  },
  cabello: {
    productos: ['champu-reconstructor', 'mascarilla-reparacion-profunda'],
    servicio: ['tratamiento capilar', 'capilar'],
    texto:
      'Para cabello teñido o procesado: una limpieza sin sulfatos y una mascarilla semanal. Si quieres un cambio real, el tratamiento en el estudio.',
  },
  piel: {
    productos: ['gel-limpiador-suave', 'protector-solar-fps-50'],
    servicio: ['facial', 'limpieza'],
    texto: 'Para piel sensible, menos es más: limpieza suave mañana y noche y protección diaria.',
  },
  cuero: {
    productos: ['serum-cuero-cabelludo'],
    servicio: ['diagnost', 'capilar'],
    texto:
      'Para el cuero cabelludo te sugiero partir con una evaluación en el estudio. Mientras tanto, este sérum ayuda a equilibrar.',
  },
  regalo: {
    productos: ['kit-ritual-manos', 'gift-card-estudio-nura'],
    servicio: [],
    texto: 'Dos regalos que siempre funcionan. La gift card sirve para servicios y productos.',
  },
}

/**
 * Palabras de la clienta -> patrones del nombre del servicio en la base. El
 * orden importa: "pedicure" antes que "manicure", "esculpidas" antes que uñas.
 */
const SERVICIOS: { claves: string[]; patrones: string[] }[] = [
  { claves: ['pedicure', 'pedicura'], patrones: ['pedicur'] },
  { claves: ['esculpid', 'poligel', 'softgel', 'acrilic'], patrones: ['esculp', 'poligel', 'softgel'] },
  { claves: ['manicure', 'manicura'], patrones: ['manicur'] },
  { claves: ['corte'], patrones: ['corte'] },
  { claves: ['color', 'tinte', 'tenir'], patrones: ['color'] },
  { claves: ['reconstru', 'tratamiento capilar', 'hidratacion capilar'], patrones: ['tratamiento capilar', 'capilar'] },
  { claves: ['facial', 'limpieza'], patrones: ['facial', 'limpieza'] },
  { claves: ['diagnost'], patrones: ['diagnost', 'capilar'] },
  { claves: ['ceja', 'microblading'], patrones: ['ceja'] },
  { claves: ['pestan', 'lifting'], patrones: ['pestan'] },
  { claves: ['depila'], patrones: ['depila'] },
  { claves: ['maquilla'], patrones: ['maquilla'] },
  { claves: ['alisado', 'keratina'], patrones: ['alisado'] },
  { claves: ['brushing'], patrones: ['brushing'] },
  { claves: ['peinado'], patrones: ['peinado'] },
]

/** Con limites de palabra: "hora" no debe cazar "ahora". */
const VERBOS_RESERVA = /\b(reserv\w*|horas?|citas?|agend\w*|turnos?)\b/

function contiene(texto: string, palabras: string[]): boolean {
  return palabras.some((p) => texto.includes(p))
}

function detectarTema(t: string): Tema | null {
  if (contiene(t, ['cuero', 'caspa'])) return 'cuero'
  if (contiene(t, ['cabello', 'pelo', 'champu', 'tenid', 'mascarilla', 'reconstru'])) return 'cabello'
  if (contiene(t, ['piel', 'facial', 'rostro', 'cara', 'solar', 'limpieza'])) return 'piel'
  if (contiene(t, ['unas', 'cuticula', 'manos', 'manicure', 'manicura', 'esmalte', 'pedicure', 'quiebra', 'esculpid'])) return 'unas'
  if (contiene(t, ['regalo', 'gift', 'cumple'])) return 'regalo'
  return null
}

function buscarServicio(contexto: ContextoNuria, patrones: string[]) {
  for (const patron of patrones) {
    const encontrado = contexto.servicios.find((s) => normalizar(s.nombre).includes(patron))
    if (encontrado) return encontrado
  }
  return undefined
}

function servicioPedido(t: string, contexto: ContextoNuria) {
  for (const definicion of SERVICIOS) {
    if (contiene(t, definicion.claves)) return buscarServicio(contexto, definicion.patrones)
  }
  return undefined
}

function mencionaServicio(t: string): boolean {
  return SERVICIOS.some((d) => contiene(t, d.claves))
}

function productosDisponibles(contexto: ContextoNuria, slugs: string[]): string[] {
  return slugs.filter((slug) => contexto.productos.some((p) => p.slug === slug))
}

export function responder(entrada: string, contexto: ContextoNuria): RespuestaNuria {
  const t = normalizar(entrada)
  const tema = detectarTema(t)
  const quiereReservar = VERBOS_RESERVA.test(t)

  // 1. Agregar todo
  if (contiene(t, ['agregar todo', 'agrega todo', 'todo al', 'los agrego'])) {
    const slugs = productosDisponibles(contexto, contexto.ultimaRecomendacion)
    if (slugs.length === 0) {
      return {
        mensaje: {
          texto: 'Aún no te he recomendado nada. Cuéntame qué necesitas.',
          chips: ['Mis uñas se quiebran', 'Busco un regalo'],
        },
      }
    }
    return {
      agregar: slugs,
      mensaje: {
        texto: `Listo, agregué ${slugs.length} ${slugs.length === 1 ? 'producto' : 'productos'} a tu carrito.`,
        acciones: ['ver-carrito', 'ir-a-pagar'],
        chips: ['¿Cómo es el despacho?', 'Reservar una hora'],
      },
    }
  }

  // 2. Carrito
  if (contiene(t, ['carrito', 'bolsa', 'pagar', 'checkout'])) {
    if (contexto.carrito.unidades === 0) {
      return {
        mensaje: {
          texto: 'Tu carrito está vacío por ahora. ¿Te ayudo a elegir?',
          chips: ['Mis uñas se quiebran', 'Rutina para piel sensible', 'Busco un regalo'],
        },
      }
    }
    const n = contexto.carrito.unidades
    return {
      mensaje: {
        texto: `Llevas ${n} ${n === 1 ? 'ítem' : 'ítems'} por ${contexto.carrito.totalTexto}. ¿Vamos al pago?`,
        acciones: ['ver-carrito', 'ir-a-pagar'],
      },
    }
  }

  // 3. Entrega
  if (contiene(t, ['envio', 'despacho', 'retiro', 'entrega', 'llega'])) {
    return {
      mensaje: {
        texto:
          'Tienes tres opciones: despacho en 24–72 h (gratis sobre $40.000 en Viña del Mar y Valparaíso), retiro gratis en el estudio en 2 horas, o te lo entregamos en tu próxima cita.',
        chips: ['Reservar una hora', 'Ver mi carrito'],
      },
    }
  }

  // 4. Devoluciones
  if (contiene(t, ['devolu', 'cambio de producto', 'cambios y'])) {
    return {
      mensaje: {
        texto:
          'Puedes cambiar o devolver productos sin abrir dentro de 10 días desde que los recibes. Escríbenos por WhatsApp o tráelos al estudio con tu número de pedido.',
        chips: ['¿Cómo es el despacho?', 'Ver mi carrito'],
      },
    }
  }

  // 5. Cancelacion
  if (contiene(t, ['cancel', 'reprogram', 'cambiar hora', 'cambiar mi hora'])) {
    return {
      mensaje: {
        texto:
          'Puedes cancelar o reprogramar sin costo hasta 12 horas antes de tu hora. Después de eso, el abono no es reembolsable.',
        chips: ['Reservar una hora'],
      },
    }
  }

  // 6. Reservar un servicio concreto
  // Si se nombro un servicio concreto, no se cambia por el del tema: pedir una
  // pedicure y recibir una manicure seria peor que decir que no la hay.
  const nombroServicio = mencionaServicio(t)
  const servicio = nombroServicio
    ? servicioPedido(t, contexto)
    : quiereReservar && tema
      ? buscarServicio(contexto, TEMAS[tema].servicio)
      : undefined
  if (servicio) {
    return {
      mensaje: {
        texto: `Perfecto. ${servicio.nombre} dura ${servicio.duracionMinutos} min y cuesta ${servicio.precioTexto}. Estas son las próximas horas libres:`,
        servicioId: servicio.id,
      },
    }
  }

  // El servicio se nombro pero no esta en el catalogo: decirlo, no inventarlo.
  if (nombroServicio && (quiereReservar || !tema)) {
    return {
      mensaje: {
        texto: 'No encontré ese servicio en nuestro catálogo actual. Puedes revisar todos los servicios disponibles.',
        acciones: ['ver-servicios'],
      },
    }
  }

  // 7. Reservar sin servicio
  if (quiereReservar) {
    return {
      mensaje: {
        texto: '¿Qué servicio quieres reservar?',
        chips: ['Reservar manicure', 'Reservar corte', 'Reservar tratamiento capilar', 'Reservar cejas'],
      },
    }
  }

  // 8. Tema -> productos
  if (tema) {
    const definicion = TEMAS[tema]
    const productos = productosDisponibles(contexto, definicion.productos)
    const sugerido = buscarServicio(contexto, definicion.servicio)
    const chips = productos.length > 0 ? ['Agregar todo al carrito'] : []
    if (sugerido) chips.push(`Reservar ${sugerido.nombre.toLowerCase()}`)
    chips.push('¿Cómo es el despacho?')
    return {
      recomendacion: productos,
      mensaje: { texto: definicion.texto, productos, chips },
    }
  }

  // 9. Saludo
  if (contiene(t, ['hola', 'buenas', 'hey'])) {
    return {
      mensaje: {
        texto: '¡Hola! ¿Buscas un producto, una hora en el estudio, o ambos?',
        chips: ['Mis uñas se quiebran', 'Reservar una manicure', 'Busco un regalo'],
      },
    }
  }

  // 10. Fallback
  return {
    mensaje: {
      texto:
        'Todavía estoy aprendiendo. Puedo ayudarte a elegir productos para uñas, cabello o piel, reservar un servicio o revisar tu carrito.',
      chips: ['Mis uñas se quiebran', 'Rutina para cabello teñido', 'Reservar una hora', 'Ver mi carrito'],
    },
  }
}

/** Upsell tras elegir horario (spec §12.4). */
export function respuestaUpsell(producto: { slug: string; nombre: string }): RespuestaNuria {
  return {
    recomendacion: [producto.slug],
    mensaje: {
      texto: `¿Te dejo listo el ${producto.nombre} para entregártelo en tu cita? Así mantienes el resultado en casa, sin despacho.`,
      productos: [producto.slug],
      paraLaCita: true,
      chips: ['No, gracias', 'Ir a pagar'],
    },
  }
}
