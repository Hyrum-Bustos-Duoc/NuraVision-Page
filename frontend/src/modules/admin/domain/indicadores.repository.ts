import type { Indicadores, RangoFechas } from './indicadores.types'

/**
 * Puerto de lectura de los indicadores del panel.
 *
 * Quien puede leerlos lo decide la base, no este archivo: la funcion rechaza
 * con error toda sesion que no sea de personal (`es_staff()`), en vez de
 * devolver agregados filtrados por la RLS de quien llama.
 */
export interface IndicadoresRepository {
  obtener(rango: RangoFechas): Promise<Indicadores>
}
