import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { categoryLabel } from '@/modules/servicios/domain/serviceCategories'
import { useProfesionalesPorServicio } from '@/modules/profesionales/ui/useProfesionalesPorServicio'
import { AppImage, Avatar, Button, Kicker, Placeholder } from '@/shared/ui/ui'
import { formatPrice } from '@/shared/lib/format'
import type { ServiceCategoryId } from '@/shared/types'
import type { Servicio } from '../domain/servicio.types'
import { useServicioDetalle } from './useServicioDetalle'
import { fotoDeServicio } from './servicio.imagenes'

/**
 * Lo que esta pantalla necesita pintar. La tabla `servicios` todavia no tiene
 * columnas de imagen, descripcion larga ni prestaciones incluidas, asi que
 * esos campos se rellenan con valores por defecto: la vista degrada en vez de
 * romperse, y cuando existan las columnas solo cambia este mapeo.
 */
interface ServicioDetalleVista {
  id: string
  nombre: string
  categoria: ServiceCategoryId
  descripcionLarga: string
  incluye: string[]
  duracionMinutos: number
  precioBase: number
  /**
   * La tabla `servicios` aun no tiene columna de imagen: la resuelve
   * `fotoDeServicio`, que siempre devuelve una. Por eso no es opcional y la
   * tarjeta nunca cae en el marcador a rayas.
   */
  imagenUrl: string
  /** Un servicio dado de baja se sigue pudiendo ver, pero no reservar. */
  activo: boolean
}

function toVista(servicio: Servicio): ServicioDetalleVista {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    categoria: servicio.categoria,
    descripcionLarga: servicio.descripcion || 'Este servicio aún no tiene una descripción.',
    // Sin columna en la base: la seccion "Incluye" se oculta sola al estar vacia.
    incluye: [],
    duracionMinutos: servicio.duracionMinutos,
    precioBase: servicio.precioBase,
    imagenUrl: fotoDeServicio(servicio),
    activo: servicio.activo,
  }
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 text-center">
      <p className="text-muted">{mensaje}</p>
      <Link to="/servicios" className="mt-4 inline-block text-ink underline">
        Volver a servicios
      </Link>
    </div>
  )
}

export default function ServiceDetail() {
  const { id } = useParams()
  const { setBookingDraft } = useAppState()
  const navigate = useNavigate()
  const resultado = useServicioDetalle(id)
  const {
    profesionales,
    cargando: cargandoProfesionales,
    error: errorProfesionales,
  } = useProfesionalesPorServicio(id)

  if (resultado.estado === 'cargando') {
    return <Aviso mensaje="Cargando servicio…" />
  }

  if (resultado.estado === 'error') {
    return <Aviso mensaje={`No pudimos cargar el servicio: ${resultado.mensaje}`} />
  }

  if (resultado.estado === 'no-encontrado') {
    return <Aviso mensaje="Servicio no encontrado." />
  }

  const service = toVista(resultado.servicio)

  function handleReservar() {
    setBookingDraft(() => ({ serviceId: service.id }))
    navigate('/reservar')
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Link to="/servicios" className="text-sm text-muted hover:text-ink">
        ← Servicios
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <AppImage
            src={service.imagenUrl}
            label={service.nombre.split(' ')[0].toUpperCase()}
            alt={service.nombre}
            className="aspect-[4/3] w-full rounded-2xl"
          />
          <div className="mt-3 grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Placeholder key={i} className="aspect-square w-full rounded-xl" />
            ))}
          </div>

          <Kicker className="mt-8">{categoryLabel(service.categoria)}</Kicker>
          <h1 className="mt-1 font-serif-display text-4xl text-ink">{service.nombre}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            {service.descripcionLarga}
          </p>

          {service.incluye.length > 0 && (
            <div className="mt-8 border-t border-line-soft pt-6">
              <Kicker>Incluye</Kicker>
              <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                {service.incluye.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-olive-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 border-t border-line-soft pt-6">
            <Kicker>Profesionales que lo realizan</Kicker>

            {cargandoProfesionales && (
              <p className="mt-3 text-sm text-muted">Cargando profesionales…</p>
            )}

            {errorProfesionales && (
              <p className="mt-3 text-sm text-muted">
                No pudimos cargar los profesionales: {errorProfesionales}
              </p>
            )}

            {!cargandoProfesionales && !errorProfesionales && profesionales.length === 0 && (
              <p className="mt-3 text-sm text-muted">
                Este servicio aún no tiene profesionales asignados.
              </p>
            )}

            {!cargandoProfesionales && !errorProfesionales && profesionales.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-4">
                {profesionales.map((p) => (
                  <Link key={p.id} to={`/profesionales/${p.id}`} className="flex items-center gap-3">
                    {p.avatarUrl ? (
                      <AppImage
                        src={p.avatarUrl}
                        alt={p.nombre}
                        className="h-9 w-9 shrink-0 rounded-full"
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
                      <p className="text-sm font-medium text-ink">{p.nombre}</p>
                      <p className="text-xs text-muted">{p.especialidad}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="h-fit rounded-2xl border border-line-soft bg-paper p-6">
          <div className="flex items-baseline justify-between">
            <p className="font-serif-display text-4xl text-ink">{formatPrice(service.precioBase)}</p>
            <span className="text-sm text-muted">{service.duracionMinutos} min</span>
          </div>

          <div className="mt-5 space-y-3 border-t border-line-soft pt-5 text-sm">
            <Row label="Duración" value={`${service.duracionMinutos} min`} />
            <Row label="Categoría" value={categoryLabel(service.categoria)} />
            <Row label="Modalidad" value="Presencial · Estudio Nura" />
          </div>

          {/* Aqui iba "Proximas horas". Se calculaba con la disponibilidad
              semanal de los datos de ejemplo, y la tabla `profesionales` no
              tiene columnas de horario: no hay con que calcularlo. Vuelve
              cuando el esquema incorpore la agenda. */}

          {/* Un servicio dado de baja sigue siendo accesible por enlace directo
              (y desde el historial), pero ya no admite nuevas reservas. */}
          {service.activo ? (
            <>
              <Button full className="mt-6" onClick={handleReservar}>
                Reservar este servicio
              </Button>
              <p className="mt-3 text-center text-xs text-muted">
                Cancelación gratuita hasta 12 h antes
              </p>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-line bg-line-soft/60 px-5 py-4 text-center text-sm text-muted">
              Este servicio no está disponible por ahora.{' '}
              <Link to="/servicios" className="text-ink underline">
                Ver el catálogo
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
