import { useCallback, useEffect, useState } from 'react'
import type { WeeklyAvailability } from '@/shared/types'
import {
  actualizarProfesional,
  crearProfesional,
  eliminarProfesional,
  guardarDisponibilidad,
  listarTodoElEquipo,
  obtenerDisponibilidadDeVarios,
  obtenerServiciosAsignados,
  type DatosProfesional,
  type Profesional,
} from '../application'
import { profesionalRepository } from '../infrastructure/supabase-profesional.repository'
import { toWeeklyAvailability } from '../infrastructure/disponibilidad.mapper'

interface EstadoEquipoGestion {
  /** El equipo completo: activos e inactivos. */
  equipo: Profesional[]
  cargando: boolean
  error: string | null
  guardando: boolean
  /**
   * Ids de servicios por ficha, para rellenar el formulario al editar.
   *
   * Se carga de una vez para todo el equipo y no ficha por ficha: pedirlos al
   * abrir cada modal significaria un salto visible cada vez que se edita, y son
   * dos docenas de filas.
   */
  serviciosPorProfesional: Record<string, string[]>
  /**
   * Horario semanal por ficha, para rellenar el editor del modal.
   *
   * Sale de UNA consulta para todo el equipo (`listarDisponibilidadDeVarios`) y
   * no de una por ficha: con ocho profesionales serian ocho peticiones para
   * pintar una tabla.
   */
  horarioPorProfesional: Record<string, WeeklyAvailability>
  /** Devuelven el motivo del fallo, o `null` si salio bien. */
  crear: (datos: DatosProfesional, horario: WeeklyAvailability) => Promise<string | null>
  actualizar: (id: string, datos: DatosProfesional) => Promise<string | null>
  /**
   * Guarda el horario de una ficha desde el panel de administracion.
   *
   * Va aparte de `actualizar` a proposito: editar la ficha NO debe tocar el
   * horario, porque la profesional puede haberlo ajustado desde su propio panel y
   * reponerlo en cada guardado le borraria sus cambios sin avisar. Solo se llama
   * si el editor del modal cambio de verdad.
   */
  guardarHorario: (id: string, semana: WeeklyAvailability) => Promise<string | null>
  eliminar: (id: string) => Promise<string | null>
  recargar: () => void
}

/**
 * El equipo, para el panel de administracion.
 *
 * Mismo patron que el resto de hooks de gestion: el resultado se guarda junto al
 * intento que lo produjo, de modo que "cargando" se deriva durante el render en
 * vez de escribirse desde un efecto.
 *
 * Tras cualquier alta o edicion se recarga la lista entera en lugar de parchear
 * la fila. Aqui si hace falta: guardar toca tres tablas —ficha, servicios y, en
 * el alta, el horario— y reconstruir ese estado a mano seria adivinar lo que la
 * base acabo de guardar.
 */
export function useEquipoGestion(): EstadoEquipoGestion {
  const [intento, setIntento] = useState(0)
  const [resuelto, setResuelto] = useState<{
    intento: number
    equipo: Profesional[]
    servicios: Record<string, string[]>
    horarios: Record<string, WeeklyAvailability>
    error: string | null
  }>({ intento: -1, equipo: [], servicios: {}, horarios: {}, error: null })

  useEffect(() => {
    let cancelado = false

    listarTodoElEquipo(profesionalRepository)
      .then(async (equipo) => {
        // Los servicios de cada ficha se piden en paralelo, y el horario de TODO
        // el equipo en una sola consulta. En serie, la espera se multiplicaria
        // por el tamaño del equipo.
        const [listas, bloques] = await Promise.all([
          Promise.all(
            equipo.map((p) =>
              obtenerServiciosAsignados(profesionalRepository, p.id).then(
                (ids) => [p.id, ids] as const,
              ),
            ),
          ),
          obtenerDisponibilidadDeVarios(
            profesionalRepository,
            equipo.map((p) => p.id),
          ),
        ])
        if (cancelado) return

        const horarios: Record<string, WeeklyAvailability> = {}
        for (const p of equipo) {
          horarios[p.id] = toWeeklyAvailability(bloques.filter((b) => b.profesionalId === p.id))
        }

        setResuelto({
          intento,
          equipo,
          servicios: Object.fromEntries(listas),
          horarios,
          error: null,
        })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          intento,
          equipo: [],
          servicios: {},
          horarios: {},
          error: e instanceof Error ? e.message : 'No se pudo cargar el equipo.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [intento])

  const recargar = useCallback(() => setIntento((n) => n + 1), [])

  const [guardando, setGuardando] = useState(false)

  const crear = useCallback(
    async (datos: DatosProfesional, horario: WeeklyAvailability): Promise<string | null> => {
    setGuardando(true)
    try {
      await crearProfesional(profesionalRepository, datos, horario)
      setIntento((n) => n + 1)
      return null
    } catch (e: unknown) {
      /**
       * El alta puede fallar DESPUES de haber creado la ficha: son tres tablas
       * sin transaccion, y el repositorio lo dice en el mensaje. Por eso se
       * recarga igual aunque haya error: la lista tiene que mostrar lo que de
       * verdad quedo guardado, no lo que habia antes de intentarlo.
       */
      setIntento((n) => n + 1)
      return e instanceof Error ? e.message : 'No se pudo crear la ficha.'
    } finally {
      setGuardando(false)
    }
    },
    [],
  )

  const actualizar = useCallback(
    async (id: string, datos: DatosProfesional): Promise<string | null> => {
      setGuardando(true)
      try {
        await actualizarProfesional(profesionalRepository, id, datos)
        setIntento((n) => n + 1)
        return null
      } catch (e: unknown) {
        setIntento((n) => n + 1)
        return e instanceof Error ? e.message : 'No se pudo guardar la ficha.'
      } finally {
        setGuardando(false)
      }
    },
    [],
  )

  const guardarHorario = useCallback(
    async (id: string, semana: WeeklyAvailability): Promise<string | null> => {
      setGuardando(true)
      try {
        await guardarDisponibilidad(profesionalRepository, id, semana)
        setIntento((n) => n + 1)
        return null
      } catch (e: unknown) {
        return e instanceof Error ? e.message : 'No se pudo guardar el horario.'
      } finally {
        setGuardando(false)
      }
    },
    [],
  )

  const eliminar = useCallback(async (id: string): Promise<string | null> => {
    setGuardando(true)
    try {
      await eliminarProfesional(profesionalRepository, id)
      setResuelto((previo) => ({
        ...previo,
        equipo: previo.equipo.filter((p) => p.id !== id),
      }))
      return null
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'No se pudo eliminar la ficha.'
    } finally {
      setGuardando(false)
    }
  }, [])

  const alDia = resuelto.intento === intento

  return {
    equipo: alDia ? resuelto.equipo : [],
    cargando: !alDia,
    error: alDia ? resuelto.error : null,
    guardando,
    serviciosPorProfesional: alDia ? resuelto.servicios : {},
    horarioPorProfesional: alDia ? resuelto.horarios : {},
    crear,
    actualizar,
    guardarHorario,
    eliminar,
    recargar,
  }
}
