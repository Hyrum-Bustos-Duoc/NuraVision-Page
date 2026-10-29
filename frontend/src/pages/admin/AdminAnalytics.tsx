import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import {
  problemaDelRango,
  rangoDelPreset,
  tasaCancelacion,
  type PresetRango,
  type RangoFechas,
} from '@/modules/admin/application'
import { useIndicadores } from '@/modules/admin/ui/useIndicadores'
import { serviceCategories } from '@/modules/servicios/domain/serviceCategories'
import { useServiciosGestion } from '@/modules/servicios/ui/useServiciosGestion'
import { hoyEnElEstudio } from '@/shared/lib/calendario'
import { formatLongDate, formatPrice, MONTHS_SHORT } from '@/shared/lib/format'
import { Button, Card, EmptyState, FilterPills } from '@/shared/ui/ui'
import { contenedorPanel, controlFiltro } from '@/shared/ui/nv-estilos'

type Periodo = PresetRango | 'personalizado'

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: 'anio', label: 'Este año' },
  { value: 'personalizado', label: 'Personalizado' },
]

export default function AdminAnalytics() {
  // El dia de Chile, no el del dispositivo: los presets terminan hoy.
  const hoy = hoyEnElEstudio()
  const [periodo, setPeriodo] = useState<Periodo>('6m')
  const [personalizado, setPersonalizado] = useState<RangoFechas>(() =>
    rangoDelPreset('6m', hoy),
  )

  const rango = periodo === 'personalizado' ? personalizado : rangoDelPreset(periodo, hoy)
  const problema = problemaDelRango(rango)

  // Con el rango invalido no se consulta: el aviso ya explica que corregir.
  const { indicadores, cargando, error, recargar } = useIndicadores(problema ? null : rango)
  // El catalogo no depende del rango y no pasa por la funcion: la categoria se
  // normaliza en el mapper de servicios, y repetirla en SQL la desincronizaria.
  const catalogo = useServiciosGestion()

  const maxMes = Math.max(1, ...(indicadores?.porMes.map((m) => m.reservas) ?? []))
  const topServicios = indicadores?.porServicio.slice(0, 6) ?? []
  const maxServicio = Math.max(1, ...topServicios.map((s) => s.reservas))
  const maxProfesional = Math.max(1, ...(indicadores?.porProfesional.map((p) => p.reservas) ?? []))

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
            options={PERIODOS}
            value={periodo}
            onChange={(siguiente) => {
              // Al pasar a personalizado se parte del rango que ya se estaba viendo.
              if (siguiente === 'personalizado' && periodo !== 'personalizado') {
                setPersonalizado(rangoDelPreset(periodo, hoy))
              }
              setPeriodo(siguiente)
            }}
          />
        </div>

        {periodo === 'personalizado' && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              Desde
              <input
                type="date"
                value={personalizado.desde}
                onChange={(e) => setPersonalizado({ ...personalizado, desde: e.target.value })}
                className={`${controlFiltro} mt-1.5 block px-4`}
              />
            </label>
            <label className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              Hasta
              <input
                type="date"
                value={personalizado.hasta}
                onChange={(e) => setPersonalizado({ ...personalizado, hasta: e.target.value })}
                className={`${controlFiltro} mt-1.5 block px-4`}
              />
            </label>
          </div>
        )}

        <p className="mt-3 text-xs text-muted first-letter:uppercase" aria-live="polite">
          {problema ?? `${formatLongDate(rango.desde)} — ${formatLongDate(rango.hasta)}`}
        </p>
      </Card>

      {problema && (
        <Card className="mt-6 p-10 text-center">
          <p className="font-medium text-ink">El rango de fechas no es válido</p>
          <p className="mt-2 text-sm text-muted">Corrige las fechas para ver la información.</p>
        </Card>
      )}

      {!problema && cargando && (
        <Card className="mt-6 p-10 text-center">
          <p className="text-sm text-muted">Cargando indicadores…</p>
        </Card>
      )}

      {!problema && error && (
        <div className="mt-6">
          <EmptyState
            title="No se pudieron cargar los indicadores"
            description={error}
            action={
              <Button variant="outline" onClick={recargar}>
                Reintentar
              </Button>
            }
          />
        </div>
      )}

      {indicadores && indicadores.reservas === 0 && (
        <Card className="mt-6 p-10 text-center">
          <p className="font-medium text-ink">Sin datos en este período</p>
          <p className="mt-2 text-sm text-muted">
            No se registraron reservas entre las fechas seleccionadas. Prueba con un rango más
            amplio.
          </p>
        </Card>
      )}

      {indicadores && indicadores.reservas > 0 && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Reservas" value={indicadores.reservas.toLocaleString('es-CL')} />
            <Metric label="Ingresos estimados" value={formatPrice(indicadores.ingresosEstimados)} />
            <Metric label="Clientas distintas" value={indicadores.clientasDistintas.toLocaleString('es-CL')} />
            <Metric
              label="Tasa de cancelación"
              value={`${tasaCancelacion(indicadores.porEstado.cancelada, indicadores.reservas).toFixed(1)}%`}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Ingresos estimados: precio acordado de las reservas no canceladas del período,
            incluidas las pendientes y las que aún no ocurren. No es dinero cobrado.
          </p>

          <Card className="mt-6 p-6">
            <h2 className="font-serif-display text-2xl text-ink">Evolución de reservas</h2>
            <div className="mt-8 flex h-52 gap-4">
              {indicadores.porMes.map((m, i) => {
                const etiqueta = `${MONTHS_SHORT[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(2, 4)}`
                return (
                  <div key={m.mes} className="group flex flex-1 flex-col">
                    <div className="flex flex-1 items-end">
                      <div
                        title={`${etiqueta}: ${m.reservas} reservas`}
                        className="animate-grow-bar w-full rounded-t-md bg-olive-100 transition-colors group-hover:bg-olive-400"
                        style={{
                          height: `${(m.reservas / maxMes) * 100}%`,
                          animationDelay: `${i * 60}ms`,
                        }}
                      />
                    </div>
                    <span className="mt-2 text-center text-xs text-muted">{etiqueta}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="font-serif-display text-2xl text-ink">Servicios más solicitados</h2>
              {/* Con reservas en el rango pero todas canceladas, la lista
                  llega vacia: las canceladas no son atenciones. */}
              {topServicios.length === 0 ? (
                <p className="mt-6 text-sm text-muted">Sin atenciones en este período.</p>
              ) : (
                <div className="mt-6 space-y-4">
                  {topServicios.map((s) => (
                    <Bar key={s.servicioId} label={s.nombre} value={s.reservas} max={maxServicio} />
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="font-serif-display text-2xl text-ink">Atenciones por profesional</h2>
              {indicadores.porProfesional.length === 0 ? (
                <p className="mt-6 text-sm text-muted">Sin atenciones en este período.</p>
              ) : (
                <div className="mt-6 space-y-4">
                  {indicadores.porProfesional.map((p) => (
                    <Bar key={p.profesionalId} label={p.nombre} value={p.reservas} max={maxProfesional} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="mt-6 p-6">
            <h2 className="font-serif-display text-2xl text-ink">Catálogo por categoría</h2>
            {catalogo.cargando && <p className="mt-6 text-sm text-muted">Cargando servicios…</p>}
            {!catalogo.cargando && catalogo.error && (
              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
                <p className="text-ink">{catalogo.error}</p>
                <Button variant="outline" className="px-4 py-2 text-xs" onClick={catalogo.recargar}>
                  Reintentar
                </Button>
              </div>
            )}
            {!catalogo.cargando && !catalogo.error && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {serviceCategories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{c.label}</span>
                    <span className="rounded-full bg-line-soft px-3 py-1 text-xs text-muted">
                      {catalogo.servicios.filter((s) => s.categoria === c.id).length} servicios
                    </span>
                  </div>
                ))}
              </div>
            )}
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
