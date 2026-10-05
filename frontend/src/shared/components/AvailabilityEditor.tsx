import { ChevronDown, Plus, X } from 'lucide-react'
import { createId } from '@/shared/lib/id'
import { minutesToTime, timeToMinutes } from '@/shared/lib/availability'
import type { DayAvailability, Weekday, WeeklyAvailability } from '@/shared/types'

/** Lunes primero, como se lee un horario. */
const WEEK_ORDER: { weekday: Weekday; label: string }[] = [
  { weekday: 1, label: 'Lunes' },
  { weekday: 2, label: 'Martes' },
  { weekday: 3, label: 'Miércoles' },
  { weekday: 4, label: 'Jueves' },
  { weekday: 5, label: 'Viernes' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
]

/**
 * Horas en pasos de 30 minutos, la misma granularidad que usa la agenda.
 * Se usa un select en vez de <input type="time"> porque este último se
 * muestra en formato AM/PM según el idioma del navegador.
 */
const TIME_OPTIONS = Array.from({ length: (22 - 6) * 2 + 1 }, (_, i) => minutesToTime(6 * 60 + i * 30))

function TimeSelect({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-lg border border-line bg-ivory py-2 pl-3 pr-8 text-sm text-ink outline-none transition-colors hover:border-muted-light focus:border-olive-600"
      >
      {/* Si el horario guardado no cae en la grilla, se conserva como opción. */}
      {!TIME_OPTIONS.includes(value) && <option value={value}>{value}</option>}
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
      />
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-olive-600' : 'bg-line'
      }`}
    >
      {/* left-0.5 explícito: los <button> centran su contenido y la perilla
          absoluta partiría desde el centro, saliéndose del riel. */}
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function AvailabilityEditor({
  value,
  onChange,
}: {
  value: WeeklyAvailability
  onChange: (next: WeeklyAvailability) => void
}) {
  function updateDay(weekday: Weekday, patch: Partial<DayAvailability>) {
    onChange({ ...value, [weekday]: { ...value[weekday], ...patch } })
  }

  return (
    <div className="divide-y divide-line-soft rounded-2xl border border-line-soft bg-paper">
      {WEEK_ORDER.map(({ weekday, label }) => {
        const day = value[weekday]
        const invalidRange = day.enabled && timeToMinutes(day.end) <= timeToMinutes(day.start)

        return (
          <div key={weekday} className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <Toggle
                checked={day.enabled}
                onChange={() => updateDay(weekday, { enabled: !day.enabled })}
                label={`${label}: ${day.enabled ? 'atiende' : 'día libre'}`}
              />
              <span className="w-24 font-medium text-ink">{label}</span>

              {day.enabled ? (
                <>
                  <TimeSelect
                    label={`Hora de inicio, ${label}`}
                    value={day.start}
                    onChange={(start) => updateDay(weekday, { start })}
                  />
                  <span className="text-sm text-muted">a</span>
                  <TimeSelect
                    label={`Hora de término, ${label}`}
                    value={day.end}
                    onChange={(end) => updateDay(weekday, { end })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateDay(weekday, {
                        breaks: [
                          ...day.breaks,
                          { id: createId('brk'), start: '13:00', end: '14:00', label: 'Colación' },
                        ],
                      })
                    }
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-ink hover:text-ink"
                  >
                    <Plus className="h-3 w-3" />
                    Bloquear tramo
                  </button>
                </>
              ) : (
                <span className="text-sm text-muted-light">
                  Día libre — no se mostrará disponibilidad
                </span>
              )}
            </div>

            {invalidRange && (
              <p className="mt-2 text-xs text-danger sm:pl-[6.5rem]">
                La hora de término debe ser posterior a la de inicio.
              </p>
            )}

            {day.enabled && day.breaks.length > 0 && (
              <div className="mt-3 space-y-2 sm:pl-[6.5rem]">
                {day.breaks.map((brk) => (
                  <div key={brk.id} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      aria-label={`Motivo del tramo bloqueado, ${label}`}
                      value={brk.label}
                      onChange={(e) =>
                        updateDay(weekday, {
                          breaks: day.breaks.map((b) =>
                            b.id === brk.id ? { ...b, label: e.target.value } : b,
                          ),
                        })
                      }
                      placeholder="Motivo"
                      className="w-36 rounded-lg border border-line bg-ivory px-3 py-1.5 text-xs text-ink outline-none focus:border-ink"
                    />
                    <TimeSelect
                      label={`Inicio del tramo bloqueado, ${label}`}
                      value={brk.start}
                      onChange={(start) =>
                        updateDay(weekday, {
                          breaks: day.breaks.map((b) => (b.id === brk.id ? { ...b, start } : b)),
                        })
                      }
                    />
                    <span className="text-xs text-muted">a</span>
                    <TimeSelect
                      label={`Término del tramo bloqueado, ${label}`}
                      value={brk.end}
                      onChange={(end) =>
                        updateDay(weekday, {
                          breaks: day.breaks.map((b) => (b.id === brk.id ? { ...b, end } : b)),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Quitar tramo ${brk.label}`}
                      onClick={() =>
                        updateDay(weekday, { breaks: day.breaks.filter((b) => b.id !== brk.id) })
                      }
                      className="rounded-full p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
