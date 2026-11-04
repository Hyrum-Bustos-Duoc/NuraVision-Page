import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDayAvailability } from '@/shared/lib/availability'
import { fechaLegible, hoyEnElEstudio, partesISO, semanasDelMes } from '@/shared/lib/calendario'
import { getWeekDates, parseISODate, WEEKDAYS_SHORT } from '@/shared/lib/format'
import { Button, StatusBadge } from '@/shared/ui/ui'
import type { Professional } from '@/shared/types'
import type { ReservaGestion } from '@/modules/admin/domain/reserva-gestion.types'
import { useReservasGestion } from '@/modules/admin/ui/useReservasGestion'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'
import { useServiciosPorIds } from '@/modules/servicios/ui/useServiciosPorIds'
import { estadoFranja, reservasDeAgenda } from './agenda'

type View = 'dia' | 'semana' | 'mes'

export default function ProAgenda() {
  const navigate = useNavigate()
  // La ficha sale de la base: antes se buscaba en los datos de ejemplo con el
  // `professionalId` del usuario de demostracion y, con el modo "solo
  // Supabase" activo, no habia nada que encontrar.
  const mia = useMiFichaProfesional()
  const professional = mia.ficha
  const [view, setView] = useState<View>('dia')

  // Misma lectura que ProHistory: el filtro por profesional lo aplica la base,
  // y que esta sesion pueda leer esas filas lo decide RLS (0007), no la vista.
  const reservas = useReservasGestion(
    { profesionalId: professional?.id },
    professional !== undefined,
  )
  const agenda = reservasDeAgenda(reservas.reservas)
  const servicios = useServiciosPorIds(agenda.map((r) => r.servicioId))
  const nombreServicio = (id: string) =>
    servicios.porId.get(id)?.nombre ?? (servicios.cargando ? 'Cargando…' : '—')

  const hoy = hoyEnElEstudio()

  if (!professional) {
    return (
      <SelectorDeFicha
        equipo={mia.equipo}
        cargando={mia.cargando}
        error={mia.error}
        onElegir={mia.elegir}
      />
    )
  }

  // El horario es una consulta aparte de la ficha: mientras no llega, la semana
  // se veria entera "fuera de horario", que es una mentira peor que esperar.
  const cargando = reservas.cargando || mia.cargandoAgenda
  // Con la ficha ya resuelta, `mia.error` solo puede venir del horario. Ese hook
  // no expone como repetir la consulta, por eso se recarga la pagina.
  const error = reservas.error ?? mia.error
  const reintentar = reservas.error ? reservas.recargar : () => navigate(0)

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {!mia.vinculoDeclarado && mia.profesional && (
        <FichaActiva nombre={mia.profesional.nombre} onCambiar={() => mia.elegir(null)} />
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">Mi agenda</h1>
          <p className="mt-2 text-sm text-muted first-letter:uppercase">{fechaLegible(hoy)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-line bg-paper p-1">
            {(['dia', 'semana', 'mes'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === v ? 'bg-ink text-white' : 'text-ink hover:bg-ivory'
                }`}
              >
                {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <Button onClick={() => navigate('/profesional/disponibilidad')}>Disponibilidad</Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-soft bg-paper px-5 py-3 text-xs text-muted">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <LegendDot className="bg-line-soft" label="Disponible" />
          <LegendDot className="bg-olive-600" label="Reservado" />
          <LegendDot className="placeholder-stripes" label="Bloqueado" />
          <LegendDot className="border border-dashed border-line" label="Fuera de horario" />
        </div>
        <span>Vista: {view === 'dia' ? 'Día' : view === 'semana' ? 'Semana' : 'Mes'}</span>
      </div>

      {cargando && (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando agenda…
        </p>
      )}

      {!cargando && error && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="text-sm text-ink">{error}</p>
          <button
            onClick={reintentar}
            className="mt-4 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-ivory"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !error && (
        <>
          {/* Vacio y sin permiso son indistinguibles: RLS filtra las filas en
              vez de dar error. Se avisa una vez, sin tapar la grilla, que
              sigue sirviendo para ver el horario. */}
          {agenda.length === 0 && (
            <p className="mb-6 rounded-2xl border border-dashed border-line px-5 py-4 text-sm text-muted">
              No hay reservas que mostrar. O todavía no tienes ninguna, o esta sesión no tiene
              permiso para leerlas: la base entrega las horas de quien tenga{' '}
              <code>profesional_id</code> en su <code>app_metadata</code>.
            </p>
          )}
          {view === 'dia' && <DayView hoy={hoy} reservas={agenda} nombreServicio={nombreServicio} />}
          {view === 'semana' && <WeekView hoy={hoy} professional={professional} reservas={agenda} />}
          {view === 'mes' && <MonthView hoy={hoy} professional={professional} reservas={agenda} />}
        </>
      )}
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  )
}

function DayView({
  hoy,
  reservas,
  nombreServicio,
}: {
  hoy: string
  reservas: ReservaGestion[]
  nombreServicio: (id: string) => string
}) {
  const deHoy = reservas.filter((r) => r.fecha === hoy)

  return (
    <div className="overflow-hidden rounded-2xl border border-line-soft bg-paper">
      {deHoy.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between border-b border-line-soft p-5 last:border-0"
        >
          <div className="flex items-center gap-6">
            <span className="w-24 text-sm font-medium text-ink">
              {r.horaInicio}–{r.horaFin}
            </span>
            <div>
              <p className="font-medium text-ink">{nombreServicio(r.servicioId)}</p>
              <p className="text-sm text-muted">{r.clienteNombre}</p>
            </div>
          </div>
          <StatusBadge status={r.estado} />
        </div>
      ))}
      {deHoy.length === 0 && <p className="p-5 text-sm text-muted">Sin atenciones hoy.</p>}
    </div>
  )
}

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']

function WeekView({
  hoy,
  professional,
  reservas,
}: {
  hoy: string
  professional: Professional
  reservas: ReservaGestion[]
}) {
  const weekDates = getWeekDates(hoy)

  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft bg-paper">
      <div className="grid min-w-[860px] grid-cols-[80px_repeat(7,1fr)]">
        <div />
        {weekDates.map((iso) => {
          const date = parseISODate(iso)
          return (
            <div key={iso} className="border-b border-l border-line-soft px-2 py-3 text-center">
              <p className="text-xs uppercase tracking-wide text-muted">
                {WEEKDAYS_SHORT[date.getDay()]}
              </p>
              <p className="font-serif-display text-lg text-ink">{date.getDate()}</p>
            </div>
          )
        })}

        {HOURS.map((hour) => (
          <HourRow
            key={hour}
            hour={hour}
            weekDates={weekDates}
            professional={professional}
            reservas={reservas}
          />
        ))}
      </div>
    </div>
  )
}

function HourRow({
  hour,
  weekDates,
  professional,
  reservas,
}: {
  hour: string
  weekDates: string[]
  professional: Professional
  reservas: ReservaGestion[]
}) {
  return (
    <>
      <div className="border-b border-line-soft px-3 py-3 text-xs text-muted">{hour}</div>
      {weekDates.map((iso) => {
        const franja = estadoFranja(professional, iso, hour, 60, reservas)

        if (franja.tipo === 'fuera_horario') {
          return <div key={iso} className="border-b border-l border-line-soft" />
        }

        return (
          <div key={iso} className="border-b border-l border-line-soft p-1">
            {franja.tipo === 'reservada' ? (
              <div
                title={`${franja.reserva.horaInicio}–${franja.reserva.horaFin} · ${franja.reserva.clienteNombre}`}
                className="flex h-full items-center justify-center rounded bg-olive-600 px-1 py-2 text-center text-xs text-white"
              >
                {franja.reserva.clienteNombre.split(' ').slice(1).join(' ') ||
                  franja.reserva.clienteNombre}
              </div>
            ) : franja.tipo === 'pausa' ? (
              <div className="placeholder-stripes flex h-full items-center justify-center rounded px-1 py-2 text-center text-xs text-muted">
                Bloqueado
              </div>
            ) : (
              <div className="h-full rounded bg-line-soft/70 py-2" />
            )}
          </div>
        )
      })}
    </>
  )
}

function MonthView({
  hoy,
  professional,
  reservas,
}: {
  hoy: string
  professional: Professional
  reservas: ReservaGestion[]
}) {
  const { anio, mes } = partesISO(hoy)

  return (
    <div className="grid grid-cols-7 gap-2">
      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((w) => (
        <div key={w} className="text-center text-xs font-medium uppercase text-muted">
          {w}
        </div>
      ))}
      {semanasDelMes(anio, mes)
        .flat()
        .map((celda, i) => {
          if (!celda) return <div key={`blank-${i}`} />
          const count = reservas.filter((r) => r.fecha === celda.iso).length
          const esHoy = celda.iso === hoy
          // Un dia sin jornada pero con reservas no se pinta como cerrado: las
          // citas existen aunque el horario actual ya no las contemple.
          const cerrado = !getDayAvailability(professional, celda.iso).enabled && count === 0
          return (
            <div
              key={celda.iso}
              className={`min-h-[86px] rounded-xl border p-3 text-sm ${
                esHoy
                  ? 'border-ink bg-ink text-white'
                  : cerrado
                    ? 'border-dashed border-line text-muted-light'
                    : 'border-line-soft bg-paper text-ink'
              }`}
            >
              <p>{celda.dia}</p>
              {!cerrado && (
                <p className={`mt-2 text-xs ${esHoy ? 'text-white/70' : 'text-muted'}`}>
                  {count > 0 ? `${count} ${count === 1 ? 'reserva' : 'reservas'}` : 'Sin reservas'}
                </p>
              )}
            </div>
          )
        })}
    </div>
  )
}
