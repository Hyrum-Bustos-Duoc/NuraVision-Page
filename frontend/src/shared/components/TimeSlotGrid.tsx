import type { Slot } from '@/shared/lib/availability'

/**
 * Una hora que no se puede tomar se ve igual, venga de una reserva de otra
 * clienta o de un bloqueo de la profesional.
 *
 * Es una decision de producto, no un descuido: el rayado de «bloqueado»
 * distinguia el horario personal de la profesional —su colacion, sus
 * permisos— de una hora ya vendida, y eso daba pie a malos entendidos con las
 * clientas mas fieles, que leian el hueco como una negativa personal.
 *
 * Para la clienta la unica informacion util es si puede reservar o no. El
 * detalle de por que no sigue estando donde le sirve a alguien: en el panel de
 * la profesional, que pinta su propia grilla.
 *
 * Los dos estados apuntan a la MISMA constante a proposito. Escribir la clase
 * dos veces dejaria que una cambiara sin la otra, y entonces el rayado volveria
 * por una via distinta.
 */
const OCUPADO = 'bg-olive-600 text-white cursor-not-allowed'

const STATUS_STYLE: Record<Slot['status'], string> = {
  disponible: 'bg-olive-50 text-ink hover:bg-olive-100 cursor-pointer',
  reservado: OCUPADO,
  bloqueado: OCUPADO,
  fuera_horario: 'border border-dashed border-line text-muted-light cursor-not-allowed',
}

/**
 * Lo que oye quien navega con lector de pantalla. Tiene que decir lo mismo para
 * `reservado` y para `bloqueado`: si ahi se distinguieran, el estado volveria a
 * filtrarse por el unico camino que quedaba abierto.
 */
const STATUS_ETIQUETA: Record<Slot['status'], string | undefined> = {
  // La hora en si ya se lee en el boton.
  disponible: undefined,
  reservado: 'Hora no disponible',
  bloqueado: 'Hora no disponible',
  fuera_horario: 'Fuera de horario de atencion',
}

export function TimeSlotGrid({
  slots,
  selectedTime,
  onSelect,
}: {
  slots: Slot[]
  selectedTime?: string
  onSelect: (time: string) => void
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2 rounded-2xl border border-line-soft bg-paper px-5 py-3 text-xs text-muted">
        <LegendDot className="bg-olive-50" label="Disponible" />
        <LegendDot className="bg-olive-600" label="Reservado" />
        <LegendDot className="border border-dashed border-line" label="Fuera de horario" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {slots.map((slot) => {
          const isSelected = slot.time === selectedTime
          return (
            <button
              key={slot.time}
              disabled={slot.status !== 'disponible'}
              aria-label={
                STATUS_ETIQUETA[slot.status] && `${slot.time} · ${STATUS_ETIQUETA[slot.status]}`
              }
              onClick={() => onSelect(slot.time)}
              className={`rounded-xl px-3 py-3 text-center text-sm font-medium transition-colors ${
                isSelected ? 'bg-ink text-white' : STATUS_STYLE[slot.status]
              }`}
            >
              {slot.time}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  )
}
