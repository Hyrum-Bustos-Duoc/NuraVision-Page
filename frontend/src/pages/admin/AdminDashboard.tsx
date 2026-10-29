import { useState } from 'react'
import { CalendarCheck, Clock, TrendingDown, Users } from 'lucide-react'
import {
  ESTADOS_FILTRABLES,
  ETIQUETA_ESTADO,
  rangoDelDashboard,
  resumirDashboard,
  type EstadoReserva,
} from '@/modules/admin/application'
import { TablaReservas } from '@/modules/admin/ui/TablaReservas'
import { useIndicadores } from '@/modules/admin/ui/useIndicadores'
import { useReservasGestion } from '@/modules/admin/ui/useReservasGestion'
import { useProfesionales } from '@/modules/profesionales/ui/useProfesionales'
import { hoyEnElEstudio, partesISO } from '@/shared/lib/calendario'
import { formatLongDate, monthLabel, MONTHS_SHORT } from '@/shared/lib/format'
import { BarraFiltros, SelectFiltro } from '@/shared/ui/controles'
import { Button, Card, EmptyState, StatCard } from '@/shared/ui/ui'
import { contenedorPanel } from '@/shared/ui/nv-estilos'

const TODOS = 'todos'

/** Filas de "Reservas recientes". La consulta pide solo estas. */
const RECIENTES = 8

/** "2026-10" -> "Octubre 2026". */
function rotuloMes(mes: string): string {
  return monthLabel(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1)
}

