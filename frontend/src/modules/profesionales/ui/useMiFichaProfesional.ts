import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Professional } from '@/shared/types'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { obtenerDisponibilidad, obtenerProfesionales } from '../application'
import type { Disponibilidad } from '../domain/disponibilidad.types'
import type { Profesional } from '../domain/profesional.types'
import { toWeeklyAvailability } from '../infrastructure/disponibilidad.mapper'
import { profesionalRepository } from '../infrastructure/supabase-profesional.repository'

/**
 * Ficha elegida a mano, para las sesiones que no tienen vinculo declarado.
 *
 * Vive en el navegador y NO es una credencial: no da acceso a nada que la
 * base no conceda por su cuenta. Solo decide que ficha se muestra en el panel,
 * de modo que los atajos del prototipo puedan trabajar con datos reales en vez
 * de con los de ejemplo.
 */
const CLAVE_ELECCION = 'nuravision:mi-ficha-profesional'

function leerEleccion(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_ELECCION)
  } catch {
    return null
  }
}

function guardarEleccion(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(CLAVE_ELECCION)
    else window.localStorage.setItem(CLAVE_ELECCION, id)
  } catch {
    // Sin almacenamiento la eleccion dura lo que dure la pestaña.
  }
}

interface EstadoMiFicha {
  /**
   * La ficha en la forma que espera el calculo de horas del prototipo, con el
   * horario semanal ya resuelto desde la base. `undefined` mientras no haya
   * ficha resuelta.
   */
  ficha: Professional | undefined
  /** La entidad de dominio, para lo que no necesita la forma del prototipo. */
  profesional: Profesional | undefined
  /** Todo el equipo, para poder ofrecer el selector. */
  equipo: Profesional[]
  cargando: boolean
  /**
   * `true` mientras el horario de la ficha ya resuelta todavia no ha llegado.
   *
   * Importa distinguirlo de `cargando`: la ficha y su agenda son dos consultas,
   * y entre una y otra `ficha.availability` es una semana cerrada. Sin este
   * indicador, el panel de disponibilidad mostraria «todos los dias libres»
   * como si fuera el horario de verdad.
   */
  cargandoAgenda: boolean
  error: string | null
  /** `true` si el vinculo viene de `app_metadata` y no de una eleccion local. */
  vinculoDeclarado: boolean
  /** Cambia la ficha elegida a mano. Se ignora si hay vinculo declarado. */
  elegir: (profesionalId: string | null) => void
  /**
   * Adopta un horario recien guardado como el vigente.
   *
   * Evita volver a consultar la base tras guardar: la respuesta del UPSERT ya
   * trae las filas tal como quedaron, que es una fuente mejor que el borrador
   * local —incluye lo que la base haya normalizado—.
   */
  aplicarHorario: (bloques: Disponibilidad[]) => void
}

/**
 * Resuelve de que profesional es el panel.
 *
 * Dos caminos, en este orden:
 *
 *   1. `app_metadata.profesional_id` de la sesion. Es el vinculo de verdad:
 *      solo se escribe con la service_role key, igual que `es_staff`.
 *   2. Una eleccion guardada en el navegador. La tabla `profesionales` no
 *      tiene columna de correo, asi que NO hay forma de cruzar la cuenta con
 *      la ficha automaticamente; sin el vinculo declarado, lo unico honesto es
 *      preguntar. Esto es lo que hace que los atajos del prototipo muestren
 *      datos reales en vez de los de ejemplo.
 */
export function useMiFichaProfesional(): EstadoMiFicha {
  const { usuario } = useAuth()

  const [equipo, setEquipo] = useState<Profesional[]>([])
  const [eleccion, setEleccion] = useState<string | null>(leerEleccion)
  const [cargandoEquipo, setCargandoEquipo] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    obtenerProfesionales(profesionalRepository)
      .then((profesionales) => {
        if (!cancelado) setEquipo(profesionales)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el equipo.')
      })
      .finally(() => {
        if (!cancelado) setCargandoEquipo(false)
      })

    return () => {
      cancelado = true
    }
  }, [])

  const vinculoDeclarado = usuario?.profesionalId != null
  const idActivo = usuario?.profesionalId ?? eleccion

  // Solo cuenta si de verdad existe en el equipo: una eleccion guardada puede
  // apuntar a alguien que ya no trabaja aqui, y un vinculo declarado puede
  // quedar obsoleto si borran la ficha.
  const profesional = useMemo(
    () => (idActivo ? equipo.find((p) => p.id === idActivo) : undefined),
    [equipo, idActivo],
  )

  const [bloques, setBloques] = useState<{ id: string; horario: Professional['availability'] }>({
    id: '',
    horario: toWeeklyAvailability([]),
  })

  useEffect(() => {
    if (!profesional) return

    let cancelado = false

    obtenerDisponibilidad(profesionalRepository, profesional.id)
      .then((d) => {
        if (!cancelado) setBloques({ id: profesional.id, horario: toWeeklyAvailability(d) })
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar tu agenda.')
      })

    return () => {
      cancelado = true
    }
  }, [profesional])

  const aplicarHorario = useCallback((nuevos: Disponibilidad[]) => {
    const id = nuevos[0]?.profesionalId
    if (id === undefined) return
    setBloques({ id, horario: toWeeklyAvailability(nuevos) })
  }, [])

  const elegir = useCallback(
    (profesionalId: string | null) => {
      // Un vinculo declarado no se puede sobrescribir desde el navegador: seria
      // dar a entender que la eleccion local manda sobre lo que dice la base.
      if (vinculoDeclarado) return
      setEleccion(profesionalId)
      guardarEleccion(profesionalId)
    },
    [vinculoDeclarado],
  )

  const ficha = useMemo<Professional | undefined>(() => {
    if (!profesional) return undefined
    return {
      id: profesional.id,
      name: profesional.nombre,
      role: profesional.especialidad,
      // La tabla no guarda años de experiencia ni biografia: se dejan vacios
      // en vez de inventarlos sobre una persona real.
      experienceYears: 0,
      bio: '',
      serviceIds: [],
      imageUrl: profesional.avatarUrl ?? undefined,
      // Hasta que llegue su horario se usa el vacio, que `toWeeklyAvailability`
      // devuelve como semana cerrada: es preferible a mostrar el de otra ficha.
      availability: bloques.id === profesional.id ? bloques.horario : toWeeklyAvailability([]),
    }
  }, [profesional, bloques])

  return {
    ficha,
    profesional,
    equipo,
    cargando: cargandoEquipo,
    cargandoAgenda: profesional !== undefined && bloques.id !== profesional.id,
    error,
    vinculoDeclarado,
    elegir,
    aplicarHorario,
  }
}
