import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { useProfesionalesPorIds } from '@/modules/profesionales/ui/useProfesionalesPorIds'
import { useDisponibilidad } from '@/modules/profesionales/ui/useDisponibilidad'
import { useServiciosDeProfesional } from '@/modules/servicios/ui/useServiciosDeProfesional'
import { TODAY_ISO } from '@/shared/data/seed'
import { getSlotsForDate } from '@/shared/lib/availability'
import type { Professional } from '@/shared/types'
import { AppImage, Kicker } from '@/shared/ui/ui'
import { formatPrice, getWeekDates, parseISODate, WEEKDAYS_SHORT } from '@/shared/lib/format'

export default function ProfessionalDetail() {
  const { id } = useParams()
  // Las reservas siguen siendo locales: es lo que hay para marcar las horas ya
  // tomadas en la vista semanal.
  const { bookings, setBookingDraft } = useAppState()
  const navigate = useNavigate()

  // Todo sale de la base. Antes se buscaba con `getProfessional(id)` sobre los
  // datos de ejemplo, que no conocen los ids reales: al llegar desde un
  // servicio la pantalla siempre decia "Profesional no encontrado".
  const profesionales = useProfesionalesPorIds(id ? [id] : [])
  const servicios = useServiciosDeProfesional(id)
  const disponibilidad = useDisponibilidad(id)

  const profesional = id ? profesionales.porId.get(id) : undefined

  if (profesionales.cargando) {
    return <Aviso texto="Cargando el perfil…" />
  }

  if (profesionales.error) {
    return <Aviso texto={`No pudimos cargar el perfil: ${profesionales.error}`} />
  }

  if (!profesional) {
    return <Aviso texto="Profesional no encontrado." />
  }

  /**
   * El calculo de horas espera el `Professional` del prototipo. Se arma uno
   * con los datos de la base y el horario ya convertido, para reutilizar esa
   * logica en vez de duplicarla.
   */
  const professional: Professional = {
    id: profesional.id,
    name: profesional.nombre,
    role: profesional.especialidad,
    experienceYears: 0,
    bio: '',
    serviceIds: [],
    imageUrl: profesional.avatarUrl ?? undefined,
    availability: disponibilidad.horario,
  }

  const weekDates = getWeekDates(TODAY_ISO)

  function goToBooking(serviceId: string) {
    setBookingDraft(() => ({ serviceId, professionalId: professional.id }))
    navigate('/reservar')
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Link to="/profesionales" className="text-sm text-muted hover:text-ink">
        ← Profesionales
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <AppImage
          src={professional.imageUrl}
          label="Retrato profesional"
          alt={professional.name}
          className="aspect-[3/4] w-full rounded-2xl"
        />

        <div>
          <h1 className="font-serif-display text-4xl text-ink">{professional.name}</h1>
          {/* La tabla no guarda años de experiencia ni biografia, asi que ya no
              se anuncian: decir "0 años de experiencia" sobre una persona real
              es peor que no decir nada. */}
          <p className="mt-1 text-sm text-muted">{professional.role}</p>

          <div className="mt-8 border-t border-line-soft pt-6">
            <Kicker>Servicios que realiza</Kicker>
            <div className="mt-3 divide-y divide-line-soft">
              {servicios.servicios.map((servicio) => (
                <div key={servicio.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{servicio.nombre}</p>
                    <p className="text-xs text-muted">{servicio.duracionMinutos} min</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-ink">{formatPrice(servicio.precioBase)}</span>
                    <button
                      onClick={() => goToBooking(servicio.id)}
                      className="text-sm font-medium text-ink hover:text-olive-700"
                    >
                      Reservar →
                    </button>
                  </div>
                </div>
              ))}

              {servicios.cargando && <p className="py-3 text-sm text-muted">Cargando servicios…</p>}

              {!servicios.cargando && servicios.error && (
                <p className="py-3 text-sm text-muted">
                  No pudimos cargar sus servicios: {servicios.error}
                </p>
              )}

              {!servicios.cargando && !servicios.error && servicios.servicios.length === 0 && (
                <p className="py-3 text-sm text-muted">Sin servicios asignados por ahora.</p>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-line-soft pt-6">
            <div className="mb-4 flex items-center justify-between">
              <Kicker>Disponibilidad esta semana</Kicker>
              <button
                onClick={() => {
                  setBookingDraft(() => ({ professionalId: professional.id }))
                  navigate('/reservar')
                }}
                className="text-sm font-medium text-ink hover:text-olive-700"
              >
                Ver agenda completa
              </button>
            </div>

            {disponibilidad.cargando && (
              <p className="text-sm text-muted">Cargando su agenda…</p>
            )}

            {!disponibilidad.cargando && disponibilidad.error && (
              <p className="text-sm text-muted">
                No pudimos cargar su agenda: {disponibilidad.error}
              </p>
            )}

            {/* Existe pero no tiene ni un bloque cargado: sin horario no hay
                semana que pintar, y una fila de siete "Cerrado" daria a
                entender que no atiende nunca. */}
            {!disponibilidad.cargando && !disponibilidad.error && disponibilidad.sinHorario && (
              <p className="text-sm text-muted">Todavía no tiene horarios publicados.</p>
            )}

            {!disponibilidad.cargando && !disponibilidad.error && !disponibilidad.sinHorario && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-7">
                {weekDates.map((dateISO) => {
                  const date = parseISODate(dateISO)
                  const slots = getSlotsForDate(dateISO, professional, bookings)
                  const preview = slots
                    .filter((s) => s.status === 'disponible' || s.status === 'reservado')
                    .slice(0, 3)

                  return (
                    <div key={dateISO} className="rounded-xl border border-line-soft p-3 text-center">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        {WEEKDAYS_SHORT[date.getDay()]}
                      </p>
                      <p className="font-serif-display text-lg text-ink">{date.getDate()}</p>
                      <div className="mt-2 space-y-1">
                        {slots.length === 0 && <p className="text-xs text-muted-light">Cerrado</p>}
                        {slots.length > 0 && preview.length === 0 && (
                          <p className="text-xs text-muted-light">Sin cupos</p>
                        )}
                        {preview.map((s) => (
                          <p
                            key={s.time}
                            className={`text-xs ${
                              s.status === 'reservado' ? 'text-muted-light line-through' : 'text-ink'
                            }`}
                          >
                            {s.time}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 text-center">
      <p className="text-muted">{texto}</p>
      <Link to="/profesionales" className="mt-4 inline-block text-ink underline">
        Volver a profesionales
      </Link>
    </div>
  )
}
