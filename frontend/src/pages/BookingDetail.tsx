import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { useServicioDetalle } from '@/modules/servicios/ui/useServicioDetalle'
import { useProfesionalesPorIds } from '@/modules/profesionales/ui/useProfesionalesPorIds'
import { useDisponibilidad } from '@/modules/profesionales/ui/useDisponibilidad'
import { useMiReserva } from '@/modules/reservas/ui/useMiReserva'
import { esCancelable, esReprogramable } from '@/modules/reservas/application'
import type { Professional } from '@/shared/types'
import { useToast } from '@/shared/state/Toast'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { getMonthDays, getSlotsForDate, timeToMinutes } from '@/shared/lib/availability'
import { Calendar } from '@/shared/components/Calendar'
import { TimeSlotGrid } from '@/shared/components/TimeSlotGrid'
import { Button, StatusBadge, type BadgeStatus } from '@/shared/ui/ui'
import { formatLongDate, formatPrice, monthLabel } from '@/shared/lib/format'

/**
 * La reserva que pinta esta pantalla, venga de donde venga.
 *
 * Con sesion sale de la base y se puede cancelar y reprogramar de verdad; sin
 * sesion sale del estado local del prototipo y los cambios no salen del
 * navegador. Unificarlas aqui evita repetir el renderizado entero dos veces.
 */
interface VistaReserva {
  origen: 'base' | 'local'
  id: string
  codigo: string
  servicioId: string
  profesionalId: string
  fecha: string
  hora: string
  duracionMin: number
  /** `null` cuando no se sabe: la base no guarda el precio cobrado. */
  precio: number | null
  estado: BadgeStatus
  cancelable: boolean
  reprogramable: boolean
}

