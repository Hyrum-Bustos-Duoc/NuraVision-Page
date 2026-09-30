import type { DatosServicio } from './servicio.types'

/**
 * Se valida aqui, en el dominio, y no en el formulario.
 *
 * Asi la regla vale para cualquier via de escritura, no solo para la pantalla
 * que existe hoy. Y el mensaje explica el limite en vez de dejar que aparezca el
 * del constraint de Postgres, que nombra la restriccion y no lo que hay que
 * corregir.
 */
export function motivoParaNoGuardarServicio(datos: DatosServicio): string | null {
  if (datos.nombre.trim() === '') return 'El nombre del servicio es obligatorio.'

  if (!Number.isFinite(datos.duracionMinutos) || datos.duracionMinutos <= 0) {
    return 'La duración debe ser mayor que cero.'
  }
  // La agenda trabaja en tramos de 30 minutos; una duracion que no encaje
  // dejaria huecos imposibles de reservar.
  if (datos.duracionMinutos % 30 !== 0) {
    return 'La duración debe ser un múltiplo de 30 minutos.'
  }
  if (datos.duracionMinutos > 8 * 60) {
    return 'La duración no puede pasar de 8 horas.'
  }

  if (!Number.isFinite(datos.precioBase) || datos.precioBase < 0) {
    return 'El precio no puede ser negativo.'
  }

  return motivoParaNoGuardarVariantes(datos.variantes)
}

/**
 * Valida la pregunta del servicio, si tiene una.
 *
 * `null` es valido y es el caso normal: la mayoria de los servicios no pregunta
 * nada. Lo que no puede pasar es guardar una variante a medias, porque el flujo
 * de reserva la mostraria como un paso obligatorio sin salida.
 *
 * La base rechaza lo mismo (check `servicios_variantes_bien_formadas` de 0011),
 * pero su mensaje nombra la restriccion y no dice que corregir. Esto si.
 */
export function motivoParaNoGuardarVariantes(
  variantes: DatosServicio['variantes'],
): string | null {
  if (variantes === null) return null

  if (variantes.pregunta.trim() === '') {
    return 'Escribe la pregunta, o desactiva las variantes del servicio.'
  }
  if (variantes.opciones.length === 0) {
    return 'Agrega al menos una opción, o desactiva las variantes del servicio.'
  }
  if (variantes.opciones.some((o) => o.etiqueta.trim() === '')) {
    return 'Todas las opciones necesitan un nombre.'
  }
  if (variantes.opciones.some((o) => !Number.isFinite(o.precio) || o.precio < 0)) {
    return 'El precio de cada opción debe ser un número positivo.'
  }
  /**
   * Dos opciones con el mismo nombre no son invalidas para la base, pero si para
   * quien reserva: veria dos botones identicos con precios distintos y no
   * tendria como saber cual le corresponde.
   */
  const etiquetas = variantes.opciones.map((o) => o.etiqueta.trim().toLowerCase())
  if (new Set(etiquetas).size !== etiquetas.length) {
    return 'Hay dos opciones con el mismo nombre.'
  }
  return null
}
