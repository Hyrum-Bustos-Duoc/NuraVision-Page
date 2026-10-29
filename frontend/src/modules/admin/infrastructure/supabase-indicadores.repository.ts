import { supabase } from '@/shared/infrastructure/supabase/client'
import type { IndicadoresRepository } from '../domain/indicadores.repository'
import type { Indicadores, RangoFechas } from '../domain/indicadores.types'
import { toIndicadores } from './indicadores.mapper'

/**
 * Sin permiso. El texto nombra la causa probable que no es un fallo del
 * codigo: `es_staff` viaja en el token, que solo se renueva al iniciar sesion.
 */
const SIN_PERMISO =
  'Solo el personal del estudio puede ver los indicadores. Si acaban de darte ' +
  'permisos de personal, cierra sesión y vuelve a entrar.'

/** Implementacion de `IndicadoresRepository` sobre `indicadores_panel` (0022). */
class SupabaseIndicadoresRepository implements IndicadoresRepository {
  async obtener(rango: RangoFechas): Promise<Indicadores> {
    const { data, error } = await supabase.rpc('indicadores_panel', {
      p_desde: rango.desde,
      p_hasta: rango.hasta,
    })

    if (error) {
      if (error.code === '42501') throw new Error(SIN_PERMISO)
      if (error.code === '22023') throw new Error('El rango de fechas no es válido.')
      // La funcion no existe: falta aplicar la migracion en esta base.
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error(
          'Los indicadores todavía no están disponibles en esta base: falta aplicar 0022_indicadores_panel.sql.',
        )
      }
      throw new Error(`No se pudieron cargar los indicadores: ${error.message}`)
    }

    // Sin error y sin cuerpo no deberia ocurrir; pintar ceros seria mentir.
    if (!data) throw new Error('La base no devolvió los indicadores.')

    return toIndicadores(data)
  }
}

export const indicadoresRepository: IndicadoresRepository = new SupabaseIndicadoresRepository()
