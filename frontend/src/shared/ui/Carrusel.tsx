import { useEffect, useState, type FocusEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const INTERVALO_MS = 5000
/** Algo mas que el turno: el zoom sigue vivo durante el fundido de salida. */
const ZOOM_MS = INTERVALO_MS + 1500

/**
 * Fotos que se alternan solas con un fundido, una cada 5 s.
 *
 * `children` se pinta sobre las fotos y bajo los controles: es donde va el
 * enlace de la tarjeta. Los controles quedan FUERA de ese enlace a proposito;
 * dentro, un clic en una flecha navegaria ademas de cambiar la foto.
 *
 * El avance automatico se detiene con el puntero o el foco encima (para leer
 * la tarjeta sin que cambie) y no existe con movimiento reducido. Sin boton de
 * pausa por decision de producto (2026-10-07).
 *
 * Solo se montan la foto anterior, la actual y la siguiente: la siguiente
 * queda descargada antes de su turno, la anterior termina su fundido, y las
 * otras veinte no se piden hasta que les toque.
 */
export function Carrusel({
  fotos,
  alt,
  etiqueta,
  className = '',
  completas = false,
  children,
}: {
  fotos: string[]
  /** Texto alternativo comun; se le agrega la posicion ("foto 2 de 6"). */
  alt: string
  /** Nombre de la region para lectores de pantalla. */
  etiqueta: string
  className?: string
  /**
   * Muestra cada foto entera, sin recortar, sobre una copia desenfocada de
   * si misma que rellena los lados. Para fotos de producto subidas en
   * cualquier proporcion (2026-10-07). Es la misma URL: no se descarga dos veces.
   */
  completas?: boolean
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

  // Si la lista se acorta (llega el contenido de la base), el indice guardado
  // puede quedar fuera: se acota al pintar en vez de corregir el estado.
  const actual = total > 0 ? posicion.actual % total : 0
  const siguiente = (actual + 1) % total
  const autoavance = !reducido && total > 1
  const detenido = !autoavance || punteroDentro || focoDentro

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
          const opacidad = visible ? 'opacity-100' : 'opacity-0'
          const foto = (
            <img
              key={`${i}-${src}`}
              src={src}
              alt={visible ? `${alt} (foto ${i + 1} de ${total})` : ''}
              aria-hidden={!visible}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              // Zoom lento (2026-10-07): la foto visible se acerca un 8 % mientras
              // dura su turno. Con movimiento reducido no hay zoom.
              style={{
                transition: `opacity 700ms ease-out${reducido ? '' : `, transform ${ZOOM_MS}ms linear`}`,
                transform: visible && !reducido ? 'scale(1.08)' : 'scale(1)',
              }}
              className={`absolute inset-0 h-full w-full ${completas ? 'object-contain' : 'object-cover'} ${opacidad}`}
            />
          )
          if (!completas) return foto
          return [
            <img
              key={`${i}-${src}-fondo`}
              src={src}
              alt=""
              aria-hidden
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              // Agrandada para que el desenfoque no deje bordes claros.
              style={{ transform: 'scale(1.2)' }}
              className={`absolute inset-0 h-full w-full object-cover blur-2xl transition-opacity duration-700 ease-out ${opacidad}`}
            />,
            foto,
          ]
        })}
      </div>

      {children}

      {/* Opcion 4 elegida (2026-10-07): contador y flechas finas en la esquina
          inferior derecha, en blanco sobre la foto. La tarjeta de texto ocupa
          la izquierda; el velo en degrade asegura contraste en fotos claras. */}
      {total > 1 && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 z-[5] h-24 w-56 bg-[radial-gradient(ellipse_at_bottom_right,rgba(28,30,22,0.7),rgba(28,30,22,0.3)_45%,transparent_75%)] sm:h-28 sm:w-72"
          />
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 text-[#fffefb] sm:bottom-4 sm:right-4 sm:gap-1">
            <BotonCarrusel etiqueta="Foto anterior" onClick={() => ir(actual - 1)}>
              <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
            </BotonCarrusel>
            <span className="px-1 text-center text-[11px] tracking-[0.06em] tabular-nums sm:px-1.5 sm:text-[12px]">
              {String(actual + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
            <BotonCarrusel etiqueta="Foto siguiente" onClick={() => ir(actual + 1)}>
              <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
            </BotonCarrusel>
          </div>
        </>
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
      className="flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(255,254,251,0.55)] transition-colors hover:bg-[rgba(255,254,251,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fffefb] sm:h-[30px] sm:w-[30px]"
    >
      {children}
    </button>
  )
}
