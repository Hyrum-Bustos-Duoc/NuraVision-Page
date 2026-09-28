import { categoryLabel } from '@/modules/servicios/domain/serviceCategories'
import { imagenDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { useServiciosDeProfesional } from '@/modules/servicios/ui/useServiciosDeProfesional'
import { AppImage, Card, Kicker } from '@/shared/ui/ui'
import { formatPrice } from '@/shared/lib/format'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'

export default function ProServices() {
  // La ficha sale de la base: antes se buscaba en los datos de ejemplo con el
  // `professionalId` del usuario de demostracion y, con el modo "solo
  // Supabase" activo, no habia nada que encontrar.
  const mia = useMiFichaProfesional()
  const professional = mia.ficha

  // Los servicios salen de la tabla puente, no de `serviceIds`: la ficha que
  // arma el hook deja ese campo vacio a proposito, porque la entidad de la
  // base no lo trae y rellenarlo obligaria a una consulta que no todas las
  // pantallas necesitan.
  const servicios = useServiciosDeProfesional(mia.profesional?.id)

  if (!professional) {
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
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      {!mia.vinculoDeclarado && mia.profesional && (
        <FichaActiva nombre={mia.profesional.nombre} onCambiar={() => mia.elegir(null)} />
      )}

      <h1 className="font-serif-display text-4xl text-ink">Mis servicios</h1>
      <p className="mt-2 text-sm text-muted">
        Servicios del catálogo que realizas actualmente. La administración del estudio define
        precios y duraciones.
      </p>

      {servicios.cargando && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando tus servicios…
        </p>
      )}

      {!servicios.cargando && servicios.error && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No pudimos cargar tus servicios: {servicios.error}
        </p>
      )}

      {!servicios.cargando && !servicios.error && (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {servicios.servicios.map((servicio) => (
            <Card key={servicio.id} className="flex items-center gap-4 p-5">
              <AppImage
                src={imagenDeServicio(servicio.nombre, servicio.categoria)}
                label={servicio.nombre.split(' ')[0].toUpperCase()}
                alt={servicio.nombre}
                className="h-16 w-16 shrink-0 rounded-xl"
              />
              <div className="flex-1">
                <Kicker>{categoryLabel(servicio.categoria)}</Kicker>
                <p className="mt-1 font-serif-display text-xl text-ink">{servicio.nombre}</p>
                <p className="mt-1 text-sm text-muted">
                  {servicio.duracionMinutos} min · {formatPrice(servicio.precioBase)}
                </p>
              </div>
              <span className="rounded-full bg-olive-50 px-3 py-1 text-xs font-medium text-olive-700">
                Activo
              </span>
            </Card>
          ))}
        </div>
      )}

      {!servicios.cargando && !servicios.error && servicios.servicios.length === 0 && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Aún no tienes servicios asignados.
        </p>
      )}
    </div>
  )
}
