import { useEffect, useState, type FocusEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

const INTERVALO_MS = 5000

/**
 * Fotos que se alternan solas con un fundido, una cada 5 s.
 *
 * `children` se pinta sobre las fotos y bajo los controles: es donde va el
 * enlace de la tarjeta. Los controles quedan FUERA de ese enlace a proposito;
 * dentro, un clic en una flecha navegaria ademas de cambiar la foto.
 *
 * El avance automatico se detiene con el puntero o el foco encima (para leer
 * la tarjeta sin que cambie), con el boton de pausa (WCAG 2.2.2) y siempre con
 * movimiento reducido. Solo se montan la foto anterior, la actual y la
 * siguiente: la siguiente queda descargada antes de su turno, la anterior
 * termina su fundido, y las otras veinte no se piden hasta que les toque.
 */
export function Carrusel({
  fotos,
  alt,
  etiqueta,
  className = '',
  children,
}: {
  fotos: string[]
  /** Texto alternativo comun; se le agrega la posicion ("foto 2 de 6"). */
  alt: string
  /** Nombre de la region para lectores de pantalla. */
  etiqueta: string
  className?: string
  children?: ReactNode
}) {
  const total = fotos.length
  const [reducido] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  const [posicion, setPosicion] = useState({ actual: 0, anterior: -1 })
  // Dos estados y no uno: con un solo booleano, sacar el puntero reanudaba el
  // avance aunque el foco de teclado siguiera dentro (y al reves).
  const [punteroDentro, setPunteroDentro] = useState(false)
  const [focoDentro, setFocoDentro] = useState(false)
  const [pausadoPorUsuario, setPausadoPorUsuario] = useState(false)

  // Si la lista se acorta (llega el contenido de la base), el indice guardado
  // puede quedar fuera: se acota al pintar en vez de corregir el estado.
  const actual = total > 0 ? posicion.actual % total : 0
  const siguiente = (actual + 1) % total
  const autoavance = !reducido && total > 1
  const detenido = !autoavance || punteroDentro || focoDentro || pausadoPorUsuario

  function ir(destino: number) {
    setPosicion({ actual: (destino + total) % total, anterior: actual })
  }

  // Sincroniza con el reloj del navegador. Depende de `actual`: un cambio
  // manual reinicia la cuenta y la foto elegida dura sus 5 s completos.
  useEffect(() => {
    if (detenido) return
    const id = window.setTimeout(
      () => setPosicion({ actual: (actual + 1) % total, anterior: actual }),
      INTERVALO_MS,
    )
    return () => window.clearTimeout(id)
  }, [detenido, actual, total])

  function alSalirFoco(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocoDentro(false)
  }

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label={etiqueta}
      onMouseEnter={() => setPunteroDentro(true)}
      onMouseLeave={() => setPunteroDentro(false)}
      onFocus={() => setFocoDentro(true)}
      onBlur={alSalirFoco}
      className={`relative overflow-hidden bg-nv-tint2 ${className}`}
    >
      {/* Con el avance automatico activo no se anuncia cada cambio: seria un
          lector de pantalla hablando solo cada 5 s. */}
      <div aria-live={detenido ? 'polite' : 'off'}>
        {fotos.map((src, i) => {
          if (i !== actual && i !== siguiente && i !== posicion.anterior) return null
          const visible = i === actual
          return (
            <img
              key={`${i}-${src}`}
              src={src}
              alt={visible ? `${alt} (foto ${i + 1} de ${total})` : ''}
              aria-hidden={!visible}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
                visible ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )
        })}
      </div>

      {children}

      {total > 1 && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 sm:right-3 sm:top-3">
          {autoavance && (
            <BotonCarrusel
              etiqueta={pausadoPorUsuario ? 'Reanudar el carrusel' : 'Pausar el carrusel'}
              onClick={() => setPausadoPorUsuario((p) => !p)}
            >
              {pausadoPorUsuario ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </BotonCarrusel>
          )}
          <BotonCarrusel etiqueta="Foto anterior" onClick={() => ir(actual - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </BotonCarrusel>
          <span className="min-w-[44px] rounded-full bg-[rgba(255,253,250,0.88)] px-2 py-1.5 text-center font-mono text-[10px] tabular-nums text-nv-ink backdrop-blur">
            {String(actual + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
          </span>
          <BotonCarrusel etiqueta="Foto siguiente" onClick={() => ir(actual + 1)}>
            <ChevronRight className="h-4 w-4" />
          </BotonCarrusel>
        </div>
      )}
    </div>
  )
}

function BotonCarrusel({ etiqueta, onClick, children }: { etiqueta: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(255,253,250,0.88)] text-nv-ink backdrop-blur transition-colors hover:bg-nv-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nv-accent"
    >
      {children}
    </button>
  )
}
