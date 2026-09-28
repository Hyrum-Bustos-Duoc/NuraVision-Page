import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Clock, Coffee, TrendingUp } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { TODAY_ISO } from '@/shared/data/seed'
import { getDayAvailability, getScheduleBlocks, timeToMinutes } from '@/shared/lib/availability'
import { formatWeekdayLong } from '@/shared/lib/format'
import { Button, Card, StatCard, StatusBadge } from '@/shared/ui/ui'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'

export default function ProDashboard() {
  const { bookings, getService } = useAppState()
  const navigate = useNavigate()
  // La ficha sale de la base: antes se buscaba en los datos de ejemplo con el
  // `professionalId` del usuario de demostracion y, con el modo "solo
  // Supabase" activo, no habia nada que encontrar.
  const mia = useMiFichaProfesional()
  const professional = mia.ficha

  const today = useMemo(
    () =>
      professional
        ? bookings
            .filter(
              (b) =>
                b.professionalId === professional.id &&
                b.dateISO === TODAY_ISO &&
                b.status !== 'cancelada',
            )
            .sort((a, b) => a.time.localeCompare(b.time))
        : [],
    [bookings, professional],
  )

  const month = useMemo(
    () =>
      professional
        ? bookings.filter(
            (b) =>
              b.professionalId === professional.id &&
              b.dateISO.startsWith('2026-09') &&
              b.status !== 'cancelada',
          )
        : [],
    [bookings, professional],
  )

  const blocks = useMemo(
    () => (professional ? getScheduleBlocks(TODAY_ISO, professional, bookings) : []),
    [professional, bookings],
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

  const dayAvailability = getDayAvailability(professional, TODAY_ISO)
  const workdayMinutes = dayAvailability?.enabled
    ? timeToMinutes(dayAvailability.end) -
      timeToMinutes(dayAvailability.start) -
      dayAvailability.breaks.reduce(
        (sum, b) => sum + (timeToMinutes(b.end) - timeToMinutes(b.start)),
        0,
      )
    : 0
  const workdayHours = workdayMinutes / 60

  const freeBlocks = blocks.filter((b) => b.type === 'libre')
  const occupiedMinutes = today.reduce((sum, b) => sum + b.durationMin, 0)
  const inProgress = today.filter((b) => b.status === 'en_curso').length
  const occupancy = workdayHours > 0 ? Math.round((occupiedMinutes / 60 / workdayHours) * 100) : 0

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {!mia.vinculoDeclarado && mia.profesional && (
        <FichaActiva nombre={mia.profesional.nombre} onCambiar={() => mia.elegir(null)} />
      )}

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">
            Buenos días, {professional.name}
          </h1>
          <p className="mt-2 text-sm text-muted first-letter:uppercase">
            {formatWeekdayLong(TODAY_ISO)} · {today.length}{' '}
            {today.length === 1 ? 'atención programada' : 'atenciones programadas'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate('/profesional/disponibilidad')}>
            Configurar disponibilidad
          </Button>
          <Button onClick={() => navigate('/profesional/agenda')}>Ver mi agenda</Button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Atenciones hoy"
          value={String(today.length)}
          caption={`${inProgress} en curso`}
          icon={CalendarCheck}
        />
        <StatCard
          label="Horas ocupadas"
          value={`${(occupiedMinutes / 60).toFixed(1).replace('.', ',')} / ${workdayHours
            .toFixed(0)
            .replace('.', ',')}`}
          caption={`${occupancy}% de la jornada`}
          icon={Clock}
        />
        <StatCard
          label="Este mes"
          value={String(month.length)}
          caption="reservas de septiembre"
          icon={TrendingUp}
        />
        <StatCard
          label="Bloques libres hoy"
          value={String(freeBlocks.length)}
          caption={freeBlocks.map((b) => b.start).join(' · ') || 'Sin bloques libres'}
          icon={Coffee}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-serif-display text-2xl text-ink">Hoy</h2>
          <Card className="divide-y divide-line-soft">
            {today.map((b) => {
              const service = getService(b.serviceId)
              return (
                <div key={b.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <span className="w-14 text-sm font-medium text-ink">{b.time}</span>
                    <div>
                      <p className="text-sm font-medium text-ink">{service?.name ?? '—'}</p>
                      <p className="text-xs text-muted">{b.clientName}</p>
                    </div>
                  </div>
                  {(b.status === 'completada' || b.status === 'en_curso') && (
                    <StatusBadge status={b.status} />
                  )}
                </div>
              )
            })}
            {today.length === 0 && <p className="p-4 text-sm text-muted">Sin atenciones hoy.</p>}
          </Card>
        </div>

        <div>
          <h2 className="mb-3 font-serif-display text-2xl text-ink">Bloques libres hoy</h2>
          <Card className="p-4">
            <div className="space-y-2">
              {blocks.map((b, i) => (
                <div
                  key={`${b.start}-${i}`}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${
                    b.type === 'libre'
                      ? 'bg-olive-50 text-ink'
                      : 'placeholder-stripes text-muted'
                  }`}
                >
                  <span>
                    {b.start} – {b.end}
                  </span>
                  <span className="text-xs">
                    {b.type === 'libre' ? `${b.minutes} min libres` : b.label}
                  </span>
                </div>
              ))}
              {blocks.length === 0 && (
                <p className="px-1 py-3 text-sm text-muted">Hoy no atiendes.</p>
              )}
            </div>
            <Button
              variant="outline"
              full
              className="mt-4"
              onClick={() => navigate('/profesional/disponibilidad')}
            >
              Bloquear un tramo
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
