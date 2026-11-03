import type { IndicadoresRepository } from '../domain/indicadores.repository'
import { problemaDelRango } from '../domain/indicadores.reglas'
import type { Indicadores, RangoFechas } from '../domain/indicadores.types'

/**
 * Indicadores del estudio para el rango.
 *
 * Un rango invalido no sale a la red: la base lo rechazaria igual (22023), y
 * asi el aviso es el mismo que ya muestra la pantalla.
 */
export async function obtenerIndicadores(
  repo: IndicadoresRepository,
  rango: RangoFechas,
): Promise<Indicadores> {
  const problema = problemaDelRango(rango)
  if (problema) throw new Error(problema)
  return repo.obtener(rango)
}
