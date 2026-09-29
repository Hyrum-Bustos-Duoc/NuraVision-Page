import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import type { BookingStatus } from '@/shared/types'

type Variant = 'solid' | 'olive' | 'outline' | 'danger-outline'

const variantClasses: Record<Variant, string> = {
  solid: 'bg-ink text-white hover:bg-ink-soft',
  olive: 'bg-olive-600 text-white hover:bg-olive-700',
  outline: 'border border-line text-ink bg-paper hover:bg-ivory hover:border-muted-light',
  'danger-outline': 'border border-[#e6c9c0] text-danger bg-paper hover:bg-danger-soft',
}

const baseButtonClasses =
  'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-200 active:scale-[0.98]'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
}

export function Button({ variant = 'solid', full, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`${baseButtonClasses} disabled:pointer-events-none disabled:opacity-40 ${
        full ? 'w-full' : ''
      } ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}

interface LinkButtonProps extends LinkProps {
  variant?: Variant
  className?: string
  full?: boolean
  children?: ReactNode
}

export function LinkButton({
  variant = 'solid',
  className = '',
  full,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={`${baseButtonClasses} ${full ? 'w-full' : ''} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-medium uppercase tracking-[0.18em] text-muted ${className}`}>
      {children}
    </p>
  )
}

export function Placeholder({
  label,
  variant = 'beige',
  className = '',
}: {
  label?: string
  variant?: 'beige' | 'lavender'
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-center ${
        variant === 'lavender' ? 'placeholder-stripes-lavender' : 'placeholder-stripes'
      } ${className}`}
    >
      {label && (
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-light">{label}</span>
      )}
    </div>
  )
}

/**
 * Muestra una imagen cargada desde el panel de administración y, mientras no
 * exista, el marcador a rayas del diseño.
 */
export function AppImage({
  src,
  alt,
  label,
  variant = 'beige',
  className = '',
  imageClassName = '',
}: {
  src?: string
  alt?: string
  label?: string
  variant?: 'beige' | 'lavender'
  className?: string
  imageClassName?: string
}) {
  if (!src) {
    return <Placeholder label={label} variant={variant} className={className} />
  }

  return (
    <div className={`zoom-media overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt ?? label ?? ''}
        loading="lazy"
        className={`h-full w-full object-cover ${imageClassName}`}
      />
    </div>
  )
}

/**
 * Estados que sabe pintar la insignia.
 *
 * Incluye 'pendiente', que no existe en `BookingStatus` pero si en la base:
 * es el unico estado con el que se pueden crear reservas desde el navegador
 * (ver 0003_reservas.sql). Sin el, una reserva recien hecha y leida de vuelta
 * no tendria como mostrarse.
 *
 * ESTA ES LA UNICA INSIGNIA DE ESTADO. Hubo una segunda en el modulo admin
 * (`EstadoBadge`) que existia porque en su momento este tipo era solo
 * `BookingStatus` y le faltaba 'pendiente'. Al agregarlo, `EstadoReserva` de la
 * base —'pendiente' | 'confirmada' | 'completada' | 'cancelada'— paso a ser un
 * subconjunto estricto de este tipo, de modo que una fila de la base entra aqui
 * sin traduccion ninguna. Las dos insignias ya pintaban exactamente el mismo
 * HTML, asi que la del modulo se elimino.
 *
 * 'en_curso' es el unico estado que sobra respecto de la base: lo usa el
 * prototipo para la hora que se esta atendiendo ahora. Mientras siga ahi, este
 * tipo es el mas amplio de los dos vocabularios y sirve para ambos.
 */
export type BadgeStatus = BookingStatus | 'pendiente'

const statusStyles: Record<BadgeStatus, string> = {
  pendiente: 'bg-line-soft text-ink',
  confirmada: 'bg-olive-50 text-olive-700',
  en_curso: 'bg-lavender text-[#4a3a63]',
  completada: 'bg-line-soft text-muted',
  cancelada: 'bg-danger-soft text-danger',
}

const statusLabels: Record<BadgeStatus, string> = {
  pendiente: 'Por confirmar',
  confirmada: 'Confirmada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

export function StatusBadge({ status }: { status: BadgeStatus }) {
  /**
   * El respaldo no es decorativo: esta insignia se alimenta directamente del
   * enum `estado_reserva` de la base. Si alguien agrega ahi un estado nuevo, los
   * tipos de este archivo no se enteran hasta que se regeneren, y sin esto la
   * insignia saldria con la clase "undefined" y sin texto: un hueco en blanco
   * que no dice nada. Asi al menos se ve el estado crudo.
   */
  const estilo = statusStyles[status] ?? 'bg-line-soft text-muted'
  const etiqueta = statusLabels[status] ?? String(status)

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${estilo}`}>{etiqueta}</span>
  )
}

export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`rounded-full bg-olive-50 px-3 py-1 text-xs font-medium text-olive-700 ${className}`}>
      {children}
    </span>
  )
}

export function Card({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border border-line-soft bg-paper ${hover ? 'card-hover' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  caption,
  captionTone = 'muted',
  icon: Icon,
}: {
  label: string
  value: string
  caption?: string
  captionTone?: 'muted' | 'positive' | 'negative'
  icon?: LucideIcon
}) {
  const captionColor =
    captionTone === 'positive'
      ? 'text-olive-600'
      : captionTone === 'negative'
        ? 'text-danger'
        : 'text-muted'

  return (
    <Card hover className="px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <Kicker>{label}</Kicker>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-olive-50 text-olive-700">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-3 font-serif-display text-4xl text-ink">{value}</p>
      {caption && <p className={`mt-2 text-sm ${captionColor}`}>{caption}</p>}
    </Card>
  )
}

/** Estado vacío consistente para listas y tablas. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-line-soft text-muted">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
            opt.value === value
              ? 'border-ink bg-ink text-white'
              : 'border-line bg-paper text-ink hover:bg-ivory'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-8 border-b border-line-soft">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
            opt.value === value
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ initials, tone = 'olive' }: { initials: string; tone?: 'olive' | 'ink' }) {
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium ${
        tone === 'olive' ? 'bg-olive-100 text-olive-700' : 'bg-ink text-white'
      }`}
    >
      {initials}
    </div>
  )
}
