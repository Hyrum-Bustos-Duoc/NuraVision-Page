import type { ReactNode } from 'react'
import { ChevronDown, RefreshCw, Search, X } from 'lucide-react'
import { controlFiltro } from './nv-estilos'

/**
 * Controles de filtro con el diseño de NuraVision.
 *
 * Reemplazan a los `<select>` e `<input>` con el aspecto del navegador: cada
 * sistema los pintaba distinto y no se reconocian como parte del panel.
 */

export function SelectFiltro<T extends string>({
  value,
  onChange,
  opciones,
  etiqueta,
  className = '',
  disabled,
}: {
  value: T
  onChange: (valor: T) => void
  opciones: readonly { value: T; label: string }[]
  /** Nombre accesible: el desplegable no tiene una etiqueta visible. */
  etiqueta: string
  className?: string
  disabled?: boolean
}) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={etiqueta}
        disabled={disabled}
        className={`${controlFiltro} w-full cursor-pointer appearance-none truncate pl-4 pr-10`}
      >
        {opciones.map((o) => (
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
  )
}

export function CampoBusqueda({
  value,
  onChange,
  placeholder = 'Buscar…',
  etiqueta = 'Buscar',
  className = '',
}: {
  value: string
  onChange: (valor: string) => void
  placeholder?: string
  etiqueta?: string
  className?: string
}) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className={`${controlFiltro} w-full pl-10 pr-9 placeholder:text-muted-light [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition-colors hover:bg-ivory hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** "Actualizar": pildora con icono que gira mientras recarga. */
export function BotonActualizar({
  onClick,
  cargando = false,
  texto = 'Actualizar',
}: {
  onClick: () => void
  cargando?: boolean
  texto?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      className={`${controlFiltro} inline-flex items-center justify-center gap-2 px-4 font-medium hover:bg-ivory active:scale-[0.97]`}
    >
      <RefreshCw aria-hidden="true" className={`h-4 w-4 text-muted ${cargando ? 'animate-spin' : ''}`} />
      {cargando ? 'Actualizando…' : texto}
    </button>
  )
}

/** Fila de filtros: se envuelve en pantallas chicas y en movil ocupa el ancho. */
export function BarraFiltros({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 [&>*]:max-sm:w-full ${className}`}>{children}</div>
  )
}
