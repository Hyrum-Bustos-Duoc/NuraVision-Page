import type { WeeklyAvailability } from '@/shared/types'
import { supabase } from '@/shared/infrastructure/supabase/client'
import type { Disponibilidad } from '../domain/disponibilidad.types'
import type { ProfesionalRepository } from '../domain/profesional.repository'
import type { DatosProfesional, Profesional } from '../domain/profesional.types'
import { fromWeeklyAvailability, toDisponibilidad } from './disponibilidad.mapper'
import { fromDatosProfesional, toProfesional } from './profesional.mapper'

const TABLA = 'profesionales'
const TABLA_PUENTE = 'profesional_servicios'
const TABLA_DISPONIBILIDAD = 'disponibilidad'

/** Los ids del dominio son string; las columnas son bigint. */
function aIdNumerico(id: string): number | null {
  const numero = Number(id)
  return id.trim() !== '' && Number.isInteger(numero) ? numero : null
}

/** Implementacion de `ProfesionalRepository` sobre Supabase. */
export class SupabaseProfesionalRepository implements ProfesionalRepository {
  async listarActivos(): Promise<Profesional[]> {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) {
      throw new Error(`No se pudieron cargar los profesionales: ${error.message}`)
    }

    return (data ?? []).map(toProfesional)
  }

  /**
   * Se resuelve en dos consultas en vez de un embedded select. Hay clave
   * foranea declarada y el join funcionaria, pero estos tipos estan escritos
   * a mano y su array `Relationships` esta vacio, que es de donde supabase-js
   * deduce el tipo del anidado. Dos consultas simples se tipan solas; cuando
   * el archivo se genere con `supabase gen types`, conviene volver al join.
   */
  async listarPorServicio(servicioId: string): Promise<Profesional[]> {
    const idServicio = aIdNumerico(servicioId)
    if (idServicio === null) return []

    const { data: vinculos, error: errorVinculos } = await supabase
      .from(TABLA_PUENTE)
      .select('profesional_id')
      .eq('servicio_id', idServicio)

    if (errorVinculos) {
      throw new Error(`No se pudieron cargar los profesionales: ${errorVinculos.message}`)
    }

    const ids = (vinculos ?? []).map((v) => v.profesional_id)
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .in('id', ids)
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) {
      throw new Error(`No se pudieron cargar los profesionales: ${error.message}`)
    }

    return (data ?? []).map(toProfesional)
  }

  async listarPorIds(ids: string[]): Promise<Profesional[]> {
    // Los ids que no son enteros (los del prototipo) se descartan aqui: no
    // existen en la base y colarlos daria un 400 de PostgREST.
    const numericos = ids
      .map((id) => Number(id))
      .filter((id, i) => ids[i].trim() !== '' && Number.isInteger(id))

    if (numericos.length === 0) return []

    const { data, error } = await supabase.from(TABLA).select('*').in('id', numericos)

    if (error) {
      throw new Error(`No se pudieron cargar los profesionales: ${error.message}`)
    }

    return (data ?? []).map(toProfesional)
  }

  async listarDisponibilidad(profesionalId: string): Promise<Disponibilidad[]> {
    const id = aIdNumerico(profesionalId)
    if (id === null) return []

    const { data, error } = await supabase
      .from(TABLA_DISPONIBILIDAD)
      .select('*')
      .eq('profesional_id', id)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true })

    if (error) {
      throw new Error(`No se pudo cargar la disponibilidad: ${error.message}`)
    }

    return (data ?? []).map(toDisponibilidad)
  }

  async guardarDisponibilidad(
    profesionalId: string,
    semana: WeeklyAvailability,
  ): Promise<Disponibilidad[]> {
    const id = aIdNumerico(profesionalId)
    if (id === null) {
      throw new Error('La ficha de profesional no es valida.')
    }

    const filas = fromWeeklyAvailability(profesionalId, semana)

    /**
     * `upsert` con `onConflict` sobre (profesional_id, dia_semana), que es la
     * clave unica que agrega 0009. Sin ella PostgREST no sabria contra que
     * resolver el conflicto e insertaria filas repetidas.
     *
     * `select()` no es decorativo: sin el, PostgREST responde 204 sin cuerpo y
     * no habria forma de saber si la escritura llego a alguna fila.
     */
    const { data, error } = await supabase
      .from(TABLA_DISPONIBILIDAD)
      .upsert(filas, { onConflict: 'profesional_id,dia_semana' })
      .select()

    if (error) {
      throw new Error(`No se pudo guardar tu horario: ${error.message}`)
    }

    /**
     * UNA ESCRITURA QUE RLS RECHAZA NO ES UN ERROR: PostgREST devuelve 200 con
     * una lista vacia. Si esto se tomara por exito, el panel diria "guardado"
     * sin haber guardado nada, que es justo el fallo que esta migracion venia a
     * corregir.
     *
     * El caso real: una sesion sin `profesional_id` en su `app_metadata` —una
     * ficha elegida a mano en el selector— no cumple la politica de 0009.
     */
    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el cambio. Tu cuenta necesita tener asignada ' +
          'la ficha de profesional para editar este horario.',
      )
    }

    return data.map(toDisponibilidad)
  }

  async listarDisponibilidadDeVarios(profesionalIds: string[]): Promise<Disponibilidad[]> {
    const ids = profesionalIds
      .map(aIdNumerico)
      .filter((id): id is number => id !== null)

    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from(TABLA_DISPONIBILIDAD)
      .select('*')
      .in('profesional_id', ids)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true })

    if (error) {
      throw new Error(`No se pudo cargar la disponibilidad: ${error.message}`)
    }

    return (data ?? []).map(toDisponibilidad)
  }

  async listarTodos(): Promise<Profesional[]> {
    // Sin el filtro de `activo`: el panel necesita ver a quien esta dado de baja
    // para poder reactivarlo. La lectura es publica por 0002; quien limita el
    // acceso a la PANTALLA es la guarda de ruta y quien limita la ESCRITURA es
    // Row Level Security.
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .order('nombre', { ascending: true })

    if (error) throw new Error(`No se pudo cargar el equipo: ${error.message}`)

    return (data ?? []).map(toProfesional)
  }

  async listarServiciosAsignados(profesionalId: string): Promise<string[]> {
    const id = aIdNumerico(profesionalId)
    if (id === null) return []

    const { data, error } = await supabase
      .from(TABLA_PUENTE)
      .select('servicio_id')
      .eq('profesional_id', id)

    if (error) {
      throw new Error(`No se pudieron cargar sus servicios: ${error.message}`)
    }

    return (data ?? []).map((fila) => String(fila.servicio_id))
  }

  /**
   * Reemplaza por completo la lista de servicios de un profesional.
   *
   * Borra y vuelve a insertar en vez de calcular la diferencia: la tabla puente
   * no tiene mas datos que el par de ids, asi que no hay nada que conservar en
   * una fila existente, y comparar dos listas para ahorrar un borrado seria mas
   * codigo con mas formas de equivocarse.
   *
   * No es privado por convencion de nombre porque el puerto no lo expone: solo
   * lo usan `crear` y `actualizar`, aqui dentro.
   */
  private async reemplazarServicios(profesionalId: number, servicioIds: string[]): Promise<void> {
    const { error: errorBorrado } = await supabase
      .from(TABLA_PUENTE)
      .delete()
      .eq('profesional_id', profesionalId)

    if (errorBorrado) {
      throw new Error(`No se pudieron actualizar sus servicios: ${errorBorrado.message}`)
    }

    const ids = servicioIds
      .map(aIdNumerico)
      .filter((id): id is number => id !== null)

    // Sin servicios asignados no hay nada que insertar, y un insert vacio hace
    // que PostgREST responda un 400.
    if (ids.length === 0) return

    const { error } = await supabase
      .from(TABLA_PUENTE)
      .insert(ids.map((servicioId) => ({ profesional_id: profesionalId, servicio_id: servicioId })))

    if (error) {
      throw new Error(`No se pudieron asignar sus servicios: ${error.message}`)
    }
  }

  /**
   * Da de alta una ficha, sus servicios y su horario por defecto.
   *
   * SON TRES TABLAS Y NO HAY TRANSACCION. PostgREST no la tiene entre
   * peticiones, asi que un fallo a mitad deja el alta incompleta. En vez de
   * disimularlo, el orden se elige para que lo que quede sea siempre util y el
   * mensaje diga exactamente que falto:
   *
   *   1. La ficha. Sin ella no hay nada, asi que si esto falla no se ha tocado
   *      nada y el error es limpio.
   *   2. Los servicios. Si fallan, la ficha existe y se puede completar desde el
   *      propio panel editandola.
   *   3. El horario. Igual: se corrige desde el panel de la profesional.
   *
   * Deshacer los pasos anteriores a mano seria peor: un borrado que tambien
   * puede fallar, dejando el estado mas confuso que antes.
   */
  async crear(datos: DatosProfesional, horario: WeeklyAvailability): Promise<Profesional> {
    const { data, error } = await supabase
      .from(TABLA)
      .insert(fromDatosProfesional(datos))
      .select()

    if (error) throw new Error(`No se pudo crear la ficha: ${error.message}`)
    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó la ficha. Se requieren permisos de personal del estudio.',
      )
    }

    const creado = toProfesional(data[0])
    const idNumerico = Number(creado.id)

    try {
      await this.reemplazarServicios(idNumerico, datos.servicioIds)
    } catch (e: unknown) {
      throw new Error(
        `La ficha de ${creado.nombre} se creó, pero sus servicios no: ` +
          `${e instanceof Error ? e.message : 'error desconocido'}. ` +
          'Edítala para asignarlos.',
      )
    }

    try {
      // Pasa por el mismo camino de escritura que usa el panel de la profesional,
      // ya comprobado, en vez de armar las filas aqui por segunda vez.
      await this.guardarDisponibilidad(creado.id, horario)
    } catch (e: unknown) {
      throw new Error(
        `La ficha de ${creado.nombre} se creó con sus servicios, pero sin horario: ` +
          `${e instanceof Error ? e.message : 'error desconocido'}. ` +
          'Configúralo en su panel de disponibilidad.',
      )
    }

    return creado
  }

  async actualizar(id: string, datos: DatosProfesional): Promise<Profesional> {
    const idNumerico = aIdNumerico(id)
    if (idNumerico === null) throw new Error('El identificador de la ficha no es válido.')

    const { data, error } = await supabase
      .from(TABLA)
      .update(fromDatosProfesional(datos))
      .eq('id', idNumerico)
      .select()

    if (error) throw new Error(`No se pudo guardar la ficha: ${error.message}`)

    // Un UPDATE que RLS rechaza NO da error: PostgREST responde 200 con la lista
    // vacia. Sin esto el panel diria "guardado" sin haber guardado nada.
    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el cambio. Se requieren permisos de personal del estudio.',
      )
    }

    // El horario NO se toca al editar: ya existe y es de esa profesional, que
    // puede haberlo ajustado desde su propio panel. Reponerle el de por defecto
    // le borraria sus cambios sin avisar.
    await this.reemplazarServicios(idNumerico, datos.servicioIds)

    return toProfesional(data[0])
  }

  async eliminar(id: string): Promise<void> {
    const idNumerico = aIdNumerico(id)
    if (idNumerico === null) throw new Error('El identificador de la ficha no es válido.')

    const { data, error } = await supabase
      .from(TABLA)
      .delete()
      .eq('id', idNumerico)
      .select('id')

    if (error) {
      /**
       * 23503 es la violacion de clave foranea: hay reservas atendidas por esta
       * persona. El mensaje de Postgres nombra la restriccion y no ayuda, asi que
       * se traduce a la alternativa correcta —desactivarla—, que la retira del
       * sitio publico y conserva el historial de quien ya reservo con ella.
       */
      if (error.code === '23503') {
        throw new Error(
          'No se puede eliminar: hay reservas asociadas a esta profesional. ' +
            'Desactívala en lugar de borrarla para conservar el historial.',
        )
      }
      throw new Error(`No se pudo eliminar la ficha: ${error.message}`)
    }

    if (!data || data.length === 0) {
      throw new Error(
        'La base de datos no aceptó el borrado. Se requieren permisos de personal del estudio.',
      )
    }
  }
}

/** Instancia lista para usar; la app no necesita mas de una. */
export const profesionalRepository = new SupabaseProfesionalRepository()
