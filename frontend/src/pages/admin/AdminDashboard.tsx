import { useMemo, useState } from 'react'
import { BarraFiltros, SelectFiltro } from '@/shared/ui/controles'
import { CalendarCheck, Clock, TrendingDown, Users } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { TODAY_ISO } from '@/shared/data/seed'
import { BookingsTable } from '@/shared/components/BookingsTable'
import { Card, StatCard } from '@/shared/ui/ui'
import type { BookingStatus } from '@/shared/types'
import { contenedorPanel } from '@/shared/ui/nv-estilos'

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const STATUS_OPTIONS: { value: BookingStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
]

export default function AdminDashboard() {
  const { bookings, professionals, services, users } = useAppState()
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'todos'>('todos')
  const [professionalFilter, setProfessionalFilter] = useState<'todos' | string>('todos')

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => statusFilter === 'todos' || b.status === statusFilter)
      .filter((b) => professionalFilter === 'todos' || b.professionalId === professionalFilter)
      .sort((a, b) => (a.dateISO + a.time < b.dateISO + b.time ? 1 : -1))
      .slice(0, 8)
  }, [bookings, statusFilter, professionalFilter])

  /** Resumen del mes en curso, tomando como hoy la fecha de referencia del sistema. */
  const stats = useMemo(() => {
    const month = TODAY_ISO.slice(0, 7)
    const delMes = bookings.filter((b) => b.dateISO.startsWith(month))
    const canceladas = delMes.filter((b) => b.status === 'cancelada').length
    return {
      delMes: delMes.length,
      hoy: bookings.filter((b) => b.dateISO === TODAY_ISO).length,
      pendientesHoy: bookings.filter((b) => b.dateISO === TODAY_ISO && b.status === 'confirmada')
        .length,
      clientes: users.filter((u) => u.role === 'cliente' && u.active).length,
      cancelacion: delMes.length ? (canceladas / delMes.length) * 100 : 0,
    }
  }, [bookings, users])

  /** Últimos siete meses de reservas, en orden cronológico. */
  const trend = useMemo(() => {
    const months: { key: string; label: string; value: number }[] = []
    const cursor = new Date(`${TODAY_ISO}T00:00:00`)
    cursor.setDate(1)
    cursor.setMonth(cursor.getMonth() - 6)
    for (let i = 0; i < 7; i += 1) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      months.push({
        key,
        label: MONTHS_SHORT[cursor.getMonth()],
        value: bookings.filter((b) => b.dateISO.startsWith(key)).length,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return months
  }, [bookings])

  const topServices = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of bookings) counts.set(b.serviceId, (counts.get(b.serviceId) ?? 0) + 1)
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, name: services.find((s) => s.id === id)?.name ?? id }))
      .sort((a, z) => z.count - a.count)
      .slice(0, 5)
  }, [bookings, services])

  const maxTrend = Math.max(1, ...trend.map((m) => m.value))
  const maxServiceCount = Math.max(1, ...topServices.map((s) => s.count))
  const trendRange = `${MONTHS_LONG[Number(trend[0].key.slice(5, 7)) - 1]} - ${
    MONTHS_LONG[Number(trend[trend.length - 1].key.slice(5, 7)) - 1]
  }`

  return (
    <div className={contenedorPanel}>
      <h1 className="font-serif-display text-4xl text-ink">Dashboard</h1>
      <p className="mt-2 text-sm text-muted">Estudio Nura · 1 de septiembre, 2026</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Reservas del mes"
          value={String(stats.delMes)}
          caption="Septiembre 2026"
          icon={CalendarCheck}
        />
        <StatCard
          label="Reservas hoy"
          value={String(stats.hoy)}
          caption={`${stats.pendientesHoy} por atender`}
          icon={Clock}
        />
        <StatCard
          label="Clientes registrados"
          value={stats.clientes.toLocaleString('es-CL')}
          caption="Con cuenta activa"
          icon={Users}
        />
        <StatCard
          label="Tasa de cancelación"
          value={`${stats.cancelacion.toFixed(1)}%`}
          caption="Sobre las reservas del mes"
          captionTone={stats.cancelacion > 10 ? 'negative' : undefined}
          icon={TrendingDown}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif-display text-2xl text-ink">Evolución de reservas</h2>
            <span className="text-sm text-muted first-letter:uppercase">{trendRange}</span>
          </div>
          {/* La fila no usa items-end: cada columna debe estirarse para que la
              altura porcentual de la barra tenga una referencia definida. */}
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

        <Card className="p-6">
          <h2 className="font-serif-display text-2xl text-ink">Servicios más solicitados</h2>
          <div className="mt-6 space-y-4">
            {topServices.map((s, i) => (
              <div key={s.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink">{s.name}</span>
                  <span className="text-ink">{s.count}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
                  <div
                    className="animate-grow-width h-1.5 rounded-full bg-olive-600"
                    style={{
                      width: `${(s.count / maxServiceCount) * 100}%`,
                      animationDelay: `${i * 80}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif-display text-2xl text-ink">Reservas recientes</h2>
          <BarraFiltros>
            <SelectFiltro
              value={statusFilter}
              onChange={setStatusFilter}
              etiqueta="Filtrar por estado"
              opciones={STATUS_OPTIONS}
            />
            <SelectFiltro
              value={professionalFilter}
              onChange={setProfessionalFilter}
              etiqueta="Filtrar por profesional"
              opciones={[
                { value: 'todos', label: 'Todos los profesionales' },
                ...professionals.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </BarraFiltros>
        </div>
        <BookingsTable bookings={filtered} />
      </div>
    </div>
  )
}
