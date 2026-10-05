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

/** Contenedor de las paginas de los paneles (admin y profesional). */
export const contenedorPanel = 'mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10'

/**
 * Controles de los filtros y barras de herramientas de los paneles: misma
 * altura (40px), pildora, borde de linea y foco en el acento. Asi un buscador,
 * un desplegable y un boton puestos en fila quedan alineados.
 */
export const controlFiltro =
  'h-10 rounded-full border border-line bg-paper text-sm text-ink transition-[border-color,box-shadow,background-color] hover:border-muted-light focus-visible:border-olive-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive-600/20 disabled:cursor-not-allowed disabled:opacity-50'

/** Tablas de los paneles. */
export const tabla = {
  contenedor: 'overflow-x-auto rounded-2xl border border-line-soft bg-paper',
  cabecera: 'border-b border-line-soft bg-ivory/60',
  th: 'whitespace-nowrap px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-[0.1em] text-muted',
  td: 'px-5 py-4 align-middle',
  fila: 'transition-colors hover:bg-ivory/50',
} as const

/** Acciones dentro de una fila de tabla: "Editar", "Eliminar". */
export const botonFila = {
  normal:
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-muted-light hover:bg-ivory active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
  peligro:
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:border-danger/40 hover:bg-danger-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
} as const
