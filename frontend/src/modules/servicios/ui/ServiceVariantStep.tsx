import { Check } from 'lucide-react'
import { formatPrice } from '@/shared/lib/format'
import { Kicker } from '@/shared/ui/ui'
import type { VarianteServicio } from '../domain/servicio.types'

/**
 * Paso intermedio del asistente de reserva: la pregunta del servicio.
 *
 * Solo aparece si el servicio tiene variantes, y va ANTES de elegir profesional
 * porque de la respuesta depende el precio: dejarlo para el final obligaria a
 * mostrar un total que cambia despues de haber elegido hora.
 *
 * Vive en el modulo de servicios y no junto a los demas pasos de `BookingFlow`
 * porque lo unico que sabe es pintar las opciones de un servicio. Que sea un
 * paso del asistente lo decide quien lo usa.
 */
export function ServiceVariantStep({
  servicioNombre,
  variante,
  /** Opcion ya elegida, si se vuelve atras para cambiarla. */
  opcionElegidaId,
  onSelect,
  onBack,
}: {
  servicioNombre: string
  variante: VarianteServicio
  opcionElegidaId?: string
  onSelect: (opcionId: string) => void
  onBack: () => void
}) {
  // Con una sola opcion el precio no depende de nada, pero se pregunta igual:
  // el estudio la configuro para que se viera, y saltarsela dejaria a la clienta
  // sin saber que esta reservando.
  const masBarata = Math.min(...variante.opciones.map((o) => o.precio))

  return (
    <div className="animate-fade-up">
      <Kicker>{servicioNombre}</Kicker>
      <h1 className="mt-2 font-serif-display text-4xl text-ink">{variante.pregunta}</h1>
      <p className="mt-3 max-w-xl text-sm text-muted">
        El precio del servicio depende de tu respuesta. Puedes cambiarla antes de confirmar.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {variante.opciones.map((opcion) => {
          const elegida = opcion.id === opcionElegidaId
          return (
            <button
              key={opcion.id}
              onClick={() => onSelect(opcion.id)}
              aria-pressed={elegida}
              className={`card-hover flex items-center justify-between gap-4 rounded-2xl border p-5 text-left transition-colors ${
                elegida
                  ? 'border-ink bg-ink/[0.03]'
                  : 'border-line-soft bg-paper hover:border-line'
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{opcion.etiqueta}</p>
                {/* Se señala la mas economica solo cuando hay varias y no todas
                    cuestan lo mismo: si no, la etiqueta no informa de nada. */}
                {variante.opciones.length > 1 &&
                  opcion.precio === masBarata &&
                  masBarata !== Math.max(...variante.opciones.map((o) => o.precio)) && (
                    <p className="mt-0.5 text-xs text-muted">Opción más económica</p>
                  )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-medium text-ink">{formatPrice(opcion.precio)}</span>
                {elegida && <Check className="h-4 w-4 text-olive-600" />}
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={onBack}
        className="mt-8 text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
      >
        ← Elegir otro servicio
      </button>
    </div>
  )
}
