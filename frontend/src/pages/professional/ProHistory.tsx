import { formatDayMonthShort } from '@/shared/lib/format'
import { StatusBadge } from '@/shared/ui/ui'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'
import { useReservasGestion } from '@/modules/admin/ui/useReservasGestion'
import { useServiciosPorIds } from '@/modules/servicios/ui/useServiciosPorIds'

export default function ProHistory() {
  // La ficha sale de la base, no del usuario de demostracion.
  const mia = useMiFichaProfesional()
  const profesionalId = mia.profesional?.id

  /**
   * Las reservas se leen con el repositorio de gestion del modulo admin,
   * filtradas por esta ficha.
   *
   * Se reutiliza el repositorio del modulo admin porque la consulta es la
   * misma —reservas filtradas por profesional—; lo que cambia es QUIEN puede
   * verlas, y eso lo decide la base, no este archivo.
   *
   * Desde 0007 una cuenta con `profesional_id` en su `app_metadata` lee las
   * horas que le toca atender, sin necesidad de `es_staff`. Sin ese vinculo
   * —por ejemplo con una ficha elegida a mano en el selector— la base no
   * devuelve nada, y el aviso de abajo lo explica.
   */
  const reservas = useReservasGestion({ profesionalId }, profesionalId !== undefined)

  const servicios = useServiciosPorIds(reservas.reservas.map((r) => r.servicioId))

  if (!mia.profesional) {
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
      {!mia.vinculoDeclarado && (
        <FichaActiva nombre={mia.profesional.nombre} onCambiar={() => mia.elegir(null)} />
      )}

      <h1 className="font-serif-display text-4xl text-ink">Reservas e historial</h1>
      <p className="mt-2 text-sm text-muted">
        Las reservas de {mia.profesional.nombre}, leídas de la base de datos.
      </p>

      {reservas.cargando && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando reservas…
        </p>
      )}

      {!reservas.cargando && reservas.error && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink">
          {reservas.error}
        </p>
      )}

      {/* Vacio y sin permiso son indistinguibles: RLS filtra las filas en vez
          de dar error. Se nombran los dos en vez de afirmar solo uno. */}
      {!reservas.cargando && !reservas.error && reservas.reservas.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="font-medium text-ink">No hay reservas que mostrar</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            O todavía no tiene ninguna, o esta sesión no tiene permiso para leerlas. La base
            entrega las horas de quien tenga <code>profesional_id</code> en su{' '}
            <code>app_metadata</code>; elegir una ficha en el selector decide qué panel se
            muestra, pero no otorga ese permiso.
          </p>
        </div>
      )}

      {!reservas.cargando && !reservas.error && reservas.reservas.length > 0 && (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-line-soft bg-paper">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft bg-ivory/60 text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Hora</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Servicio</th>
                <th className="px-6 py-4 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {reservas.reservas.map((r) => {
                const { day, month } = formatDayMonthShort(r.fecha)
                return (
                  <tr key={r.id}>
                    <td className="px-6 py-4 text-ink">
                      {day} {month}
                    </td>
                    <td className="px-6 py-4 text-ink">
                      {r.horaInicio}–{r.horaFin}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-ink">{r.clienteNombre}</p>
                      <p className="text-xs text-muted">{r.clienteEmail}</p>
                    </td>
                    <td className="px-6 py-4 text-ink">
                      {servicios.porId.get(r.servicioId)?.nombre ??
                        (servicios.cargando ? 'Cargando…' : '—')}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={r.estado} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
