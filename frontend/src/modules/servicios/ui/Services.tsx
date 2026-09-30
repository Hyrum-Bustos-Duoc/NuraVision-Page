import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { categoryLabel, serviceCategories } from '@/modules/servicios/domain/serviceCategories'
import { SearchX } from 'lucide-react'
import { AppImage, Button, EmptyState, FilterPills, Kicker } from '@/shared/ui/ui'
import type { ServiceCategoryId } from '@/shared/types'
import type { Servicio } from '../domain/servicio.types'
import { useServicios } from './useServicios'
import { fotoDeServicio } from './servicio.imagenes'
import { etiquetaDePrecio } from './precio'

type Filter = 'todos' | ServiceCategoryId

/**
 * Lo que esta tarjeta necesita pintar. Se construye desde la entidad de
 * dominio con valores por defecto para lo que el esquema todavia no tiene,
 * de modo que una columna faltante degrade la vista en vez de romperla.
 */
interface ServicioVista {
  id: string
  nombre: string
  categoria: ServiceCategoryId
  descripcion: string
  duracionMinutos: number
  precioBase: number
  variantes: Servicio['variantes']
  /**
   * La tabla `servicios` aun no tiene columna de imagen: la resuelve
   * `fotoDeServicio`, que siempre devuelve una. Por eso no es opcional y la
   * tarjeta nunca cae en el marcador a rayas.
   */
  imagenUrl: string
}

function toVista(servicio: Servicio): ServicioVista {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    categoria: servicio.categoria,
    descripcion: servicio.descripcion || 'Sin descripción disponible.',
    duracionMinutos: servicio.duracionMinutos,
    precioBase: servicio.precioBase,
    variantes: servicio.variantes,
    imagenUrl: fotoDeServicio(servicio),
  }
}

export default function Services() {
  const { setBookingDraft } = useAppState()
  const { servicios, cargando, error } = useServicios()
  const [category, setCategory] = useState<Filter>('todos')
  const navigate = useNavigate()

  const items = useMemo(() => servicios.map(toVista), [servicios])

  // Solo se ofrecen los filtros que tienen servicios en el catálogo.
  const filters = useMemo(
    () => [
      { value: 'todos' as const, label: 'Todos' },
      ...serviceCategories
        .filter((c) => items.some((s) => s.categoria === c.id))
        .map((c) => ({ value: c.id, label: c.label })),
    ],
    [items],
  )

  const filtered = useMemo(
    () => (category === 'todos' ? items : items.filter((s) => s.categoria === category)),
    [items, category],
  )

  function handleReservar(serviceId: string) {
    setBookingDraft(() => ({ serviceId }))
    navigate('/reservar')
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <Kicker>Catálogo</Kicker>
      <h1 className="mt-2 font-serif-display text-5xl text-ink">Servicios</h1>
      <p className="mt-3 max-w-xl text-base text-muted">
        Precios y duraciones referenciales. La disponibilidad se confirma al reservar.
      </p>

      {cargando && <p className="mt-10 text-sm text-muted">Cargando servicios…</p>}

      {error && (
        <div className="mt-10 rounded-2xl border border-line bg-paper p-6">
          <h2 className="font-serif-display text-xl text-ink">No pudimos cargar el catálogo</h2>
          <p className="mt-2 text-sm text-muted">{error}</p>
        </div>
      )}

      {!cargando && !error && (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <FilterPills options={filters} value={category} onChange={setCategory} />
            <span className="text-sm text-muted">
              {filtered.length} {filtered.length === 1 ? 'servicio' : 'servicios'}
            </span>
          </div>

          <div key={category} className="stagger mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="card-hover flex flex-col overflow-hidden rounded-2xl border border-line-soft bg-paper"
              >
                <Link to={`/servicios/${s.id}`}>
                  <AppImage
                    src={s.imagenUrl}
                    label={s.nombre.split(' ')[0].toUpperCase()}
                    alt={s.nombre}
                    className="aspect-[4/3] w-full"
                  />
                </Link>
                <div className="flex flex-1 flex-col p-6">
                  <Kicker>{categoryLabel(s.categoria)}</Kicker>
                  <Link to={`/servicios/${s.id}`}>
                    <h3 className="mt-1 font-serif-display text-xl text-ink hover:text-olive-700">
                      {s.nombre}
                    </h3>
                  </Link>
                  <p className="mt-2 flex-1 text-sm text-muted">{s.descripcion}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-4 text-sm text-ink">
                    <span>{s.duracionMinutos} min</span>
                    <span className="font-medium">{etiquetaDePrecio(s)}</span>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <Button onClick={() => handleReservar(s.id)} className="flex-1">
                      Reservar
                    </Button>
                    <Link
                      to={`/servicios/${s.id}`}
                      className="inline-flex items-center justify-center rounded-full border border-line px-5 py-3 text-sm font-medium text-ink hover:bg-ivory"
                    >
                      Detalle
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="mt-10">
              <EmptyState
                icon={SearchX}
                title={
                  items.length === 0
                    ? 'Todavía no hay servicios cargados'
                    : 'No hay servicios en esta categoría'
                }
                description={
                  items.length === 0
                    ? 'El catálogo se lee desde la base de datos y aún no tiene registros.'
                    : 'Prueba con otra categoría o vuelve a “Todos”.'
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
