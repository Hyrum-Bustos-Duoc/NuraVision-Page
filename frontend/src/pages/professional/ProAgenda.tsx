import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { TODAY_ISO } from '@/shared/data/seed'
import { getMonthDays, getSlotsForDate } from '@/shared/lib/availability'
import { getWeekDates, parseISODate, WEEKDAYS_SHORT } from '@/shared/lib/format'
import { Button, StatusBadge } from '@/shared/ui/ui'
import type { Booking, Professional } from '@/shared/types'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'

type View = 'dia' | 'semana' | 'mes'

export default function ProAgenda() {
  const { bookings, getService } = useAppState()
  const navigate = useNavigate()
  // La ficha sale de la base: antes se buscaba en los datos de ejemplo con el
  // `professionalId` del usuario de demostracion y, con el modo "solo
  // Supabase" activo, no habia nada que encontrar.
  const mia = useMiFichaProfesional()
  const professional = mia.ficha
  const [view, setView] = useState<View>('dia')

  const myBookings = useMemo(
    () =>
      professional
        ? bookings.filter((b) => b.professionalId === professional.id && b.status !== 'cancelada')
        : [],
    [bookings, professional],
  )

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

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {!mia.vinculoDeclarado && mia.profesional && (
        <FichaActiva nombre={mia.profesional.nombre} onCambiar={() => mia.elegir(null)} />
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">Mi agenda</h1>
          <p className="mt-2 text-sm text-muted">Semana del 1 al 6 de septiembre, 2026</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-line bg-paper p-1">
            {(['dia', 'semana', 'mes'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
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

      {view === 'dia' && (
        <DayView bookings={myBookings} getServiceName={(id) => getService(id)?.name ?? '—'} />
      )}
      {view === 'semana' && (
        <WeekView professional={professional} bookings={myBookings} allBookings={bookings} />
      )}
      {view === 'mes' && <MonthView professional={professional} bookings={myBookings} />}
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
  bookings,
  getServiceName,
}: {
  bookings: Booking[]
  getServiceName: (id: string) => string
}) {
  const today = bookings
    .filter((b) => b.dateISO === TODAY_ISO)
    .sort((a, b) => a.time.localeCompare(b.time))

  return (
    <div className="overflow-hidden rounded-2xl border border-line-soft bg-paper">
      {today.map((b) => (
        <div
          key={b.id}
          className="flex items-center justify-between border-b border-line-soft p-5 last:border-0"
        >
          <div className="flex items-center gap-6">
            <span className="w-14 text-sm font-medium text-ink">{b.time}</span>
            <div>
              <p className="font-medium text-ink">{getServiceName(b.serviceId)}</p>
              <p className="text-sm text-muted">{b.clientName}</p>
            </div>
          </div>
          <StatusBadge status={b.status} />
        </div>
      ))}
      {today.length === 0 && <p className="p-5 text-sm text-muted">Sin atenciones hoy.</p>}
    </div>
  )
}

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']

function WeekView({
  professional,
  bookings,
  allBookings,
}: {
  professional: Professional
  bookings: Booking[]
  allBookings: Booking[]
}) {
  const weekDates = getWeekDates(TODAY_ISO)

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
            bookings={bookings}
            allBookings={allBookings}
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
  bookings,
  allBookings,
}: {
  hour: string
  weekDates: string[]
  professional: Professional
  bookings: Booking[]
  allBookings: Booking[]
}) {
  return (
    <>
      <div className="border-b border-line-soft px-3 py-3 text-xs text-muted">{hour}</div>
      {weekDates.map((iso) => {
        const slots = getSlotsForDate(iso, professional, allBookings)
        const slot = slots.find((s) => s.time === hour)

        if (!slot || slot.status === 'fuera_horario') {
          return <div key={iso} className="border-b border-l border-line-soft" />
        }

        const booking = bookings.find((b) => b.dateISO === iso && b.time === hour)

        if (booking) {
          const surname = booking.clientName.split(' ').slice(1).join(' ') || booking.clientName
          return (
            <div key={iso} className="border-b border-l border-line-soft p-1">
              <div className="flex h-full items-center justify-center rounded bg-olive-600 px-1 py-2 text-center text-xs text-white">
                {surname}
              </div>
            </div>
          )
        }

        return (
          <div key={iso} className="border-b border-l border-line-soft p-1">
            {slot.status === 'bloqueado' ? (
              <div className="placeholder-stripes flex h-full items-center justify-center rounded px-1 py-2 text-center text-xs text-muted">
                Bloqueado
              </div>
            ) : slot.status === 'reservado' ? (
              <div className="flex h-full items-center justify-center rounded bg-olive-600 px-1 py-2 text-center text-xs text-white">
                Reservado
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
  professional,
  bookings,
}: {
  professional: Professional
  bookings: Booking[]
}) {
  const days = getMonthDays(2026, 8, professional, bookings)

  return (
    <div className="grid grid-cols-7 gap-2">
      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((w) => (
        <div key={w} className="text-center text-xs font-medium uppercase text-muted">
          {w}
        </div>
      ))}
      {Array.from({ length: (parseISODate(days[0].dateISO).getDay() + 6) % 7 }).map((_, i) => (
        <div key={`blank-${i}`} />
      ))}
      {days.map((day) => {
        const count = bookings.filter((b) => b.dateISO === day.dateISO).length
        return (
          <div
            key={day.dateISO}
            className={`min-h-[86px] rounded-xl border p-3 text-sm ${
              day.dateISO === TODAY_ISO
                ? 'border-ink bg-ink text-white'
                : day.status === 'cerrado'
                  ? 'border-dashed border-line text-muted-light'
                  : 'border-line-soft bg-paper text-ink'
            }`}
          >
            <p>{day.day}</p>
            {day.status !== 'cerrado' && (
              <p
                className={`mt-2 text-xs ${
                  day.dateISO === TODAY_ISO ? 'text-white/70' : 'text-muted'
                }`}
              >
                {count > 0 ? `${count} ${count === 1 ? 'reserva' : 'reservas'}` : 'Sin reservas'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
