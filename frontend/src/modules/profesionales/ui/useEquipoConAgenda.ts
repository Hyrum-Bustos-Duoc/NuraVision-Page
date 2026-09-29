import { useEffect, useMemo, useState } from 'react'
import type { Professional } from '@/shared/types'
import { obtenerDisponibilidadDeVarios, obtenerProfesionales } from '../application'
import type { Disponibilidad } from '../domain/disponibilidad.types'
import type { Profesional } from '../domain/profesional.types'
import { toWeeklyAvailability } from '../infrastructure/disponibilidad.mapper'
import { profesionalRepository } from '../infrastructure/supabase-profesional.repository'

interface EstadoEquipo {
  /**
   * El equipo en la forma que espera el calculo de horas del prototipo, con el
   * horario semanal ya resuelto. Se entrega asi, y no como `Profesional`,
   * porque `getSlotsForDate` y `getNextAvailableSlots` piden un `Professional`
   * y reescribir esa logica probada solo para cambiar la forma del dato seria
   * cambiar mucho para no ganar nada.
   */
  equipo: Professional[]
  cargando: boolean
  error: string | null
}

/**
 * Equipo completo con su agenda, en DOS consultas.
 *
 * La alternativa natural —un `useDisponibilidad` por profesional— no es
 * posible: los hooks no se pueden llamar dentro de un bucle. Y aunque lo
 * fuera, serian ocho peticiones para pintar una pagina. Aqui se traen todos
 * los bloques de una vez y se reparten en memoria.
 */
export function useEquipoConAgenda(): EstadoEquipo {
  const [datos, setDatos] = useState<{
    profesionales: Profesional[]
    bloques: Disponibilidad[]
  }>({ profesionales: [], bloques: [] })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // StrictMode monta dos veces en desarrollo: si la peticion de la primera
    // pasada llega tarde, no debe escribir sobre el estado de la segunda.
    let cancelado = false

    obtenerProfesionales(profesionalRepository)
      .then(async (profesionales) => {
        // La segunda consulta depende de la primera: hasta no saber quienes
        // son, no hay ids con los que pedir sus horarios.
        const bloques = await obtenerDisponibilidadDeVarios(
          profesionalRepository,
          profesionales.map((p) => p.id),
        )
        if (cancelado) return
        setDatos({ profesionales, bloques })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setError(e instanceof Error ? e.message : 'No se pudo cargar el equipo.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })

    return () => {
      cancelado = true
    }
  }, [])

  const equipo = useMemo<Professional[]>(() => {
    const porProfesional = new Map<string, Disponibilidad[]>()
    for (const bloque of datos.bloques) {
      const suyos = porProfesional.get(bloque.profesionalId)
      if (suyos) suyos.push(bloque)
      else porProfesional.set(bloque.profesionalId, [bloque])
    }

    return datos.profesionales.map((p) => ({
      id: p.id,
      name: p.nombre,
      role: p.especialidad,
      // La tabla no guarda años de experiencia ni biografia. Se dejan vacios
      // en vez de inventarlos: la vista decide que hacer con la ausencia.
      experienceYears: 0,
      bio: '',
      serviceIds: [],
      imageUrl: p.avatarUrl ?? undefined,
      availability: toWeeklyAvailability(porProfesional.get(p.id) ?? []),
    }))
  }, [datos])

  return { equipo, cargando, error }
}
