import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { useEquipoConAgenda } from '@/modules/profesionales/ui/useEquipoConAgenda'
import { getNextAvailableSlots } from '@/shared/lib/availability'
import { AppImage, Button, Kicker } from '@/shared/ui/ui'

export default function Professionals() {
  // El equipo sale de la base. Antes venia de `useAppState`, que solo conoce
  // los datos de ejemplo: con el modo "solo Supabase" activo la lista salia
  // vacia, y sin el mostraba personas que no trabajan en el estudio y cuyos
  // ids no existen en la base, asi que el perfil daba "no encontrado".
  const { equipo, cargando, error } = useEquipoConAgenda()

  // Las reservas siguen siendo locales: es lo que hay para marcar las horas ya
  // tomadas al calcular las proximas disponibles.
  const { bookings, setBookingDraft } = useAppState()
  const navigate = useNavigate()

  function handleReservar(professionalId: string) {
    setBookingDraft(() => ({ professionalId }))
    navigate('/reservar')
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <Kicker>Equipo</Kicker>
      <h1 className="mt-2 font-serif-display text-5xl text-ink">Profesionales</h1>

      {cargando && (
        <p className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando el equipo…
        </p>
      )}

      {!cargando && error && (
        <p className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No pudimos cargar el equipo: {error}
        </p>
      )}

      {!cargando && !error && (
        <div className="stagger mt-10 grid gap-6 lg:grid-cols-2">
          {equipo.map((p) => {
            const nextSlots = getNextAvailableSlots(p, bookings, 3)
            return (
              <div
                key={p.id}
                className="card-hover flex gap-5 rounded-2xl border border-line-soft bg-paper p-6"
              >
                <AppImage
                  src={p.imageUrl}
                  label="Retrato"
                  alt={p.name}
                  className="aspect-[3/4] w-32 shrink-0 rounded-xl sm:w-40"
                />
                <div className="flex flex-1 flex-col">
                  <h2 className="font-serif-display text-2xl text-ink">{p.name}</h2>
                  <p className="text-sm text-muted">{p.role}</p>
                  {/* La tabla `profesionales` no tiene columna de biografia. El
                      hueco se deja vacio en vez de rellenarlo con un texto
                      inventado sobre una persona real. */}
                  <div className="flex-1" />

                  <Kicker className="mt-4">Próximas horas</Kicker>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {nextSlots.length === 0 ? (
                      <span className="text-sm text-muted-light">Sin horas disponibles</span>
                    ) : (
                      nextSlots.map((slot) => (
                        <span
                          key={`${slot.dateISO}-${slot.time}`}
                          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                        >
                          {slot.label}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="mt-4 flex gap-3">
                    <Button onClick={() => handleReservar(p.id)}>Reservar</Button>
                    <Link
                      to={`/profesionales/${p.id}`}
                      className="inline-flex items-center justify-center rounded-full border border-line px-6 py-3 text-sm font-medium text-ink hover:bg-ivory"
                    >
                      Ver perfil
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!cargando && !error && equipo.length === 0 && (
        <p className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Todavía no hay profesionales publicados.
        </p>
      )}
    </div>
  )
}