export default function AdminDashboard() {
  // Se recalcula en cada render a proposito: si la pagina queda abierta pasada
  // la medianoche, el siguiente render ya pide el dia nuevo.
  const hoy = hoyEnElEstudio()
  const { anio, mes } = partesISO(hoy)

  // Las dos lecturas salen en paralelo: la de 7 meses (tarjetas del mes,
  // evolucion y top 5) y la de hoy (reservas hoy y por atender).
  const sieteMeses = useIndicadores(rangoDelDashboard(hoy))
  const delDia = useIndicadores({ desde: hoy, hasta: hoy })

  const [estado, setEstado] = useState<EstadoReserva | typeof TODOS>(TODOS)
  const [profesionalId, setProfesionalId] = useState<string>(TODOS)
  const recientes = useReservasGestion({
    estado: estado === TODOS ? undefined : estado,
    profesionalId: profesionalId === TODOS ? undefined : profesionalId,
    limite: RECIENTES,
  })
  // El filtro ofrece el equipo completo, no solo quienes salen en las 8 filas.
  const equipo = useProfesionales()

  const errorIndicadores = sieteMeses.error ?? delDia.error
  const resumen =
    sieteMeses.indicadores && delDia.indicadores
      ? resumirDashboard(sieteMeses.indicadores, delDia.indicadores, hoy)
      : null

  function reintentarIndicadores() {
    sieteMeses.recargar()
    delDia.recargar()
  }

  const maxEvolucion = Math.max(1, ...(resumen?.evolucion.map((m) => m.reservas) ?? []))
  const maxServicio = Math.max(1, ...(resumen?.topServicios.map((s) => s.reservas) ?? []))

  return (
    <div className={contenedorPanel}>
      <h1 className="font-serif-display text-4xl text-ink">Dashboard</h1>
      <p className="mt-2 text-sm text-muted">Estudio Nura · {formatLongDate(hoy)}</p>

      {errorIndicadores ? (
        // Sin tarjetas: con la lectura fallida, un 0 se leeria como un dato.
        <div className="mt-8">
          <EmptyState
            title="No se pudieron cargar los indicadores"
            description={errorIndicadores}
            action={
              <Button variant="outline" onClick={reintentarIndicadores}>
                Reintentar
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy={!resumen}>
            <StatCard
              label="Reservas del mes"
              value={resumen ? resumen.reservasDelMes.toLocaleString('es-CL') : '…'}
              caption={monthLabel(anio, mes)}
              icon={CalendarCheck}
            />
            <StatCard
              label="Reservas hoy"
              value={resumen ? resumen.reservasHoy.toLocaleString('es-CL') : '…'}
              caption={resumen ? `${resumen.porAtenderHoy} por atender` : 'Cargando…'}
              icon={Clock}
            />
            <StatCard
              label="Clientas registradas"
              value={resumen ? resumen.clientasRegistradas.toLocaleString('es-CL') : '…'}
              caption="Con cuenta en el sitio"
              icon={Users}
            />
            <StatCard
              label="Tasa de cancelación"
              value={resumen ? `${resumen.tasaCancelacionMes.toFixed(1)}%` : '…'}
              caption="Sobre las reservas del mes"
              captionTone={resumen && resumen.tasaCancelacionMes > 10 ? 'negative' : undefined}
              icon={TrendingDown}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-serif-display text-2xl text-ink">Evolución de reservas</h2>
                {resumen && (
                  <span className="text-sm text-muted">
                    {rotuloMes(resumen.evolucion[0].mes)} –{' '}
                    {rotuloMes(resumen.evolucion[resumen.evolucion.length - 1].mes)}
                  </span>
                )}
              </div>
              {!resumen ? (
                <p className="mt-8 text-sm text-muted">Cargando…</p>
              ) : (
                // La fila no usa items-end: cada columna debe estirarse para que
                // la altura porcentual de la barra tenga una referencia definida.
                <div className="mt-8 flex h-52 gap-4">
                  {resumen.evolucion.map((m, i) => {
                    const etiqueta = MONTHS_SHORT[Number(m.mes.slice(5, 7)) - 1]
                    return (
                      <div key={m.mes} className="group flex flex-1 flex-col">
                        <div className="flex flex-1 items-end">
                          <div
                            title={`${etiqueta}: ${m.reservas} reservas`}
                            className="animate-grow-bar w-full rounded-t-md bg-olive-100 transition-colors group-hover:bg-olive-400"
                            style={{
                              height: `${(m.reservas / maxEvolucion) * 100}%`,
                              animationDelay: `${i * 60}ms`,
                            }}
                          />
                        </div>
                        <span className="mt-2 text-center text-xs text-muted">{etiqueta}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="font-serif-display text-2xl text-ink">Servicios más solicitados</h2>
              {!resumen && <p className="mt-6 text-sm text-muted">Cargando…</p>}
              {resumen && resumen.topServicios.length === 0 && (
                <p className="mt-6 text-sm text-muted">Sin reservas en estos meses.</p>
              )}
              {resumen && resumen.topServicios.length > 0 && (
                <div className="mt-6 space-y-4">
                  {resumen.topServicios.map((s, i) => (
                    <div key={s.servicioId}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink">{s.nombre}</span>
                        <span className="text-ink">{s.reservas}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
                        <div
                          className="animate-grow-width h-1.5 rounded-full bg-olive-600"
                          style={{
                            width: `${(s.reservas / maxServicio) * 100}%`,
                            animationDelay: `${i * 80}ms`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-serif-display text-2xl text-ink">Reservas recientes</h2>
          <BarraFiltros>
            <SelectFiltro
              value={estado}
              onChange={setEstado}
              etiqueta="Filtrar por estado"
              opciones={[
                { value: TODOS, label: 'Todos los estados' },
                ...ESTADOS_FILTRABLES.map((e) => ({ value: e, label: ETIQUETA_ESTADO[e] })),
              ]}
            />
            <SelectFiltro
              value={profesionalId}
              onChange={setProfesionalId}
              etiqueta="Filtrar por profesional"
              opciones={[
                { value: TODOS, label: 'Todos los profesionales' },
                ...equipo.profesionales.map((p) => ({ value: p.id, label: p.nombre })),
              ]}
            />
          </BarraFiltros>
        </div>

        {recientes.errorConfirmar && (
          <p className="mb-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
            {recientes.errorConfirmar}
          </p>
        )}

        {recientes.cargando && (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Cargando reservas…
          </p>
        )}

        {!recientes.cargando && recientes.error && (
          <EmptyState
            title="No se pudieron cargar las reservas"
            description={recientes.error}
            action={
              <Button variant="outline" onClick={recientes.recargar}>
                Reintentar
              </Button>
            }
          />
        )}

        {!recientes.cargando && !recientes.error && recientes.reservas.length === 0 && (
          <EmptyState title="No hay reservas para estos filtros" />
        )}

        {!recientes.cargando && !recientes.error && recientes.reservas.length > 0 && (
          <TablaReservas
            reservas={recientes.reservas}
            confirmando={recientes.confirmando}
            onConfirmar={(r) => void recientes.confirmar(r)}
          />
        )}
      </div>
    </div>
  )
}
