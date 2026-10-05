/** Punto de entrada de la capa de aplicacion del modulo contenido. */
export { CONTENIDO_POR_DEFECTO } from '../domain/contenido.defecto'
export {
  contenidoDesdeGuardado,
  crearFiltroImagenes,
  esCorreoSimple,
  fragmentosConEnfasis,
  motivoParaNoGuardarContenido,
  MAX_ANUNCIOS,
  MAX_TEXTO_CORTO,
  MAX_TEXTO_LARGO,
} from '../domain/contenido.reglas'
export type { Fragmento } from '../domain/contenido.reglas'
export type { ClaveImagen, ContenidoSitio, Enlace, Paso } from '../domain/contenido.types'
export type { ContenidoRepository, ContenidoGuardado } from '../domain/contenido.repository'
