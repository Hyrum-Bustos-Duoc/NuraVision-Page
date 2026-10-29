import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Clock, Coffee, TrendingUp } from 'lucide-react'
import { hoyEnElEstudio, partesISO } from '@/shared/lib/calendario'
import { formatWeekdayLong, monthLabel } from '@/shared/lib/format'
import { Button, Card, StatCard, StatusBadge } from '@/shared/ui/ui'
import { useReservasGestion } from '@/modules/admin/ui/useReservasGestion'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'
import { useServiciosPorIds } from '@/modules/servicios/ui/useServiciosPorIds'
import { bloquesDelDia, duracionMin, minutosDeJornada, reservasDeAgenda } from './agenda'

export default function ProDashboard() {
  const navigate = useNavigate()
  // La ficha sale de la base: antes se buscaba en los datos de ejemplo con el
  // `professionalId` del usuario de demostracion y, con el modo "solo
  // Supabase" activo, no habia nada que encontrar.
  const mia = useMiFichaProfesional()
  const professional = mia.ficha

  // Misma fuente que la agenda y el historial; ver ProAgenda.
  const reservas = useReservasGestion(
    { profesionalId: professional?.id },
    professional !== undefined,
  )
  const agenda = reservasDeAgenda(reservas.reservas)
  const hoy = hoyEnElEstudio()
  const today = agenda.filter((r) => r.fecha === hoy)
  const servicios = useServiciosPorIds(today.map((r) => r.servicioId))

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

  // Ver ProAgenda: el horario llega en otra consulta y sin el los bloques libres
  // y la jornada saldrian en cero.
  const cargando = reservas.cargando || mia.cargandoAgenda
  const error = reservas.error ?? mia.error
  const reintentar = reservas.error ? reservas.recargar : () => navigate(0)

  const { anio, mes } = partesISO(hoy)
  const month = agenda.filter((r) => r.fecha.startsWith(hoy.slice(0, 7)))
  const blocks = bloquesDelDia(professional, hoy, agenda)
  const freeBlocks = blocks.filter((b) => b.tipo === 'libre')
  const workdayHours = minutosDeJornada(professional, hoy) / 60
  const occupiedMinutes = today.reduce((sum, r) => sum + duracionMin(r), 0)
  const porConfirmar = today.filter((r) => r.estado === 'pendiente').length
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
            {formatWeekdayLong(hoy)}
            {!cargando &&
              !error &&
              ` · ${today.length} ${today.length === 1 ? 'atención programada' : 'atenciones programadas'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate('/profesional/disponibilidad')}>
            Configurar disponibilidad
          </Button>
          <Button onClick={() => navigate('/profesional/agenda')}>Ver mi agenda</Button>
        </div>
      </div>

      {cargando && (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando tu día…
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Atenciones hoy"
              value={String(today.length)}
              caption={`${porConfirmar} por confirmar`}
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
              caption={`reservas de ${monthLabel(anio, mes).toLowerCase()}`}
              icon={TrendingUp}
            />
            <StatCard
              label="Bloques libres hoy"
              value={String(freeBlocks.length)}
              caption={freeBlocks.map((b) => b.inicio).join(' · ') || 'Sin bloques libres'}
              icon={Coffee}
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 font-serif-display text-2xl text-ink">Hoy</h2>
              <Card className="divide-y divide-line-soft">
                {today.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <span className="w-14 text-sm font-medium text-ink">{r.horaInicio}</span>
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {servicios.porId.get(r.servicioId)?.nombre ??
                            (servicios.cargando ? 'Cargando…' : '—')}
                        </p>
                        <p className="text-xs text-muted">{r.clienteNombre}</p>
                      </div>
                    </div>
                    <StatusBadge status={r.estado} />
                  </div>
                ))}
                {today.length === 0 && (
                  <p className="p-4 text-sm text-muted">Sin atenciones hoy.</p>
                )}
              </Card>
            </div>

            <div>
              <h2 className="mb-3 font-serif-display text-2xl text-ink">Bloques libres hoy</h2>
              <Card className="p-4">
                <div className="space-y-2">
                  {blocks.map((b) => (
                    <div
                      key={b.inicio}
                      className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${
                        b.tipo === 'libre'
                          ? 'bg-olive-50 text-ink'
                          : 'placeholder-stripes text-muted'
                      }`}
                    >
                      <span>
                        {b.inicio} – {b.fin}
                      </span>
                      <span className="text-xs">
                        {b.tipo === 'libre' ? `${b.minutos} min libres` : b.etiqueta}
                      </span>
                    </div>
                  ))}
                  {blocks.length === 0 && (
                    <p className="px-1 py-3 text-sm text-muted">
                      {workdayHours > 0
                        ? 'Toda la jornada de hoy está reservada.'
                        : 'Hoy no atiendes.'}
                    </p>
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
        </>
      )}
    </div>
  )
}
