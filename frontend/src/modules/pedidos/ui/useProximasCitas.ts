import { useMemo } from 'react'
import { estaViva } from '@/modules/reservas/application'
import { useMisReservas } from '@/modules/reservas/ui/useMisReservas'
import { useServiciosPorIds } from '@/modules/servicios/ui/useServiciosPorIds'
import { parseISODate, toISODate } from '@/shared/lib/format'

export interface CitaProxima {
  /** id de la reserva. */
  id: string
  fecha: string
  hora: string
  servicioId: string
  servicioNombre: string
  /** "Jueves 3 sep · 16:30 · Manicura Completa" */
  etiqueta: string
  /** "jueves 3 de septiembre" */
  fechaLarga: string
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Reservas propias, vivas y de hoy en adelante: donde se puede entregar un
 * pedido. Es el mismo criterio que aplica crear_pedido() en la base.
 *
 * Sin sesion no consulta nada (devuelve una lista vacia).
 */
export function useProximasCitas(usuarioId: string | null) {
  const { reservas, cargando, error } = useMisReservas(usuarioId)

  const vigentes = useMemo(() => {
    const hoy = toISODate(new Date())
    return reservas
      .filter((r) => estaViva(r) && r.fecha >= hoy)
      .sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio))
  }, [reservas])

  const servicios = useServiciosPorIds(useMemo(() => [...new Set(vigentes.map((r) => r.servicioId))], [vigentes]))

  const citas = useMemo<CitaProxima[]>(
    () =>
      vigentes.map((r) => {
        const fecha = parseISODate(r.fecha)
        const dia = DIAS[fecha.getDay()]
        const mes = MESES[fecha.getMonth()]
        const nombre = servicios.porId.get(r.servicioId)?.nombre ?? 'tu servicio'
        return {
          id: r.id,
          fecha: r.fecha,
          hora: r.horaInicio,
          servicioId: r.servicioId,
          servicioNombre: nombre,
          etiqueta: `${dia[0].toUpperCase()}${dia.slice(1)} ${fecha.getDate()} ${mes.slice(0, 3)} · ${r.horaInicio} · ${nombre}`,
          fechaLarga: `${dia} ${fecha.getDate()} de ${mes}`,
        }
      }),
    [vigentes, servicios.porId],
  )

  return { citas, cargando: usuarioId !== null && cargando, error }
}
