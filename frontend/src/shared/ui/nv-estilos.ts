/**
 * Clases de los botones del Diseño 1 (spec §4.1). Viven en un archivo sin
 * componentes para no romper el refresco en caliente (react/only-export-components).
 *
 * Todos son pildoras. El tamaño se agrega aparte con `tamanoBoton`.
 */
export const boton = {
  /** Tinta. Hover: acento. */
  primario: 'rounded-full bg-nv-ink text-nv-bg transition-colors hover:bg-nv-accent disabled:opacity-40 disabled:hover:bg-nv-ink',
  /** Acento. Hover: acento oscuro. "Pagar", "Probar el análisis". */
  acento: 'rounded-full bg-nv-accent text-nv-bg transition-colors hover:bg-nv-accent-dk disabled:opacity-40',
  /** Transparente con borde. Hover: papel. */
  secundario: 'rounded-full border border-nv-line3 text-nv-ink transition-colors hover:bg-nv-paper4 disabled:opacity-40',
  /** Sobre fondo oscuro, relleno claro. */
  claroSobreOscuro: 'rounded-full bg-nv-bg text-nv-ink transition-colors hover:bg-nv-accent-wash3',
  /** Sobre fondo oscuro, solo borde. */
  bordeSobreOscuro: 'rounded-full border border-nv-ink4 text-nv-tint3 transition-colors hover:border-nv-soft2',
} as const

export const tamanoBoton = {
  grande: 'px-[30px] py-[15px] text-[14.5px]',
  medio: 'px-5 py-3 text-[13.5px]',
  chico: 'px-4 py-2 text-[12.5px]',
} as const

/** Link subrayado: "Ver toda la tienda →". */
export const linkSubrayado =
  'border-b border-nv-accent-line2 pb-[3px] text-[13.5px] text-nv-accent transition-colors hover:border-nv-accent hover:text-nv-accent'

/** Contenedor de pagina: 1240px con 40px de lateral en escritorio. */
export const contenedor = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-10'
