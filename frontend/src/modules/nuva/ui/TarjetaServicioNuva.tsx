import { useMemo } from 'react'
import { useDisponibilidad } from '@/modules/profesionales/ui/useDisponibilidad'
import { useProfesionalesPorServicio } from '@/modules/profesionales/ui/useProfesionalesPorServicio'
import { etiquetaDePrecio } from '@/modules/servicios/ui/precio'
import { fotoDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { useServicioDetalle } from '@/modules/servicios/ui/useServicioDetalle'
import { getNextAvailableSlots } from '@/shared/lib/availability'
import { parseISODate, toISODate, WEEKDAYS_SHORT } from '@/shared/lib/format'
import { useAppState } from '@/shared/state/AppState'
import type { Professional } from '@/shared/types'
import { AppImage } from '@/shared/ui/ui'
import type { MensajeNuva } from '../domain/nuva.types'
import type { HorarioElegido } from './nuva.context'

/** "Hoy · 16:30", "Mañana · 10:30", "Jue 3 · 17:00" (spec §12.2). */
function etiquetaHorario(dateISO: string, time: string, hoy: string): string {
  const fecha = parseISODate(dateISO)
  const manana = new Date(parseISODate(hoy))
  manana.setDate(manana.getDate() + 1)
  if (dateISO === hoy) return `Hoy · ${time}`
  if (dateISO === toISODate(manana)) return `Mañana · ${time}`
  return `${WEEKDAYS_SHORT[fecha.getDay()]} ${fecha.getDate()} · ${time}`
}

/**
 * Tarjeta de servicio con las proximas horas libres.
 *
 * Las horas salen del horario real de la profesional en la base, desde hoy. Lo
 * que no puede saber es que horas ya tomaron otras clientas (la RLS no deja
 * leer reservas ajenas): por eso al elegir no se reserva, se lleva al paso de
 * confirmacion, que es la ultima palabra.
 */
export function TarjetaServicioNuva({
  mensaje,
  onElegir,
}: {
  mensaje: MensajeNuva
  onElegir: (horario: HorarioElegido) => void
}) {
  const servicioId = mensaje.servicioId
  const servicio = useServicioDetalle(servicioId)
  const equipo = useProfesionalesPorServicio(servicioId)
  const profesional = equipo.profesionales[0]
  const disponibilidad = useDisponibilidad(profesional?.id)
  const { bookings } = useAppState()

  const horarios = useMemo(() => {
    if (!profesional || disponibilidad.cargando || disponibilidad.sinHorario) return []
    const ahora = new Date()
    const hoy = toISODate(ahora)
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
    const pro: Professional = {
      id: profesional.id,
      name: profesional.nombre,
      role: profesional.especialidad,
      experienceYears: 0,
      bio: '',
      serviceIds: [],
      availability: disponibilidad.horario,
    }
    const libres = getNextAvailableSlots(pro, bookings, 120, hoy).filter(
      (s) => s.dateISO !== hoy || s.time > horaActual,
    )
    // Una hora por dia, como en la spec ("Hoy", "Mañana", "Jue 3"…): cuatro
    // horas seguidas del mismo dia son en realidad una sola opcion. Si no hay
    // cuatro dias distintos, se completa con las que queden.
    const primeraDelDia = libres.filter((s, i) => libres.findIndex((o) => o.dateISO === s.dateISO) === i)
    const resto = libres.filter((s) => !primeraDelDia.includes(s))
    return [...primeraDelDia, ...resto]
      .slice(0, 4)
      .sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time))
      .map((s) => ({ ...s, etiqueta: etiquetaHorario(s.dateISO, s.time, hoy) }))
  }, [profesional, disponibilidad.cargando, disponibilidad.sinHorario, disponibilidad.horario, bookings])

  if (servicio.estado !== 'listo') {
    return <div className="h-24 animate-pulse rounded-xl bg-nv-paper2" aria-hidden="true" />
  }

  const s = servicio.servicio
  const cargandoHoras = equipo.cargando || (profesional !== undefined && disponibilidad.cargando)
  const elegido = mensaje.horarioElegido

  return (
    <div className="rounded-xl border border-nv-line1 bg-nv-surface p-3">
      <div className="flex items-center gap-3">
        <AppImage src={fotoDeServicio(s)} alt={s.nombre} className="h-11 w-11 shrink-0 rounded-md" />
        <div className="min-w-0">
          <p className="font-serif text-[17px] leading-snug text-nv-ink">{s.nombre}</p>
          <p className="text-xs text-nv-soft1">
            {s.duracionMinutos} min · {etiquetaDePrecio(s)}
            {profesional && ` · con ${profesional.nombre}`}
          </p>
        </div>
      </div>

      {cargandoHoras && <p className="mt-3 text-xs text-nv-soft1">Buscando horas libres…</p>}

      {!cargandoHoras && horarios.length === 0 && (
        <p className="mt-3 text-xs text-nv-soft1">
          No encontramos horas libres en las próximas semanas. Escríbenos y te ayudamos a coordinar.
        </p>
      )}

      {horarios.length > 0 && profesional && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {horarios.map((h) => {
            const activo = elegido === h.etiqueta
            return (
              <button
                key={h.etiqueta}
                type="button"
                disabled={elegido !== undefined}
                onClick={() =>
                  onElegir({
                    etiqueta: h.etiqueta,
                    dateISO: h.dateISO,
                    time: h.time,
                    profesionalId: profesional.id,
                    profesionalNombre: profesional.nombre,
                  })
                }
                className={`rounded-full border px-3 py-2 text-[12.5px] transition-opacity ${
                  activo
                    ? 'border-nv-accent bg-nv-accent text-nv-surface'
                    : 'border-nv-line3 text-nv-ink hover:bg-nv-paper4'
                } ${elegido !== undefined && !activo ? 'opacity-40' : ''} disabled:cursor-default`}
              >
                {h.etiqueta}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