export default function BookingDetail() {
  const { id } = useParams()
  const { bookings, rescheduleBooking, updateBookingStatus, getService, getProfessional } =
    useAppState()
  const { usuario, cargando: cargandoSesion } = useAuth()
  const { toast } = useToast()
  const [rescheduling, setRescheduling] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [draftDate, setDraftDate] = useState<string | undefined>()
  const [draftTime, setDraftTime] = useState<string | undefined>()
  const [calendarView, setCalendarView] = useState({ year: 2026, month: 8 })

  const miReserva = useMiReserva(id, usuario?.id ?? null)
  const bookingLocal = bookings.find((b) => b.id === id)

  // Con sesion manda la base. El estado local solo cubre a quien no la tiene.
  const vista: VistaReserva | undefined =
    miReserva.detalle.estado === 'listo'
      ? {
          origen: 'base',
          id: miReserva.detalle.reserva.id,
          codigo: miReserva.detalle.reserva.codigo,
          servicioId: miReserva.detalle.reserva.servicioId,
          profesionalId: miReserva.detalle.reserva.profesionalId,
          fecha: miReserva.detalle.reserva.fecha,
          hora: miReserva.detalle.reserva.horaInicio,
          // Con el bloque realmente tomado, que quedo congelado al reservar.
          duracionMin:
            timeToMinutes(miReserva.detalle.reserva.horaFin) -
            timeToMinutes(miReserva.detalle.reserva.horaInicio),
          precio: null,
          estado: miReserva.detalle.reserva.estado,
          cancelable: esCancelable(miReserva.detalle.reserva),
          reprogramable: esReprogramable(miReserva.detalle.reserva),
        }
      : !usuario && bookingLocal
        ? {
            origen: 'local',
            id: bookingLocal.id,
            codigo: bookingLocal.code,
            servicioId: bookingLocal.serviceId,
            profesionalId: bookingLocal.professionalId,
            fecha: bookingLocal.dateISO,
            hora: bookingLocal.time,
            duracionMin: bookingLocal.durationMin,
            precio: bookingLocal.price,
            estado: bookingLocal.status,
            cancelable: bookingLocal.status === 'confirmada' || bookingLocal.status === 'en_curso',
            reprogramable:
              bookingLocal.status === 'confirmada' || bookingLocal.status === 'en_curso',
          }
        : undefined

  // Los hooks van antes de cualquier return: su cantidad y orden no puede
  // cambiar entre renders.
  const servicioState = useServicioDetalle(vista?.servicioId)
  const profesionales = useProfesionalesPorIds(vista ? [vista.profesionalId] : [])
  const disponibilidad = useDisponibilidad(vista?.profesionalId)

  const profesionalDeLaBase = vista ? profesionales.porId.get(vista.profesionalId) : undefined

  /**
   * El calculo de horas espera el `Professional` del prototipo. Se arma uno
   * con los datos de la base y el horario ya convertido, para reutilizar esa
   * logica en vez de duplicarla.
   */
  const professionalConAgenda: Professional | undefined = profesionalDeLaBase
    ? {
        id: profesionalDeLaBase.id,
        name: profesionalDeLaBase.nombre,
        role: profesionalDeLaBase.especialidad,
        experienceYears: 0,
        bio: '',
        serviceIds: [],
        imageUrl: profesionalDeLaBase.avatarUrl ?? undefined,
        availability: disponibilidad.horario,
      }
    : undefined

  if (cargandoSesion || miReserva.detalle.estado === 'cargando') {
    return <Aviso texto="Cargando tu reserva…" />
  }

  if (miReserva.detalle.estado === 'error') {
    return <Aviso texto={miReserva.detalle.mensaje} />
  }

  if (!vista) {
    // Sin sesion, una reserva que existe en la base es indistinguible de una
    // que no existe: la politica de RLS no la devuelve. Conviene decirlo, en
    // vez de dar a entender que se perdio.
    return (
      <Aviso
        texto={
          usuario
            ? 'Reserva no encontrada.'
            : 'No encontramos esa reserva. Si la hiciste con tu cuenta, inicia sesión para verla.'
        }
      />
    )
  }

  /**
   * La base manda; los datos de ejemplo quedan de puente. Las reservas
   * anteriores a la migracion guardan ids del prototipo, que no existen en la
   * base: sin este respaldo mostrarian un hueco. Es transitorio.
   */
  const nombreServicio =
    (servicioState.estado === 'listo' ? servicioState.servicio.nombre : undefined) ??
    getService(vista.servicioId)?.name ??
    (servicioState.estado === 'cargando' ? 'Cargando…' : 'Servicio no disponible')

  const nombreProfesional =
    profesionalDeLaBase?.nombre ??
    getProfessional(vista.profesionalId)?.name ??
    (profesionales.cargando ? 'Cargando…' : 'Profesional no disponible')

  // La base no guarda cuanto se cobro, asi que se muestra el precio vigente
  // del servicio. Para una reserva antigua puede no ser el que se pago.
  const precio =
    vista.precio ?? (servicioState.estado === 'listo' ? servicioState.servicio.precioBase : null)

  // Para reprogramar hace falta agenda: la del profesional de la base, o la
  // del prototipo si esta reserva es anterior a la migracion.
  const professional = professionalConAgenda ?? getProfessional(vista.profesionalId)
  const puedeReprogramar = vista.reprogramable && Boolean(professional) && !disponibilidad.cargando
  const puedeCancelar = vista.cancelable

  async function confirmarCancelacion() {
    if (!vista) return

    if (vista.origen === 'base') {
      const ok = await miReserva.cancelar()
      if (!ok) return
    } else {
      updateBookingStatus(vista.id, 'cancelada')
    }

    toast({ title: 'Reserva cancelada', description: nombreServicio, tone: 'info' })
  }

  async function confirmarReprogramacion() {
    if (!vista || !draftDate || !draftTime) return

    if (vista.origen === 'base') {
      const ok = await miReserva.reprogramar(draftDate, draftTime)
      if (!ok) return
    } else {
      rescheduleBooking(vista.id, draftDate, draftTime)
    }

    setRescheduling(false)
    toast({
      title: 'Reserva reprogramada',
      description: `${formatLongDate(draftDate)} · ${draftTime} h`,
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/mis-reservas" className="text-sm text-muted hover:text-ink">
        ← Mis reservas
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <StatusBadge status={vista.estado} />
        <span className="text-xs tracking-wide text-muted-light">{vista.codigo}</span>
      </div>
      <h1 className="mt-2 font-serif-display text-4xl text-ink">{nombreServicio}</h1>

      {/* Reprogramar devuelve la reserva a "por confirmar": el bloque nuevo lo
          tiene que aceptar el estudio. Decirlo evita que parezca un error. */}
      {vista.origen === 'base' && vista.estado === 'pendiente' && (
        <p className="mt-3 text-sm text-muted">
          El estudio todavía tiene que confirmar esta hora. Te avisamos en cuanto lo haga.
        </p>
      )}

      <div className="mt-6 divide-y divide-line-soft rounded-2xl border border-line-soft bg-paper">
        <Row label="Servicio" value={nombreServicio} />
        <Row label="Profesional" value={nombreProfesional} />
        <Row label="Fecha" value={formatLongDate(vista.fecha)} />
        <Row label="Hora" value={`${vista.hora} h`} />
        <Row label="Duración" value={`${vista.duracionMin} min`} />
        <Row label="Lugar" value="Av. Libertad 1250, Viña del Mar" />
        {precio !== null && <Row label="Total" value={formatPrice(precio)} />}
      </div>

      <div className="mt-6 rounded-2xl bg-line-soft/60 p-6">
        <Kicker>Antes de tu hora</Kicker>
        <p className="mt-2 text-sm text-muted">
          Llega 5 minutos antes. Si necesitas cancelar, hazlo con al menos 12 horas de anticipación
          para liberar el bloque.
        </p>
      </div>

      {/* El fallo de un cambio se informa junto a los botones que lo
          provocaron, y estos siguen disponibles para reintentar. */}
      {miReserva.errorAccion && (
        <p className="mt-6 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
          {miReserva.errorAccion}
        </p>
      )}

      {!rescheduling && (puedeCancelar || puedeReprogramar) && (
        <div className="mt-6 flex flex-wrap gap-4">
          {puedeReprogramar && professional && (
            <Button disabled={miReserva.guardando} onClick={() => setRescheduling(true)}>
              Reprogramar
            </Button>
          )}
          {puedeCancelar && (
            <Button
              variant="danger-outline"
              disabled={miReserva.guardando}
              onClick={() => setConfirmingCancel(true)}
            >
              {miReserva.guardando ? 'Guardando…' : 'Cancelar reserva'}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        onConfirm={() => void confirmarCancelacion()}
        title="Cancelar reserva"
        confirmLabel="Cancelar reserva"
        description={
          <>
            Se liberará el bloque de {formatLongDate(vista.fecha)} a las {vista.hora} h. Esta
            acción no se puede deshacer.
          </>
        }
      />

      {rescheduling && puedeReprogramar && professional && (
        <div className="mt-8 rounded-2xl border border-line-soft bg-paper p-6">
          <h2 className="font-serif-display text-2xl text-ink">Elige nueva fecha y hora</h2>
          <p className="mt-2 text-sm text-muted">
            La reserva mantiene su duración de {vista.duracionMin} min y vuelve a quedar por
            confirmar.
          </p>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
            <Calendar
              monthLabel={monthLabel(calendarView.year, calendarView.month)}
              days={getMonthDays(calendarView.year, calendarView.month, professional, bookings)}
              selectedDateISO={draftDate}
              onSelectDate={(d) => {
                setDraftDate(d)
                setDraftTime(undefined)
              }}
              onPrevMonth={() =>
                setCalendarView((v) =>
                  v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 },
                )
              }
              onNextMonth={() =>
                setCalendarView((v) =>
                  v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 },
                )
              }
            />
            <div>
              {draftDate ? (
                <TimeSlotGrid
                  slots={getSlotsForDate(draftDate, professional, bookings)}
                  selectedTime={draftTime}
                  onSelect={setDraftTime}
                />
              ) : (
                <p className="text-sm text-muted">Elige primero una fecha.</p>
              )}
            </div>
          </div>
          <div className="mt-6 flex gap-4">
            <Button
              disabled={!draftDate || !draftTime || miReserva.guardando}
              onClick={() => void confirmarReprogramacion()}
            >
              {miReserva.guardando ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            <Button variant="outline" onClick={() => setRescheduling(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <p className="text-muted">{texto}</p>
      <Link to="/mis-reservas" className="mt-4 inline-block text-ink underline">
        Volver a mis reservas
      </Link>
    </div>
  )
}

function Kicker({ children }: { children: string }) {
  return <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{children}</p>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  )
}
