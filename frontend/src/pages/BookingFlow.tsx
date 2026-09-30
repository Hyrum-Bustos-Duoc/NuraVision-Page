import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { categoryLabel } from '@/modules/servicios/domain/serviceCategories'
import type { Servicio } from '@/modules/servicios/domain/servicio.types'
import { useServicioDetalle } from '@/modules/servicios/ui/useServicioDetalle'
import { useServicios } from '@/modules/servicios/ui/useServicios'
import { fotoDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { useProfesionalesPorServicio } from '@/modules/profesionales/ui/useProfesionalesPorServicio'
import { useDisponibilidad } from '@/modules/profesionales/ui/useDisponibilidad'
import { getMonthDays, getSlotsForDate, minutesToTime, timeToMinutes } from '@/shared/lib/availability'
import { useCrearReserva } from '@/modules/reservas/ui/useCrearReserva'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { Stepper } from '@/shared/ui/Stepper'
import { useScrollToTopOnChange } from '@/shared/components/ScrollToTop'
import { Calendar } from '@/shared/components/Calendar'
import { TimeSlotGrid } from '@/shared/components/TimeSlotGrid'
import { AppImage, Avatar, Button, Kicker } from '@/shared/ui/ui'
import { formatLongDate, formatPrice, formatWeekdayLong, monthLabel } from '@/shared/lib/format'
import { TextField } from '@/shared/ui/form'
import { pointsForPrice } from '@/shared/lib/loyalty'
import type { Booking, Professional, ServiceCategoryId } from '@/shared/types'
import type { Profesional } from '@/modules/profesionales/domain/profesional.types'

type Step = 'service' | 'professional' | 'date' | 'time' | 'confirm'

/** Datos de quien reserva: de la cuenta si hay sesión, del formulario si no. */
type Contact = { name: string; email: string; phone: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Lo que el asistente necesita del servicio. Se construye desde la entidad de
 * dominio con valores por defecto para lo que la tabla aun no tiene, de modo
 * que una columna faltante nunca deje el resumen del borrador a medias.
 */
interface ServicioReservaVista {
  id: string
  nombre: string
  categoria: ServiceCategoryId
  duracionMinutos: number
  precioBase: number
  /**
   * La tabla `servicios` aun no tiene columna de imagen: la resuelve
   * `fotoDeServicio`, que siempre devuelve una. Por eso no es opcional y la
   * tarjeta nunca cae en el marcador a rayas.
   */
  imagenUrl: string
}

function toVista(servicio: Servicio): ServicioReservaVista {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    categoria: servicio.categoria,
    duracionMinutos: servicio.duracionMinutos,
    precioBase: servicio.precioBase,
    imagenUrl: fotoDeServicio(servicio),
  }
}

function generateCode(dateISO: string): string {
  const [, m, d] = dateISO.split('-')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `NV-${d}${m}-${random}`
}

function Aviso({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string
  descripcion: string
  accion?: { label: string; onClick: () => void }
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-10 text-center">
      <p className="font-medium text-ink">{titulo}</p>
      <p className="mt-2 text-sm text-muted">{descripcion}</p>
      {accion && (
        <button
          onClick={accion.onClick}
          className="mt-5 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-ivory"
        >
          {accion.label}
        </button>
      )}
    </div>
  )
}

export default function BookingFlow() {
  const { currentUser, bookingDraft, setBookingDraft, addBooking, bookings } = useAppState()
  const { usuario } = useAuth()
  // Reservar no exige cuenta. Si hay sesión, sus datos se completan solos; si
  // no, se piden en el paso de confirmación.
  //
  // La sesión de Supabase tiene prioridad sobre el usuario de demostración:
  // es la única que corresponde a una cuenta real, y por tanto la única que
  // puede quedar asociada a la reserva en la base.
  const cuenta: Contact | null = usuario
    ? {
        name: usuario.nombre ?? '',
        email: usuario.email,
        phone: usuario.telefono ?? '',
      }
    : currentUser?.role === 'cliente'
      ? { name: currentUser.name, email: currentUser.email, phone: currentUser.phone }
      : null
  const reserva = useCrearReserva()
  const [calendarView, setCalendarView] = useState({ year: 2026, month: 8 })
  // Los nombres se guardan junto a la reserva porque la pantalla final ya no
  // puede resolverlos: la reserva referencia ids de la base y los datos de
  // ejemplo no los conocen.
  const [confirmado, setConfirmado] = useState<{
    booking: Booking
    servicioNombre: string
    profesionalNombre: string
  } | null>(null)

  // Servicio, profesionales y horario salen de la base, no de los seeds.
  const servicioState = useServicioDetalle(bookingDraft.serviceId)
  const profesionalesState = useProfesionalesPorServicio(bookingDraft.serviceId)
  const disponibilidad = useDisponibilidad(bookingDraft.professionalId)

  /**
   * El calculo de horas (getMonthDays, getSlotsForDate) espera el `Professional`
   * del prototipo. En vez de duplicar esa logica, se arma uno con los datos de
   * la base y el horario ya convertido: asi la agenda sigue siendo el mismo
   * codigo, probado, y solo cambia de donde salen los datos.
   */
  const professional: Professional | undefined = useMemo(() => {
    const elegido = profesionalesState.profesionales.find((p) => p.id === bookingDraft.professionalId)
    if (!elegido) return undefined
    return {
      id: elegido.id,
      name: elegido.nombre,
      role: elegido.especialidad,
      experienceYears: 0,
      bio: '',
      serviceIds: [],
      imageUrl: elegido.avatarUrl ?? undefined,
      availability: disponibilidad.horario,
    }
  }, [profesionalesState.profesionales, bookingDraft.professionalId, disponibilidad.horario])


  const step: Step = !bookingDraft.serviceId
    ? 'service'
    : !bookingDraft.professionalId
      ? 'professional'
      : !bookingDraft.dateISO
        ? 'date'
        : !bookingDraft.time
          ? 'time'
          : 'confirm'

  // Cada paso del asistente vuelve al inicio de la pantalla.
  useScrollToTopOnChange(confirmado ? 'success' : step)

  if (confirmado) {
    return (
      <SuccessScreen
        booking={confirmado.booking}
        servicioNombre={confirmado.servicioNombre}
        profesionalNombre={confirmado.profesionalNombre}
        registered={!confirmado.booking.guest}
      />
    )
  }

  const service = servicioState.estado === 'listo' ? toVista(servicioState.servicio) : undefined

  const stepIndex = { service: 0, professional: 1, date: 2, time: 3, confirm: 4 }[step]

  function clearFrom(field: 'service' | 'professional' | 'date' | 'time') {
    setBookingDraft((d) => {
      const next = { ...d }
      if (field === 'service') {
        delete next.serviceId
        delete next.professionalId
        delete next.dateISO
        delete next.time
      } else if (field === 'professional') {
        delete next.professionalId
        delete next.dateISO
        delete next.time
      } else if (field === 'date') {
        delete next.dateISO
        delete next.time
      } else {
        delete next.time
      }
      return next
    })
  }

  // Pasados el primer paso, todo depende del servicio: si aún no llega, no se
  // puede pintar nada coherente debajo del Stepper.
  const esperandoServicio = step !== 'service' && servicioState.estado !== 'listo'

  // De la fecha en adelante todo depende del horario del profesional: si aún
  // no llega, falta o falló, no hay fechas que ofrecer.
  const pasosConAgenda = step === 'date' || step === 'time' || step === 'confirm'
  const esperandoHorario =
    !esperandoServicio &&
    pasosConAgenda &&
    (disponibilidad.cargando || disponibilidad.error !== null || disponibilidad.sinHorario)

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 overflow-x-auto">
        <div className="min-w-[560px]">
          <Stepper currentIndex={stepIndex} />
        </div>
      </div>

      {esperandoServicio && servicioState.estado === 'cargando' && (
        <Aviso titulo="Cargando el servicio…" descripcion="Estamos leyendo los datos de tu reserva." />
      )}

      {esperandoServicio && servicioState.estado === 'error' && (
        <Aviso
          titulo="No pudimos cargar el servicio"
          descripcion={servicioState.mensaje}
          accion={{ label: 'Elegir otro servicio', onClick: () => clearFrom('service') }}
        />
      )}

      {esperandoServicio && servicioState.estado === 'no-encontrado' && (
        <Aviso
          titulo="Ese servicio ya no está disponible"
          descripcion="Puede que haya cambiado de nombre o se haya dado de baja del catálogo."
          accion={{ label: 'Elegir otro servicio', onClick: () => clearFrom('service') }}
        />
      )}

      {step === 'service' && (
        <ServiceStep
          preselectedProfessional={professional}
          onSelect={(serviceId) => setBookingDraft((d) => ({ ...d, serviceId }))}
        />
      )}

      {step === 'professional' && service && (
        <ProfessionalStep
          service={service}
          profesionales={profesionalesState.profesionales}
          cargando={profesionalesState.cargando}
          error={profesionalesState.error}
          onBack={() => clearFrom('service')}
          onSelect={(professionalId) => setBookingDraft((d) => ({ ...d, professionalId }))}
        />
      )}

      {esperandoHorario && disponibilidad.cargando && (
        <Aviso titulo="Cargando la agenda…" descripcion="Estamos leyendo el horario del profesional." />
      )}

      {esperandoHorario && disponibilidad.error && (
        <Aviso
          titulo="No pudimos cargar la agenda"
          descripcion={disponibilidad.error}
          accion={{ label: 'Elegir otro profesional', onClick: () => clearFrom('professional') }}
        />
      )}

      {/* El profesional existe pero no tiene ni un bloque en `disponibilidad`:
          sin horario no hay fechas que ofrecer. Sin este aviso los pasos
          siguientes no renderizarian nada y la pantalla quedaria en blanco. */}
      {esperandoHorario && disponibilidad.sinHorario && (
        <Aviso
          titulo="Este profesional todavía no tiene agenda"
          descripcion="Aún no tiene horarios cargados, así que no podemos mostrar fechas ni horas disponibles."
          accion={{ label: 'Elegir otro profesional', onClick: () => clearFrom('professional') }}
        />
      )}

      {step === 'date' && !esperandoHorario && service && professional && (
        <DateStep
          service={service}
          professional={professional}
          days={getMonthDays(calendarView.year, calendarView.month, professional, bookings)}
          calendarView={calendarView}
          onChangeView={setCalendarView}
          onBack={() => clearFrom('professional')}
          onSelect={(dateISO) => setBookingDraft((d) => ({ ...d, dateISO }))}
        />
      )}

      {step === 'time' && !esperandoHorario && service && professional && bookingDraft.dateISO && (
        <TimeStep
          dateISO={bookingDraft.dateISO}
          professional={professional}
          slots={getSlotsForDate(bookingDraft.dateISO, professional, bookings)}
          onBack={() => clearFrom('date')}
          onChangeDate={() => clearFrom('date')}
          onSelect={(time) => setBookingDraft((d) => ({ ...d, time }))}
        />
      )}

      {step === 'confirm' && !esperandoHorario && service && professional && bookingDraft.dateISO && bookingDraft.time && (
        <ConfirmStep
          service={service}
          professionalName={professional.name}
          dateISO={bookingDraft.dateISO}
          time={bookingDraft.time}
          cuenta={cuenta}
          conSesion={usuario !== null}
          onBack={() => clearFrom('time')}
          guardando={reserva.guardando}
          errorAlGuardar={reserva.error}
          onConfirm={(contact) => {
            const codigo = generateCode(bookingDraft.dateISO!)
            const horaInicio = bookingDraft.time!
            // La hora de término se calcula al reservar y se guarda: si mañana
            // cambia la duración del servicio, esta reserva conserva el bloque
            // que realmente se tomó.
            const horaFin = minutesToTime(timeToMinutes(horaInicio) + service.duracionMinutos)

            void (async () => {
              const guardada = await reserva.crear({
                servicioId: service.id,
                profesionalId: professional.id,
                fecha: bookingDraft.dateISO!,
                horaInicio,
                horaFin,
                clienteNombre: contact.name,
                clienteEmail: contact.email,
                clienteTelefono: contact.phone,
                codigo,
                // Con sesión la reserva queda asociada a la cuenta, y es lo
                // único que después permite leerla: la política de RLS
                // entrega las filas cuyo cliente_id coincide con auth.uid().
                // Sin sesión va NULL, que es lo que la política de inserción
                // exige del rol anónimo.
                clienteId: usuario?.id ?? null,
        // El paso de variantes llega despues. Hasta entonces toda reserva se
        // crea sin eleccion, que es lo correcto para los 17 servicios actuales:
        // ninguno pregunta nada.
        varianteElegida: null,
              })

              // Si la base la rechazó no se avanza: el paso de confirmación
              // muestra el error y conserva lo elegido para reintentar.
              if (!guardada) return

              const booking: Booking = {
                id: `b-${Date.now()}`,
                code: codigo,
                serviceId: service.id,
                professionalId: professional.id,
                clientName: contact.name,
                clientEmail: contact.email,
                clientPhone: contact.phone,
                // Invitada es quien reserva sin cuenta de Supabase: solo esa
                // sesión deja la reserva asociada a un perfil. El usuario de
                // demostración no crea ninguna.
                guest: usuario === null,
                dateISO: bookingDraft.dateISO!,
                time: horaInicio,
                durationMin: service.duracionMinutos,
                price: service.precioBase,
                // La base la guarda como 'pendiente': confirmarla es decisión
                // del estudio, no de quien reserva.
                status: 'confirmada',
              }

              // El estado local sigue siendo el modelo de LECTURA: las
              // políticas no otorgan SELECT sobre `reservas`, así que
              // "mis reservas" no puede leerlas de la base todavía.
              addBooking(booking)
              setBookingDraft(() => ({}))
              setConfirmado({
                booking,
                servicioNombre: service.nombre,
                profesionalNombre: professional.name,
              })
            })()
          }}
        />
      )}
    </div>
  )
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-4 text-sm text-muted hover:text-ink">
      ← {label}
    </button>
  )
}

