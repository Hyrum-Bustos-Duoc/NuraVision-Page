import { Minus, Plus } from 'lucide-react'

/**
 * Stepper de cantidad con forma de pildora (spec §4.1).
 *
 * `grande` es el del detalle de producto (44×48); el normal, el del carrito
 * (30×30). El minimo lo decide quien lo usa: en el detalle es 1, en el carrito
 * es 0 y llegar ahi elimina la linea.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  size = 'normal',
  label,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  size?: 'normal' | 'grande'
  /** Nombre de lo que se cuenta, para los lectores de pantalla. */
  label: string
}) {
  const boton =
    size === 'grande'
      ? 'h-12 w-11 text-[17px]'
      : 'h-[30px] w-[30px] text-sm'
  const borde = size === 'grande' ? 'border-nv-line3' : 'border-nv-line2'

  return (
    <div
      role="group"
      aria-label={`Cantidad de ${label}`}
      className={`inline-flex shrink-0 items-center rounded-full border ${borde} bg-nv-surface`}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Quitar uno"
        className={`${boton} flex items-center justify-center rounded-full text-nv-ink transition-colors hover:bg-nv-paper4 disabled:opacity-30`}
      >
        <Minus className={size === 'grande' ? 'h-4 w-4' : 'h-3 w-3'} strokeWidth={1.6} />
      </button>
      <span
        aria-live="polite"
        className={`min-w-6 text-center tabular-nums text-nv-ink ${size === 'grande' ? 'text-[15px]' : 'text-[13px]'}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Agregar uno"
        className={`${boton} flex items-center justify-center rounded-full text-nv-ink transition-colors hover:bg-nv-paper4 disabled:opacity-30`}
      >
        <Plus className={size === 'grande' ? 'h-4 w-4' : 'h-3 w-3'} strokeWidth={1.6} />
      </button>
    </div>
  )
}
