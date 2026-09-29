import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { EmptyState, LinkButton, StatusBadge, UnderlineTabs, type BadgeStatus } from '@/shared/ui/ui'
import { formatDayMonthShort, formatPrice } from '@/shared/lib/format'
import { timeToMinutes } from '@/shared/lib/availability'
import { useServiciosPorIds } from '@/modules/servicios/ui/useServiciosPorIds'
import { useProfesionalesPorIds } from '@/modules/profesionales/ui/useProfesionalesPorIds'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { useMisReservas } from '@/modules/reservas/ui/useMisReservas'
import type { Reserva } from '@/modules/reservas/domain/reserva.types'
import type { Booking } from '@/shared/types'

type Tab = 'proximas' | 'completadas' | 'canceladas'

const TABS: { value: Tab; label: string }[] = [
  { value: 'proximas', label: 'Próximas' },
  { value: 'completadas', label: 'Completadas' },
  { value: 'canceladas', label: 'Canceladas' },
]

/**
 * Fila del listado, sin importar de donde salga.
 *
 * Las reservas de la base y las del prototipo no tienen la misma forma, y
 * mezclar las dos en el renderizado llenaria la tabla de condicionales. Ambas
 * se convierten primero a esto.
 */
interface FilaReserva {
  id: string
  codigo: string
  servicioId: string
  profesionalId: string
  fecha: string
  hora: string
  duracionMin: number
  /** `null` cuando no se puede saber: la base no guarda el precio cobrado. */
  precio: number | null
  estado: BadgeStatus
  /**
   * Si la reserva se puede cambiar. Desde 0005 la base acepta cancelar y
   * reprogramar lo propio, asi que las dos fuentes tienen pantalla de detalle;
   * lo que cambia es que solo una reserva viva ofrece acciones ahi.
   */
  editable: boolean
}

const ESTADOS_POR_PESTANA: Record<Tab, BadgeStatus[]> = {
  // 'pendiente' es una hora ya tomada a la espera de que el estudio la
  // confirme: para quien reserva es una reserva proxima, no otra cosa.
  proximas: ['pendiente', 'confirmada', 'en_curso'],
  completadas: ['completada'],
  canceladas: ['cancelada'],
}

function desdeReserva(reserva: Reserva, precio: number | null): FilaReserva {
  return {
    id: reserva.id,
    codigo: reserva.codigo,
    servicioId: reserva.servicioId,
    profesionalId: reserva.profesionalId,
    fecha: reserva.fecha,
    hora: reserva.horaInicio,
    // La duracion se calcula con el bloque realmente tomado, que quedo
    // congelado al reservar. Usar la duracion actual del servicio mostraria
    // mal las reservas anteriores a un cambio de catalogo.
    duracionMin: timeToMinutes(reserva.horaFin) - timeToMinutes(reserva.horaInicio),
    precio,
    estado: reserva.estado,
    // Cancelar y reprogramar solo tienen sentido mientras la reserva sigue
    // viva; es la misma condicion que aplica la politica de 0005.
    editable: reserva.estado === 'pendiente' || reserva.estado === 'confirmada',
  }
}

function desdeBooking(booking: Booking): FilaReserva {
  return {
    id: booking.id,
    codigo: booking.code,
    servicioId: booking.serviceId,
    profesionalId: booking.professionalId,
    fecha: booking.dateISO,
    hora: booking.time,
    duracionMin: booking.durationMin,
    precio: booking.price,
    estado: booking.status,
    editable: booking.status === 'confirmada' || booking.status === 'en_curso',
  }
}

