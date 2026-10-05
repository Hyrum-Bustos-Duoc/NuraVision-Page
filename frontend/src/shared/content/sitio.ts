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
 * Las imagenes son opcionales: un hueco sin imagen muestra su marcador a
 * rayas. Las de la portada son fotos de Unsplash (licencia libre, uso
 * comercial sin atribucion) mientras el estudio no tenga fotos propias;
 * cambiarlas es reemplazar el id de la foto aqui.
 */
const UNSPLASH = 'https://images.unsplash.com'

/** Recorte en el CDN de Unsplash: el ancho cubre pantallas retina. */
function fotoUnsplash(id: string, ancho: number): string {
  return `${UNSPLASH}/${id}?auto=format&fit=crop&w=${ancho}&q=80`
}

export const CONTENIDO_SITIO: SiteContent = {
  // Salon en tonos beige con espejos en arco.
  heroImage: fotoUnsplash('photo-1706629505300-168aa1604912', 700),
  // Repisas minimalistas con productos de cuidado.
  shopImage: fotoUnsplash('photo-1760862652442-e8ff7ebdd2f8', 700),
  // Mano con manicura nude: la foto de ejemplo de la banda de NuraVision IA.
  aiTeaserImage: fotoUnsplash('photo-1610992015762-45dca7fa3a85', 1000),
  // Recepcion con flores secas: el panel derecho del login, a media pantalla.
  loginImage: fotoUnsplash('photo-1695527082039-5f96003b97e4', 1200),
  heroCaption: 'Fotografía · Salón / interior',
  aiTeaserCaption: 'Detalle · Manos y uñas',
  aiFocusOptions: [
    {
      id: 'manos',
      label: 'Manos y uñas',
      analysisLabel: 'manos y uñas',
      recommendedServiceIds: ['manicure-ritual-nura', 'unas-esculpidas', 'pedicure-spa'],
      productosRecomendados: ['aceite-de-cuticula-nura', 'crema-de-manos-reparadora', 'kit-ritual-manos'],
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
      productosRecomendados: ['gel-limpiador-suave', 'protector-solar-fps-50'],
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
      productosRecomendados: ['serum-cuero-cabelludo', 'champu-reconstructor', 'mascarilla-reparacion-profunda'],
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
