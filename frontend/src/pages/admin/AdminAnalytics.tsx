import { useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { TODAY_ISO } from '@/shared/data/seed'
import { serviceCategories } from '@/modules/servicios/domain/serviceCategories'
import { useAppState } from '@/shared/state/AppState'
import { Card, FilterPills } from '@/shared/ui/ui'
import { formatLongDate, formatPrice } from '@/shared/lib/format'
import { contenedorPanel } from '@/shared/ui/nv-estilos'

type PresetId = '30d' | '3m' | '6m' | 'anio' | 'personalizado'

const PRESETS: { value: PresetId; label: string }[] = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: 'anio', label: 'Este año' },
  { value: 'personalizado', label: 'Personalizado' },
]

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Rango de fechas del preset, tomando "hoy" como el día de referencia del sistema. */
function rangeForPreset(preset: PresetId): { from: string; to: string } {
  const to = new Date(`${TODAY_ISO}T00:00:00`)
  const from = new Date(to)
  if (preset === '30d') from.setDate(from.getDate() - 30)
  else if (preset === '3m') from.setMonth(from.getMonth() - 3)
  else if (preset === '6m') from.setMonth(from.getMonth() - 6)
  else if (preset === 'anio') from.setMonth(0, 1)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export default function AdminAnalytics() {
  const { services, professionals, bookings } = useAppState()
  const [preset, setPreset] = useState<PresetId>('6m')
  const [custom, setCustom] = useState(() => rangeForPreset('6m'))

  const range = preset === 'personalizado' ? custom : rangeForPreset(preset)
  const invalidRange = range.from > range.to

  const inRange = useMemo(
    () =>
      invalidRange
        ? []
        : bookings.filter((b) => b.dateISO >= range.from && b.dateISO <= range.to),
    [bookings, range.from, range.to, invalidRange],
  )

  const stats = useMemo(() => {
    const cancelled = inRange.filter((b) => b.status === 'cancelada')
    const billable = inRange.filter((b) => b.status !== 'cancelada')
    return {
      total: inRange.length,
      ingresos: billable.reduce((sum, b) => sum + b.price, 0),
      clientes: new Set(inRange.map((b) => b.clientName)).size,
      cancelacion: inRange.length ? (cancelled.length / inRange.length) * 100 : 0,
    }
  }, [inRange])

  /** Reservas por mes dentro del rango, en orden cronológico. */
  const trend = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const b of inRange) {
      const key = b.dateISO.slice(0, 7)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return [...buckets.entries()]
      .sort(([a], [z]) => a.localeCompare(z))
      .map(([key, value]) => ({
        key,
        value,
        label: `${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`,
      }))
  }, [inRange])

  const topServices = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of inRange) counts.set(b.serviceId, (counts.get(b.serviceId) ?? 0) + 1)
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, name: services.find((s) => s.id === id)?.name ?? id }))
      .sort((a, z) => z.count - a.count)
      .slice(0, 6)
  }, [inRange, services])

  const topProfessionals = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of inRange) counts.set(b.professionalId, (counts.get(b.professionalId) ?? 0) + 1)
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        name: professionals.find((p) => p.id === id)?.name ?? 'Profesional retirado',
      }))
      .sort((a, z) => z.count - a.count)
  }, [inRange, professionals])

  const maxTrend = Math.max(1, ...trend.map((m) => m.value))
  const maxService = Math.max(1, ...topServices.map((s) => s.count))
  const maxPro = Math.max(1, ...topProfessionals.map((p) => p.count))

  return (
    <div className={contenedorPanel}>
      <h1 className="font-serif-display text-4xl text-ink">Analítica</h1>
      <p className="mt-2 text-sm text-muted">
        Desempeño del estudio a partir de las reservas registradas.
      </p>

      <Card className="mt-6 p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
          <CalendarRange className="h-4 w-4" />
          Período
        </div>
        <div className="mt-3">
          <FilterPills
            options={PRESETS}
            value={preset}
            onChange={(v) => {
              const next = v as PresetId
              // Al pasar a personalizado se parte del rango que ya se estaba viendo.
              if (next === 'personalizado') setCustom(rangeForPreset(preset))
              setPreset(next)
            }}
          />
        </div>

        {preset === 'personalizado' && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="text-xs text-muted">
              Desde
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                className="mt-1 block rounded-lg border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="text-xs text-muted">
              Hasta
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                className="mt-1 block rounded-lg border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              />
            </label>
          </div>
        )}

        <p className="mt-3 text-xs text-muted first-letter:uppercase">
          {invalidRange
            ? 'La fecha inicial debe ser anterior a la final.'
            : `${formatLongDate(range.from)} — ${formatLongDate(range.to)}`}
        </p>
      </Card>

      {invalidRange || stats.total === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <p className="font-medium text-ink">
            {invalidRange ? 'El rango de fechas no es válido' : 'Sin datos en este período'}
          </p>
          <p className="mt-2 text-sm text-muted">
            {invalidRange
              ? 'Corrige las fechas para ver la información.'
              : 'No se registraron reservas entre las fechas seleccionadas. Prueba con un rango más amplio.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Reservas" value={String(stats.total)} />
            <Metric label="Ingresos" value={formatPrice(stats.ingresos)} />
            <Metric label="Clientes distintos" value={String(stats.clientes)} />
            <Metric label="Tasa de cancelación" value={`${stats.cancelacion.toFixed(1)}%`} />
          </div>

          <Card className="mt-6 p-6">
            <h2 className="font-serif-display text-2xl text-ink">Evolución de reservas</h2>
            <div className="mt-8 flex h-52 gap-4">
              {trend.map((m, i) => (
                <div key={m.key} className="group flex flex-1 flex-col">
                  <div className="flex flex-1 items-end">
                    <div
                      title={`${m.label}: ${m.value} reservas`}
                      className="animate-grow-bar w-full rounded-t-md bg-olive-100 transition-colors group-hover:bg-olive-400"
                      style={{
                        height: `${(m.value / maxTrend) * 100}%`,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  </div>
                  <span className="mt-2 text-center text-xs text-muted">{m.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="font-serif-display text-2xl text-ink">Servicios más solicitados</h2>
              <div className="mt-6 space-y-4">
                {topServices.map((s) => (
                  <Bar key={s.id} label={s.name} value={s.count} max={maxService} />
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="font-serif-display text-2xl text-ink">Atenciones por profesional</h2>
              <div className="mt-6 space-y-4">
                {topProfessionals.map((p) => (
                  <Bar key={p.id} label={p.name} value={p.count} max={maxPro} />
                ))}
              </div>
            </Card>
          </div>

          <Card className="mt-6 p-6">
            <h2 className="font-serif-display text-2xl text-ink">Catálogo por categoría</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {serviceCategories.map((c) => {
                const count = services.filter((s) => s.category === c.id).length
                return (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{c.label}</span>
                    <span className="rounded-full bg-line-soft px-3 py-1 text-xs text-muted">
                      {count} servicios
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-serif-display text-2xl text-ink">{value}</p>
    </Card>
  )
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-ink">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-line-soft">
        <div
          className="animate-grow-width h-1.5 rounded-full bg-olive-600"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  )
}
