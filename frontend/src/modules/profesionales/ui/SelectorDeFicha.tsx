import { Avatar, Button, Kicker } from '@/shared/ui/ui'
import { initialsFromName } from '@/shared/lib/format'
import type { Profesional } from '../domain/profesional.types'

/**
 * Pantalla para elegir de quien es el panel.
 *
 * Reemplaza al antiguo "No encontramos tu ficha de profesional", que era un
 * callejon sin salida: decia que algo fallaba pero no que hacer al respecto.
 *
 * Aparece cuando la sesion no declara `profesional_id` en su `app_metadata`,
 * que es el caso de los atajos del prototipo y de cualquier cuenta a la que
 * todavia no se le haya asignado ficha. La tabla `profesionales` no tiene
 * columna de correo, asi que no hay forma de adivinarlo: hay que preguntarlo.
 */
export function SelectorDeFicha({
  equipo,
  cargando,
  error,
  onElegir,
}: {
  equipo: Profesional[]
  cargando: boolean
  error: string | null
  onElegir: (profesionalId: string) => void
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <Kicker>Panel profesional</Kicker>
      <h1 className="mt-2 font-serif-display text-3xl text-ink">¿De quién es esta agenda?</h1>
      <p className="mt-3 max-w-xl text-sm text-muted">
        Tu cuenta todavía no está vinculada a una ficha del equipo. Elige la tuya para ver tu
        agenda, tus reservas y tu disponibilidad con los datos reales del estudio.
      </p>

      {/* Se dice explicitamente que esto no da permisos: alguien podria
          suponer que elegir una ficha le abre el acceso a sus datos. */}
      <p className="mt-2 max-w-xl text-xs text-muted-light">
        La elección se guarda solo en este navegador y no otorga permisos: lo que puedas ver
        sigue dependiendo de las políticas de la base de datos. El vínculo definitivo se declara
        en <code>app_metadata</code> con la clave de servicio.
      </p>

      {cargando && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Cargando el equipo…
        </p>
      )}

      {!cargando && error && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No pudimos cargar el equipo: {error}
        </p>
      )}

      {!cargando && !error && equipo.length === 0 && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No hay profesionales cargados en la base de datos.
        </p>
      )}

      {!cargando && !error && equipo.length > 0 && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {equipo.map((p) => (
            <button
              key={p.id}
              onClick={() => onElegir(p.id)}
              className="flex items-center gap-4 rounded-2xl border border-line-soft bg-paper p-4 text-left transition-shadow hover:shadow-md"
            >
              {p.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <Avatar initials={initialsFromName(p.nombre)} />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{p.nombre}</p>
                <p className="truncate text-sm text-muted">{p.especialidad}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Aviso con la ficha activa y la opcion de cambiarla. */
export function FichaActiva({
  nombre,
  onCambiar,
}: {
  nombre: string
  onCambiar: () => void
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3">
      <p className="text-xs text-muted">
        Viendo el panel de <span className="text-ink">{nombre}</span>. Tu cuenta no tiene ficha
        asignada, así que esta elección es solo de este navegador.
      </p>
      <Button variant="outline" className="px-4 py-2 text-xs" onClick={onCambiar}>
        Cambiar
      </Button>
    </div>
  )
}
