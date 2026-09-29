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
  return null
}
