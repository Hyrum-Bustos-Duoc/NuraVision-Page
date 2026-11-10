import { Kicker } from '@/shared/ui/ui'
import { ETIQUETA_DEDO, ETIQUETA_FORMA, type ResultadoAnalisis } from '../domain/analisis.types'

/**
 * Foto de la clienta con cada una enmarcada, y el recorte de cada una al lado.
 * Ademas de localizarlas, dice la forma de cada una (regla geometrica sobre su
 * contorno). No emite ningun juicio sobre su estado.
 */
export function ResultadoUnas({
  resultado,
  fotoUrl,
}: {
  resultado: ResultadoAnalisis
  fotoUrl: string
}) {
  const { unas, manos } = resultado
  const variasManos = manos > 1
  const medidas = unas.filter((u) => u.forma).length
  const predominante = resultado.forma_predominante

  return (
    <section aria-labelledby="titulo-unas-detectadas" className="mt-8">
      <Kicker>Lo que detectamos</Kicker>
      <h2 id="titulo-unas-detectadas" className="mt-2 font-serif text-[26px] font-light text-ink">
        {unas.length === 1 ? 'Encontramos 1 uña' : `Encontramos ${unas.length} uñas`}
        {manos > 0 && ` en ${manos === 1 ? '1 mano' : `${manos} manos`}`}
      </h2>

      <div
        className="mt-4 rounded-2xl border border-line-soft bg-paper px-5 py-4"
        data-testid="forma-resumen"
      >
        <p className="text-xs uppercase tracking-wide text-muted">Forma de tus uñas</p>
        {predominante ? (
          <p className="mt-1 font-serif text-[24px] font-light text-ink">
            {ETIQUETA_FORMA[predominante]}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink">
            {medidas === 0
              ? 'No pudimos medir la forma con esta foto. Prueba con más luz y los dedos bien estirados, de frente a la cámara.'
              : 'Tus uñas no tienen una forma que predomine con claridad.'}
          </p>
        )}
        {medidas > 0 && (
          <p className="mt-1 text-xs text-muted">
            Medimos {medidas} de {unas.length} uñas. Es una estimación orientativa a partir de la
            foto, no la opinión de una profesional: en el estudio la confirmamos contigo.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* El SVG ocupa exactamente la caja de la imagen y usa coordenadas 0..1,
            las mismas en que el servicio entrega las esquinas. */}
        <div className="relative overflow-hidden rounded-2xl border border-line-soft">
          <img src={fotoUrl} alt="Tu fotografía con las uñas marcadas" className="block h-auto w-full" />
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full text-olive-600"
            aria-hidden="true"
          >
            {unas.map((u) => (
              <polygon
                key={`${u.mano}-${u.dedo}`}
                points={u.esquinas.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {unas.map((u) => (
            <li
              key={`${u.mano}-${u.dedo}`}
              className="overflow-hidden rounded-xl border border-line-soft bg-paper"
            >
              <div className="relative">
                <img
                  src={u.recorte}
                  alt={`Uña del dedo ${ETIQUETA_DEDO[u.dedo].toLowerCase()}`}
                  className="aspect-square w-full object-cover"
                />
                {u.contorno.length > 2 && (
                  <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full text-olive-600"
                    aria-hidden="true"
                  >
                    <polygon
                      points={u.contorno.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}
              </div>
              <p className="px-3 py-2 text-xs text-muted">
                {ETIQUETA_DEDO[u.dedo]}
                {variasManos && ` · mano ${u.mano}`}
              </p>
              <p className="px-3 pb-2 text-xs text-ink" data-testid="forma-una">
                {u.forma
                  ? `${ETIQUETA_FORMA[u.forma]}${u.forma_fiable ? '' : ' (estimación poco fiable)'}`
                  : 'Forma no medida'}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-muted-light">
        Los recuadros son una zona aproximada de cada uña. La línea verde sobre cada recorte es el
        contorno que usamos para medir la forma; si no calza con tu uña, la forma tampoco es
        confiable. Almendra y stiletto se confunden fácil con uñas vistas de lado. Tu foto se
        analiza al momento y no la conservamos.
      </p>
    </section>
  )
}
