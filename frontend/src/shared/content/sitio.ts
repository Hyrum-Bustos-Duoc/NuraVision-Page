import type { SiteContent } from '@/shared/types'

/**
 * Contenido editorial del sitio.
 *
 * Vive aqui, versionado, y no en la base: son textos de la interfaz —no datos
 * de negocio—, y cambiarlos es un commit que pasa por revision como cualquier
 * otro. Una tabla de una sola fila para esto habria pedido migracion, RLS y un
 * modulo entero a cambio de nada.
 *
 * Antes salia de `seed.ts` a traves de `useAppState`, lo que tenia un efecto
 * que no se buscaba: en modo "solo Supabase" el estado se vaciaba entero y con
 * el se iban tambien estos textos, asi que la portada perdia el pie de la foto
 * y el analisis de IA se quedaba sin sus opciones de enfoque.
 *
 * Las imagenes (`heroImage`, `aiTeaserImage`, `loginImage`) siguen siendo
 * opcionales y no se declaran: hasta que exista una columna para ellas, cada
 * hueco muestra su marcador.
 */
export const CONTENIDO_SITIO: SiteContent = {
  heroCaption: 'Fotografía · Salón / interior',
  aiTeaserCaption: 'Detalle · Manos y uñas',
  aiFocusOptions: [
    {
      id: 'manos',
      label: 'Manos y uñas',
      analysisLabel: 'manos y uñas',
      recommendedServiceIds: ['manicure-ritual-nura', 'unas-esculpidas', 'pedicure-spa'],
      tips: [
        {
          id: 'manos-luz',
          title: 'Luz natural',
          description: 'Cerca de una ventana, sin flash directo.',
        },
        {
          id: 'manos-fondo',
          title: 'Fondo neutro',
          description: 'Una superficie lisa y clara funciona mejor.',
        },
        {
          id: 'manos-encuadre',
          title: 'Encuadre completo',
          description: 'Que se vean las cuatro uñas y el borde libre.',
        },
        {
          id: 'manos-esmalte',
          title: 'Sin esmalte',
          description: 'Si es posible, retíralo antes de fotografiar.',
        },
      ],
    },
    {
      id: 'piel',
      label: 'Tono de piel',
      analysisLabel: 'tono de piel',
      recommendedServiceIds: ['limpieza-facial-profunda'],
      tips: [
        {
          id: 'piel-luz',
          title: 'Luz natural',
          description: 'De día y de frente, sin filtros ni flash.',
        },
        {
          id: 'piel-maquillaje',
          title: 'Sin maquillaje',
          description: 'La piel limpia entrega una lectura más fiel.',
        },
        {
          id: 'piel-encuadre',
          title: 'Rostro completo',
          description: 'Toma frontal, con el rostro dentro del cuadro.',
        },
        {
          id: 'piel-fondo',
          title: 'Fondo neutro',
          description: 'Una pared clara evita reflejos de color.',
        },
      ],
    },
    {
      id: 'cuero',
      label: 'Cuero cabelludo',
      analysisLabel: 'cuero cabelludo',
      recommendedServiceIds: ['diagnostico-capilar', 'tratamiento-capilar-reconstructivo'],
      tips: [
        {
          id: 'cuero-luz',
          title: 'Luz natural',
          description: 'Junto a una ventana, sin sombras sobre la cabeza.',
        },
        {
          id: 'cuero-raiz',
          title: 'Raíz visible',
          description: 'Separa el cabello para que se vea el cuero cabelludo.',
        },
        {
          id: 'cuero-seco',
          title: 'Cabello seco',
          description: 'Sin productos ni humedad al momento de la foto.',
        },
        {
          id: 'cuero-tomas',
          title: 'Varias tomas',
          description: 'Una de la raíz y otra de los largos ayuda mucho.',
        },
      ],
    },
  ],
}