export default function MyBookings() {
  const { currentUser, bookings, getService, getProfessional } = useAppState()
  const { usuario, cargando: cargandoSesion } = useAuth()
  const [tab, setTab] = useState<Tab>('proximas')

  // Con sesion de Supabase manda la base. Sin ella queda el estado local, que
  // es lo unico que hay: una reserva de invitada se guarda con cliente_id NULL
  // y ninguna politica la devuelve.
  const deLaBase = useMisReservas(usuario?.id ?? null)

  const locales = useMemo(
    () => bookings.filter((b) => b.clientName === currentUser?.name),
    [bookings, currentUser],
  )

  // Una sola consulta por listado, no una por reserva.
  const idsServicios = useMemo(
    () => (usuario ? deLaBase.reservas.map((r) => r.servicioId) : locales.map((b) => b.serviceId)),
    [usuario, deLaBase.reservas, locales],
  )
  const idsProfesionales = useMemo(
    () =>
      usuario
        ? deLaBase.reservas.map((r) => r.profesionalId)
        : locales.map((b) => b.professionalId),
    [usuario, deLaBase.reservas, locales],
  )

  const servicios = useServiciosPorIds(idsServicios)
  const profesionales = useProfesionalesPorIds(idsProfesionales)

  const filas = useMemo<FilaReserva[]>(() => {
    if (usuario) {
      return deLaBase.reservas.map((r) =>
        // La base no guarda cuanto se cobro, asi que se muestra el precio
        // vigente del servicio. Para una reserva antigua puede no ser el que
        // se pago; es lo mas cercano disponible mientras no se guarde.
        desdeReserva(r, servicios.porId.get(r.servicioId)?.precioBase ?? null),
      )
    }
    return locales.map(desdeBooking)
  }, [usuario, deLaBase.reservas, locales, servicios.porId])

  const filtradas = useMemo(
    () => filas.filter((f) => ESTADOS_POR_PESTANA[tab].includes(f.estado)),
    [filas, tab],
  )

  /**
   * La base manda; los datos de ejemplo quedan de puente.
   *
   * Las reservas creadas antes de la migracion guardan ids del prototipo
   * ("manicure-ritual-nura"), que no existen en la base y nunca van a
   * resolverse contra ella. Sin este respaldo esas filas mostrarian un hueco.
   * Es transitorio: se puede quitar cuando se limpien los datos locales.
   */
  function nombreServicio(serviceId: string): string {
    const deLaBase = servicios.porId.get(serviceId)?.nombre
    if (deLaBase) return deLaBase
    const deLosSeeds = getService(serviceId)?.name
    if (deLosSeeds) return deLosSeeds
    return servicios.cargando ? 'Cargando…' : 'Servicio no disponible'
  }

  function nombreProfesional(professionalId: string): string {
    const deLaBase = profesionales.porId.get(professionalId)?.nombre
    if (deLaBase) return deLaBase
    const deLosSeeds = getProfessional(professionalId)?.name
    if (deLosSeeds) return deLosSeeds
    return profesionales.cargando ? 'Cargando…' : 'Profesional no disponible'
  }

  // Mientras se restaura la sesion guardada no se sabe de donde hay que leer.
  // Pintar el listado local en ese instante lo haria parpadear al llegar la
  // sesion y sustituirse por el de la base.
  const cargando = cargandoSesion || (usuario !== null && deLaBase.cargando)

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="font-serif-display text-5xl text-ink">Mis reservas</h1>

      {/* Sin cuenta no hay historial que consultar: la reserva de invitada no
          queda asociada a nadie y solo se puede seguir por su codigo. */}
      {!cargandoSesion && !usuario && (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-5 py-4 text-sm text-muted">
          No has iniciado sesión.{' '}
          <Link to="/login" className="font-medium text-ink underline underline-offset-2">
            Entra a tu cuenta
          </Link>{' '}
          para ver aquí las reservas que hiciste con ella.
        </p>
      )}

      <div className="mt-8">
        <UnderlineTabs options={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="mt-8 space-y-4">
        {cargando && (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Cargando tus reservas…
          </p>
        )}

        {!cargando && deLaBase.error && (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            No pudimos cargar tus reservas: {deLaBase.error}
          </p>
        )}

        {!cargando && !deLaBase.error && filtradas.length === 0 && (
          <EmptyState
            icon={CalendarX}
            title={
              tab === 'proximas'
                ? 'No tienes reservas próximas'
                : tab === 'completadas'
                  ? 'Todavía no hay reservas completadas'
                  : 'No tienes reservas canceladas'
            }
            description={
              tab === 'proximas'
                ? 'Cuando reserves una hora, aparecerá aquí con su detalle.'
                : undefined
            }
            action={tab === 'proximas' ? <LinkButton to="/reservar">Reservar ahora</LinkButton> : undefined}
          />
        )}

        {!cargando &&
          !deLaBase.error &&
          filtradas.map((f) => {
            const { day, month } = formatDayMonthShort(f.fecha)
            return (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-6 rounded-2xl border border-line-soft bg-paper p-6"
              >
                <div className="text-center">
                  <p className="font-serif-display text-3xl text-ink">{day}</p>
                  <p className="text-xs uppercase tracking-wide text-muted">{month}</p>
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-ink">{nombreServicio(f.servicioId)}</p>
                    <StatusBadge status={f.estado} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {nombreProfesional(f.profesionalId)} · {f.hora} · {f.duracionMin} min
                    {f.precio !== null && <> · {formatPrice(f.precio)}</>}
                  </p>
                  <p className="mt-1 text-xs tracking-wide text-muted-light">{f.codigo}</p>
                </div>
                <div className="flex gap-3">
                  <Link
                    to={`/mis-reservas/${f.id}`}
                    className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-ivory"
                  >
                    Detalle
                  </Link>
                  {f.editable && (
                    <Link
                      to={`/mis-reservas/${f.id}`}
                      className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-ivory"
                    >
                      Reprogramar
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