function ServiceStep({
  preselectedProfessional,
  onSelect,
}: {
  preselectedProfessional?: Professional
  onSelect: (serviceId: string) => void
}) {
  const { servicios, cargando, error } = useServicios()

  // Los profesionales siguen viniendo de los datos de ejemplo y referencian
  // servicios por los ids del prototipo, que no coinciden con los de la base.
  // Hasta que se migren, este filtro no cruza y la lista llega vacía.
  const list = preselectedProfessional
    ? servicios.filter((s) => preselectedProfessional.serviceIds.includes(s.id))
    : servicios

  return (
    <div>
      <h1 className="font-serif-display text-4xl text-ink">¿Qué servicio quieres?</h1>
      <p className="mt-2 text-sm text-muted">
        {preselectedProfessional ? (
          <>
            Servicios que realiza <strong className="text-ink">{preselectedProfessional.name}</strong>.
          </>
        ) : (
          'Explora el catálogo y elige el que prefieras.'
        )}
      </p>

      {cargando && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando el catálogo…
        </p>
      )}

      {error && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No pudimos cargar el catálogo: {error}
        </p>
      )}

      {!cargando && !error && (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="card-hover flex flex-col overflow-hidden rounded-2xl border border-line-soft bg-paper text-left"
              >
                {/* `overflow-hidden` del contenedor recorta la imagen con el
                    mismo radio de la tarjeta, sin redondearla por su cuenta:
                    asi no quedan esquinas dobles. */}
                <AppImage
                  src={fotoDeServicio(s)}
                  label={s.nombre.split(' ')[0].toUpperCase()}
                  alt={s.nombre}
                  className="aspect-[4/3] w-full"
                />
                <div className="p-5">
                  <Kicker>{categoryLabel(s.categoria)}</Kicker>
                  <h3 className="mt-1 font-serif-display text-lg text-ink">{s.nombre}</h3>
                  <div className="mt-3 flex items-center justify-between text-sm text-ink">
                    <span>{s.duracionMinutos} min</span>
                    <span className="font-medium">{formatPrice(s.precioBase)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {list.length === 0 && (
            <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
              No hay servicios disponibles por ahora.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function ProfessionalStep({
  service,
  profesionales,
  cargando,
  error,
  onBack,
  onSelect,
}: {
  service: ServicioReservaVista
  profesionales: Profesional[]
  cargando: boolean
  error: string | null
  onBack: () => void
  onSelect: (professionalId: string) => void
}) {
  return (
    <div>
      <BackLink label="Cambiar servicio" onClick={onBack} />
      <h1 className="font-serif-display text-4xl text-ink">¿Con quién?</h1>
      <p className="mt-2 text-sm text-muted">
        Profesionales que realizan <strong className="text-ink">{service.nombre}</strong>.
      </p>

      {cargando && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando profesionales…
        </p>
      )}

      {error && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No pudimos cargar los profesionales: {error}
        </p>
      )}

      {!cargando && !error && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {profesionales.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="flex items-center gap-4 rounded-2xl border border-line-soft bg-paper p-5 text-left hover:shadow-md"
              >
                {p.avatarUrl ? (
                  <AppImage
                    src={p.avatarUrl}
                    alt={p.nombre}
                    className="h-12 w-12 shrink-0 rounded-full"
                  />
                ) : (
                  <Avatar
                    initials={p.nombre
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  />
                )}
                <div>
                  <p className="font-medium text-ink">{p.nombre}</p>
                  <p className="text-sm text-muted">{p.especialidad}</p>
                </div>
              </button>
            ))}
          </div>

          {profesionales.length === 0 && (
            <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
              Este servicio aún no tiene profesionales asignados.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function DateStep({
  service,
  professional,
  days,
  calendarView,
  onChangeView,
  onBack,
  onSelect,
}: {
  service: ServicioReservaVista
  professional: Professional
  days: ReturnType<typeof getMonthDays>
  calendarView: { year: number; month: number }
  onChangeView: (v: { year: number; month: number }) => void
  onBack: () => void
  onSelect: (dateISO: string) => void
}) {
  return (
    <div>
      <BackLink label="Cambiar profesional" onClick={onBack} />
      <h1 className="font-serif-display text-4xl text-ink">Elige una fecha</h1>
      <p className="mt-2 text-sm text-muted">
        {service.nombre} con {professional.name} · {service.duracionMinutos} min
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Calendar
          monthLabel={monthLabel(calendarView.year, calendarView.month)}
          days={days}
          onSelectDate={onSelect}
          onPrevMonth={() =>
            onChangeView(
              calendarView.month === 0
                ? { year: calendarView.year - 1, month: 11 }
                : { year: calendarView.year, month: calendarView.month - 1 },
            )
          }
          onNextMonth={() =>
            onChangeView(
              calendarView.month === 11
                ? { year: calendarView.year + 1, month: 0 }
                : { year: calendarView.year, month: calendarView.month + 1 },
            )
          }
        />

        <div className="h-fit rounded-2xl bg-line-soft/60 p-6">
          <Kicker>Tu reserva</Kicker>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-muted">Servicio</dt>
              <dd className="mt-0.5 font-medium text-ink">{service.nombre}</dd>
            </div>
            <div>
              <dt className="text-muted">Profesional</dt>
              <dd className="mt-0.5 font-medium text-ink">{professional.name}</dd>
            </div>
            <div>
              <dt className="text-muted">Duración</dt>
              <dd className="mt-0.5 font-medium text-ink">{service.duracionMinutos} min</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">Total</span>
            <span className="font-serif-display text-2xl text-ink">
              {formatPrice(service.precioBase)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimeStep({
  dateISO,
  professional,
  slots,
  onBack,
  onChangeDate,
  onSelect,
}: {
  dateISO: string
  professional: Professional
  slots: ReturnType<typeof getSlotsForDate>
  onBack: () => void
  onChangeDate: () => void
  onSelect: (time: string) => void
}) {
  return (
    <div>
      <BackLink label="Cambiar fecha" onClick={onBack} />
      <h1 className="font-serif-display text-4xl text-ink">Elige tu hora</h1>
      <p className="mt-2 text-sm text-muted first-letter:uppercase">
        {formatWeekdayLong(dateISO)} · {professional.name}
      </p>

      <div className="mt-8">
        {slots.length > 0 ? (
          <TimeSlotGrid slots={slots} onSelect={onSelect} />
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            {professional.name} no atiende este día.
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-line p-6">
        <div>
          <p className="font-medium text-ink">¿Ninguna hora te sirve?</p>
          <p className="text-sm text-muted">
            Revisa otro día o cambia de profesional. Solo mostramos bloques realmente disponibles.
          </p>
        </div>
        <button
          onClick={onChangeDate}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-ivory"
        >
          Ver otra fecha
        </button>
      </div>
    </div>
  )
}

function ConfirmStep({
  service,
  professionalName,
  dateISO,
  time,
  cuenta,
  conSesion,
  onBack,
  onConfirm,
  guardando,
  errorAlGuardar,
}: {
  service: ServicioReservaVista
  professionalName: string
  dateISO: string
  time: string
  /** Datos de la cuenta con sesión, si los hay, para rellenar el formulario. */
  cuenta: Contact | null
  /** Sesión real de Supabase: es lo que decide si la reserva queda asociada. */
  conSesion: boolean
  onBack: () => void
  onConfirm: (contact: Contact) => void
  guardando: boolean
  errorAlGuardar: string | null
}) {
  const [contact, setContact] = useState<Contact>(
    () => cuenta ?? { name: '', email: '', phone: '' },
  )
  const [showErrors, setShowErrors] = useState(false)

  // Una cuenta de Supabase puede no tener nombre ni teléfono: al registrarse
  // solo el correo es obligatorio. Si falta algo se piden los datos igual, ya
  // rellenados con lo que se sepa, en vez de mandar a la base una reserva sin
  // nombre que la restricción CHECK va a rechazar.
  const datosCompletos = Boolean(
    cuenta && cuenta.name.trim() && cuenta.email.trim() && cuenta.phone.trim(),
  )

  const errors = useMemo(() => {
    const next: Partial<Record<keyof Contact, string>> = {}
    if (!contact.name.trim()) next.name = 'Necesitamos tu nombre.'
    if (!contact.email.trim()) next.email = 'Necesitamos un correo para enviarte el detalle.'
    else if (!EMAIL_RE.test(contact.email.trim())) next.email = 'El formato del correo no es válido.'
    if (!contact.phone.trim()) next.phone = 'Necesitamos un teléfono de contacto.'
    return next
  }, [contact])

  return (
    <div>
      <BackLink label="Cambiar hora" onClick={onBack} />
      <h1 className="font-serif-display text-4xl text-ink">Revisa y confirma</h1>
      <p className="mt-2 text-sm text-muted">
        Aún no está reservado. Verificamos la disponibilidad al confirmar.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-line-soft bg-paper">
          <div className="flex items-center gap-4 p-6">
            <AppImage
              src={service.imagenUrl}
              label={service.nombre.split(' ')[0].toUpperCase()}
              alt={service.nombre}
              className="h-16 w-16 shrink-0 rounded-xl"
            />
            <div>
              <p className="font-serif-display text-xl text-ink">{service.nombre}</p>
              <p className="text-sm text-muted">{categoryLabel(service.categoria)}</p>
            </div>
          </div>
          <div className="space-y-4 border-t border-line-soft p-6 text-sm">
            <Row label="Servicio" value={service.nombre} />
            <Row label="Profesional" value={professionalName} />
            <Row label="Fecha" value={formatLongDate(dateISO)} />
            <Row label="Hora" value={`${time} h`} />
            <Row label="Duración" value={`${service.duracionMinutos} min`} />
            <Row label="Lugar" value="Av. Libertad 1250, Viña del Mar" />
          </div>

          {/* Sin cuenta, el correo y el teléfono son el único vínculo con la
              reserva: no hay perfil donde consultarla después. */}
          <div className="border-t border-line-soft p-6">
            <Kicker>{datosCompletos ? 'Tus datos' : 'Tus datos de contacto'}</Kicker>
            {datosCompletos && cuenta ? (
              <p className="mt-3 text-sm text-muted">
                Reservas como <span className="text-ink">{cuenta.name}</span> ({cuenta.email}).
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <TextField
                  label="Nombre y apellido"
                  value={contact.name}
                  onChange={(name) => setContact({ ...contact, name })}
                  error={showErrors ? errors.name : undefined}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Correo electrónico"
                    value={contact.email}
                    onChange={(email) => setContact({ ...contact, email })}
                    error={showErrors ? errors.email : undefined}
                  />
                  <TextField
                    label="Teléfono"
                    value={contact.phone}
                    onChange={(phone) => setContact({ ...contact, phone })}
                    error={showErrors ? errors.phone : undefined}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="h-fit rounded-2xl bg-line-soft/60 p-6">
          <p className="text-sm text-muted">Total a pagar en el salón</p>
          <p className="mt-1 font-serif-display text-4xl text-ink">
            {formatPrice(service.precioBase)}
          </p>
          <Button
            full
            className="mt-6"
            disabled={guardando}
            onClick={() => {
              setShowErrors(true)
              if (Object.keys(errors).length > 0) return
              onConfirm({
                name: contact.name.trim(),
                email: contact.email.trim(),
                phone: contact.phone.trim(),
              })
            }}
          >
            {guardando ? 'Guardando…' : 'Confirmar reserva'}
          </Button>

          {/* La reserva no quedó guardada: se informa aquí y el botón sigue
              disponible para reintentar, sin perder lo que ya se eligió. */}
          {errorAlGuardar && (
            <p className="mt-3 rounded-xl border border-line px-4 py-3 text-sm text-ink">
              {errorAlGuardar}
            </p>
          )}
          <p className="mt-3 text-center text-xs text-muted">
            Puedes cancelar sin costo hasta 12 h antes de tu hora.
          </p>

          {!conSesion && (
            <div className="mt-5 border-t border-line pt-5 text-xs text-muted">
              <p>
                Estás reservando sin cuenta. Tu hora queda igual de confirmada, pero no quedará
                guardada en un perfil ni sumará los{' '}
                <span className="text-ink">
                  {pointsForPrice(service.precioBase)} puntos
                </span>{' '}
                que corresponden a este servicio.
              </p>
              <Link
                to="/registro"
                className="mt-2 inline-block font-medium text-ink underline underline-offset-2"
              >
                Crear una cuenta
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  )
}

function SuccessScreen({
  booking,
  servicioNombre,
  profesionalNombre,
  registered,
}: {
  booking: Booking
  servicioNombre: string
  /**
   * Llega ya resuelto desde el asistente, igual que el nombre del servicio.
   * Antes se buscaba con getProfessional() en los datos de ejemplo, pero la
   * reserva guarda el id de la base: ahi no existe y se mostraba un guion.
   * Consultarlo de nuevo seria una peticion de mas, porque el asistente ya
   * tiene el profesional en la mano al confirmar.
   */
  profesionalNombre: string
  registered: boolean
}) {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-olive-50 text-2xl text-olive-700">
        ✓
      </div>
      <h1 className="mt-6 font-serif-display text-4xl text-ink">Tu reserva está confirmada</h1>
      <p className="mt-3 text-sm text-muted">
        {registered
          ? 'Te enviamos el detalle a tu correo y un recordatorio 24 h antes.'
          : `Enviamos el detalle a ${booking.clientEmail}. Guarda tu código: es lo que necesitas para consultar o modificar tu hora.`}
      </p>

      <div className="mt-8 rounded-2xl border border-line-soft bg-paper p-6 text-left">
        <p className="text-xs font-medium tracking-wide text-muted-light">{booking.code}</p>
        <div className="mt-4 space-y-3 divide-y divide-line-soft text-sm [&>div]:pt-3 [&>div:first-child]:pt-0">
          <Row label="Servicio" value={servicioNombre} />
          <Row label="Profesional" value={profesionalNombre} />
          <Row label="Fecha" value={formatLongDate(booking.dateISO)} />
          <Row label="Hora" value={`${booking.time} h`} />
          <Row label="Duración" value={`${booking.durationMin} min`} />
          <Row label="Lugar" value="Av. Libertad 1250, Viña del Mar" />
        </div>
      </div>

      {/* Sin cuenta no hay perfil donde volver a ver la reserva; el registro
          es lo único que convierte esta hora en historial. */}
      {!registered && (
        <div className="mt-6 rounded-2xl border border-line-soft bg-line-soft/50 p-6 text-left">
          <p className="font-medium text-ink">Crea tu cuenta y no vuelvas a escribir tus datos</p>
          <p className="mt-2 text-sm text-muted">
            Con una cuenta ves tu historial completo, reprogramas o cancelas con un clic y acumulas
            puntos con cada atención — esta habría sumado{' '}
            <span className="text-ink">{pointsForPrice(booking.price)}</span>.
          </p>
          <Button className="mt-4" onClick={() => navigate('/registro')}>
            Crear mi cuenta
          </Button>
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {/* Al detalle de ESTA reserva, no al listado: es lo que se acaba de
            confirmar y lo que la persona quiere ver. */}
        {registered && (
          <Button onClick={() => navigate(`/mis-reservas/${booking.id}`)}>Ver mi reserva</Button>
        )}
        <Button variant={registered ? 'outline' : 'solid'} onClick={() => navigate('/')}>
          Volver al inicio
        </Button>
      </div>
    </div>
  )
}
