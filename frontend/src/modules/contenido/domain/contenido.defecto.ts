import { CONTENIDO_SITIO } from '@/shared/content/sitio'
import type { ContenidoSitio } from './contenido.types'

/**
 * El contenido tal como estaba escrito en el codigo antes de volverse editable.
 *
 * Es el respaldo de todo: lo que falte o venga mal en la base se toma de aqui,
 * y "Restaurar original" en el panel vuelve a esto.
 */
export const CONTENIDO_POR_DEFECTO: ContenidoSitio = {
  anuncios: [
    'Retiro en Estudio inmediato',
    'Servicios hechos por Profesionales',
    'Agenda en línea 24/7',
    'Nuria: Tu asistente IA',
    'Análisis IA para tu comodidad',
  ],
  imagenes: {
    portadaEstudio: CONTENIDO_SITIO.heroImage ?? null,
    portadaTienda: CONTENIDO_SITIO.shopImage ?? null,
    bandaIA: CONTENIDO_SITIO.aiTeaserImage ?? null,
    login: CONTENIDO_SITIO.loginImage ?? null,
  },
  portada: {
    etiqueta: 'Estudio de belleza · Tienda de cuidado',
    titulo: 'Belleza en el estudio, *cuidado* en casa',
    descripcion:
      'Reserva con nuestras profesionales o lleva a casa los mismos productos que usamos en cada ritual. Y si no sabes por dónde empezar, NuraVision analiza una fotografía y te orienta en ambos.',
    botonReservar: 'Reservar servicio',
    botonTienda: 'Comprar productos',
    tarjetaEstudio: { eyebrow: 'El estudio', titulo: 'Servicios con hora en línea', enlace: 'Ver servicios →' },
    tarjetaTienda: { eyebrow: 'La tienda', titulo: 'Lo que usamos, para tu casa', enlace: 'Ver tienda →' },
  },
  servicios: { eyebrow: 'Servicios destacados', titulo: 'Cuidado que se nota', enlace: 'Ver catálogo completo →' },
  tienda: {
    eyebrow: 'Tienda Nura',
    titulo: 'El ritual continúa en casa',
    enlace: 'Ver toda la tienda →',
    entregas: [
      { titulo: 'Despacho en 24–72 h', detalle: 'Gratis sobre $40.000 en Viña del Mar y Valparaíso' },
      { titulo: 'Retiro en el estudio', detalle: 'Listo en 2 horas, sin costo' },
      { titulo: 'Entrega en tu cita', detalle: 'Te lo dejamos listo para tu próxima reserva' },
    ],
  },
  bandaIA: {
    eyebrow: 'NuraVision IA · análisis con IA',
    titulo: 'Una foto.\nTu rutina *completa*.',
    pasos: [
      { titulo: 'Elige qué mirar', detalle: 'Manos, piel, cabello o cuero cabelludo.' },
      { titulo: 'Sube una foto', detalle: 'Con luz natural. La analizamos en segundos.' },
      { titulo: 'Recibe tu rutina', detalle: 'Un servicio en el estudio y productos para casa.' },
    ],
    hallazgos: ['Hidratación baja', 'Cutícula irregular', 'Borde libre con descamación'],
    boton: 'Probar el análisis',
    aviso: 'Orientación estética · no es diagnóstico médico',
  },
  comoFunciona: {
    titulo: 'Cómo funciona',
    pasos: [
      { titulo: 'Elige tu servicio', detalle: 'Explora el catálogo con duración y precio a la vista.' },
      { titulo: 'Elige profesional', detalle: 'Solo verás a quienes realizan ese servicio.' },
      { titulo: 'Selecciona horario', detalle: 'Únicamente los bloques realmente disponibles.' },
      { titulo: 'Confirma', detalle: 'Revisa el resumen y recibe tu confirmación al instante.' },
    ],
  },
  equipo: { eyebrow: 'El equipo', titulo: 'Quién te atiende', enlace: 'Ver profesionales →' },
  ctaFinal: {
    titulo: 'Tu hora te está esperando',
    descripcion: 'Agenda en línea, confirma al instante y recibe tu recordatorio.',
    boton: 'Reservar ahora',
  },
  login: {
    cita: '"Reservar dejó de ser una conversación de WhatsApp."',
    firma: 'Estudio Nura · Viña del Mar',
  },
  footer: {
    newsletterTitulo: 'Mantente actualizado y no te pierdas de nada!',
    newsletterDestacado: '',
    direccion: 'Estudio Nura · Av. Libertad 1250, Viña del Mar',
    horario: 'Martes a sábado · 10:00–19:00',
    telefono: '+56 9 1234 5678',
    email: 'hola@estudionura.cl',
  },
  analisis: Object.fromEntries(
    CONTENIDO_SITIO.aiFocusOptions.map((o) => [
      o.id,
      { label: o.label, tips: o.tips.map((t) => ({ titulo: t.title, detalle: t.description })) },
    ]),
  ),
}
