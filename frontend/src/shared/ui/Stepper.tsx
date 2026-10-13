import { useLayoutEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

const STEP_LABELS = ['Servicio', 'Profesional', 'Fecha', 'Hora', 'Confirmación']

/**
 * Indicador de pasos.
 *
 * Las etiquetas se pueden pasar porque el asistente de reserva tiene pasos
 * condicionales: la pregunta de variantes y el abono. Con la lista fija, esos
 * pasos no tendrian como aparecer y el indicador marcaria otro numero.
 *
 * Si la fila completa no cabe, se muestra una linea compacta («Paso 6 de 7 ·
 * Confirmación»). Se decide midiendo y no por breakpoint: lo que cabe depende
 * de cuantos pasos haya (5 a 7) y del ancho real del contenedor, y con un
 * breakpoint fijo la fila de 7 desbordaba entre 640 y ~900 px y el paso actual
 * quedaba fuera de la vista.
 */
export function Stepper({
  currentIndex,
  labels = STEP_LABELS,
}: {
  currentIndex: number
  labels?: string[]
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const medida = useRef<HTMLDivElement>(null)
  // Arranca compacto: si no hay como medir (sin ResizeObserver), la linea
  // compacta cabe en cualquier ancho y nunca desborda.
  const [compacto, setCompacto] = useState(true)

  /**
   * Sincroniza con el layout del navegador, que es externo a React. Se observa
   * el contenedor (cambia con la ventana) y la copia de medida (cambia con las
   * etiquetas). El estado solo se fija desde el callback del observador, que
   * dispara al observar y luego en cada cambio de tamaño. Layout effect para
   * que la primera medida llegue antes de pintar y no parpadee.
   */
  useLayoutEffect(() => {
    const caja = contenedor.current
    const fila = medida.current
    if (!caja || !fila || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(() => setCompacto(fila.offsetWidth > caja.clientWidth))
    observador.observe(caja)
    observador.observe(fila)
    return () => observador.disconnect()
  }, [])

  return (
    // overflow-hidden recorta la copia de medida, que es mas ancha que la
    // pantalla justo cuando no cabe: sin esto generaria scroll horizontal.
    <div ref={contenedor} role="group" aria-label="Pasos" className="relative overflow-hidden">
      {/* Copia invisible a su ancho natural (w-max), solo para medir si la
          fila cabe. Fuera del arbol de accesibilidad. */}
      <div
        ref={medida}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 w-max"
      >
        <Fila labels={labels} currentIndex={currentIndex} medir />
      </div>

      {compacto ? (
        <p className="text-sm text-muted">
          Paso {currentIndex + 1} de {labels.length} ·{' '}
          <span aria-current="step" className="font-medium text-ink">
            {labels[currentIndex]}
          </span>
        </p>
      ) : (
        <Fila labels={labels} currentIndex={currentIndex} />
      )}
    </div>
  )
}

/**
 * La fila completa. `medir` la pinta con conectores de ancho minimo y sin
 * `aria-current`: es la version que define si cabe, y no debe contar como el
 * paso actual.
 */
function Fila({
  labels,
  currentIndex,
  medir = false,
}: {
  labels: string[]
  currentIndex: number
  medir?: boolean
}) {
  return (
    <div className="flex items-center">
      {labels.map((label, index) => {
        const done = index < currentIndex
        const current = index === currentIndex
        return (
          <div
            key={label}
            aria-current={current && !medir ? 'step' : undefined}
            // Al medir, nada de flex-1: el ancho natural tiene que ser la suma
            // real de circulos, etiquetas y conectores minimos.
            className={medir ? 'flex items-center' : 'flex flex-1 items-center last:flex-none'}
          >
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  done
                    ? 'border border-olive-400 text-olive-600'
                    : current
                      ? 'bg-ink text-white'
                      : 'border border-line text-muted-light'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span
                className={`whitespace-nowrap text-sm ${
                  current ? 'font-medium text-ink' : done ? 'text-ink' : 'text-muted-light'
                }`}
              >
                {label}
              </span>
            </div>
            {index < labels.length - 1 && (
              <div className={`mx-4 h-px bg-line ${medir ? 'w-6 shrink-0' : 'min-w-6 flex-1'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
