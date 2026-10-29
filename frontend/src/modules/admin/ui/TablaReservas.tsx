import { useProfesionalesPorIds } from '@/modules/profesionales/ui/useProfesionalesPorIds'
import { useServiciosPorIds } from '@/modules/servicios/ui/useServiciosPorIds'
import { formatLongDate, formatPrice } from '@/shared/lib/format'
import { Button, StatusBadge } from '@/shared/ui/ui'
import { tabla } from '@/shared/ui/nv-estilos'
import { esConfirmable } from '../application'
import type { ReservaGestion } from '../domain/reserva-gestion.types'

/**
 * Tabla de reservas del estudio, con la accion de confirmar.
 *
 * La comparten el panel de reservas y "Reservas recientes" del Dashboard. Los
 * estados de carga, error y vacio del listado quedan fuera: cada pantalla los
 * explica a su manera.
 */
export function TablaReservas({
  reservas,
  busqueda = '',
  confirmando,
  onConfirmar,
}: {
  reservas: ReservaGestion[]
  /** Filtro por nombre o codigo, aplicado en memoria sobre `reservas`. */
  busqueda?: string
  /** id de la reserva que se esta confirmando, o `null`. */
  confirmando: string | null
  onConfirmar: (reserva: ReservaGestion) => void
}) {
  // Los nombres se resuelven sobre todo el listado y no sobre lo visible: si
  // no, cada letra de la busqueda que cambiara el conjunto de ids lanzaria
  // otra consulta. Una sola consulta por listado, no una por fila.
  const servicios = useServiciosPorIds(reservas.map((r) => r.servicioId))
  const profesionales = useProfesionalesPorIds(reservas.map((r) => r.profesionalId))

  /**
   * La busqueda si se hace en memoria, y a proposito: es un filtro de tecleo
   * que cambia en cada pulsacion, y mandarlo a la base seria una consulta por
   * letra. Actua sobre lo que los filtros de la base ya acotaron.
   */
  const termino = busqueda.trim().toLowerCase()
  const visibles = termino
    ? reservas.filter(
        (r) =>
          r.clienteNombre.toLowerCase().includes(termino) ||
          r.codigo.toLowerCase().includes(termino),
      )
    : reservas

  function nombreServicio(id: string): string {
    return servicios.porId.get(id)?.nombre ?? (servicios.cargando ? 'Cargando…' : '—')
  }

  function nombreProfesional(id: string): string {
    return profesionales.porId.get(id)?.nombre ?? (profesionales.cargando ? 'Cargando…' : '—')
  }

  return (
    <div className={tabla.contenedor}>
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className={tabla.cabecera}>
            <th className={tabla.th}>Código</th>
            <th className={tabla.th}>Cliente</th>
            <th className={tabla.th}>Servicio</th>
            <th className={tabla.th}>Profesional</th>
            <th className={tabla.th}>Fecha y hora</th>
            <th className={tabla.th}>Estado</th>
            <th className={tabla.th}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {visibles.map((r) => (
            <tr key={r.id} className={tabla.fila}>
              <td className={`${tabla.td} whitespace-nowrap font-mono text-xs text-muted`}>{r.codigo}</td>
              <td className={tabla.td}>
                <p className="text-ink">{r.clienteNombre}</p>
                <p className="text-xs text-muted">{r.clienteEmail}</p>
                {/* Una reserva de invitada no tiene cuenta asociada: el
                    contacto es el único vínculo con ella. */}
                {r.clienteId === null && <p className="mt-0.5 text-xs text-muted-light">Sin cuenta</p>}
              </td>
              <td className={tabla.td}>
                <p className="text-ink">{nombreServicio(r.servicioId)}</p>
                {/* Copia fijada por la base al reservar; con 0 no hay linea. */}
                {r.abono > 0 && <p className="text-xs text-muted">Abono {formatPrice(r.abono)}</p>}
              </td>
              <td className={`${tabla.td} text-ink`}>{nombreProfesional(r.profesionalId)}</td>
              <td className={`${tabla.td} whitespace-nowrap text-ink`}>
                <p className="first-letter:uppercase">{formatLongDate(r.fecha)}</p>
                <p className="text-xs text-muted">
                  {r.horaInicio}–{r.horaFin} h
                </p>
              </td>
              <td className={tabla.td}>
                <StatusBadge status={r.estado} />
              </td>
              <td className={`${tabla.td} text-right`}>
                {esConfirmable(r) && (
                  <Button
                    variant="olive"
                    className="whitespace-nowrap px-4 py-2 text-xs"
                    disabled={confirmando === r.id}
                    onClick={() => onConfirmar(r)}
                  >
                    {confirmando === r.id ? 'Confirmando…' : 'Confirmar'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {visibles.length === 0 && termino && (
        <p className="px-6 py-10 text-center text-sm text-muted">
          Ninguna reserva coincide con «{busqueda}».
        </p>
      )}
    </div>
  )
}
