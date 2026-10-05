import { useId, type ReactNode } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'

const controlClass =
  'w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted-light focus:border-ink'

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-[0.14em] text-muted"
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-light">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  error?: string
  type?: string
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={controlClass}
      />
    </Field>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  suffix,
  hint,
  error,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
  suffix?: string
  hint?: string
  error?: string
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${controlClass} ${suffix ? 'pr-14' : ''}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-muted">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  hint?: string
  error?: string
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${controlClass} resize-y`}
      />
    </Field>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  hint?: string
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={`${controlClass} cursor-pointer appearance-none pr-10`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
      </div>
    </Field>
  )
}

/** Lista editable de textos simples (por ejemplo, lo que incluye un servicio). */
export function StringListField({
  label,
  values,
  onChange,
  placeholder = 'Agregar elemento',
  hint,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        {values.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              aria-label={`${label} ${index + 1}`}
              value={item}
              onChange={(e) =>
                onChange(values.map((v, i) => (i === index ? e.target.value : v)))
              }
              className={controlClass}
            />
            <button
              type="button"
              aria-label={`Quitar ${item || 'elemento'}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
              className="rounded-full p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-4 py-2 text-xs font-medium text-muted transition-colors hover:border-ink hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          {placeholder}
        </button>
      </div>
    </Field>
  )
}

/** Selección múltiple en forma de chips. */
export function ChipMultiSelect({
  label,
  options,
  selected,
  onChange,
  hint,
  emptyLabel = 'No hay opciones disponibles.',
}: {
  label: string
  options: { value: string; label: string; description?: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  hint?: string
  emptyLabel?: string
}) {
  return (
    <Field label={label} hint={hint}>
      {options.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const isSelected = selected.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() =>
                  onChange(
                    isSelected
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value],
                  )
                }
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  isSelected
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-paper text-ink hover:bg-ivory'
                }`}
              >
                {option.label}
                {option.description && (
                  <span className={isSelected ? 'text-white/60' : 'text-muted'}>
                    {' '}
                    · {option.description}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </Field>
  )
}
