import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Upload } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { AppImage, Button, FilterPills, Kicker } from '@/shared/ui/ui'
import { useScrollToTopOnChange } from '@/shared/components/ScrollToTop'
import { formatPrice } from '@/shared/lib/format'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import { ProductGrid } from '@/modules/tienda/ui/ProductGrid'

type Step = 'prepare' | 'upload' | 'result'
type SimulatedError = 'imagen_invalida' | 'servicio_caido' | null

export default function AIAnalysis() {
  const { siteContent, activeServices: services } = useAppState()
  const { porSlug } = useCatalogo()
  const focusOptions = siteContent.aiFocusOptions

  const [focusId, setFocusId] = useState(focusOptions[0]?.id ?? '')
  const [step, setStep] = useState<Step>('prepare')
  const [simulatedError, setSimulatedError] = useState<SimulatedError>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  useScrollToTopOnChange(step)

  // Se resuelve en el render: si el administrador elimina la opción elegida,
  // se cae de vuelta a la primera sin necesidad de sincronizar el estado.
  const focus = focusOptions.find((o) => o.id === focusId) ?? focusOptions[0]

  if (!focus) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="font-serif-display text-4xl text-ink">Análisis con IA</h1>
        <p className="mt-3 text-sm text-muted">
          El análisis no está disponible por ahora. Vuelve a intentarlo más tarde.
        </p>
      </div>
    )
  }

  const recommended = services.filter((s) => focus.recommendedServiceIds.includes(s.id))
  const productosParaCasa = (focus.productosRecomendados ?? [])
    .map((slug) => porSlug(slug))
    .filter((p) => p !== undefined)

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-olive-700">
          <span className="h-1.5 w-1.5 rounded-full bg-olive-600" />
          Nuravision IA
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-light">Estados</span>
          <button
            onClick={() => setSimulatedError('imagen_invalida')}
            className="rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-muted hover:border-danger hover:text-danger"
          >
            Imagen inválida
          </button>
          <button
            onClick={() => setSimulatedError('servicio_caido')}
            className="rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-muted hover:border-danger hover:text-danger"
          >
            Servicio caído
          </button>
        </div>
      </div>

      {step === 'prepare' && (
        <>
          <h1 className="mt-6 font-serif-display text-4xl text-ink">Prepara tu fotografía</h1>
          <p className="mt-3 max-w-xl text-base text-muted">
            Una buena foto mejora mucho el resultado. Toma 30 segundos para revisar estas
            recomendaciones.
          </p>

          <Kicker className="mt-8">¿Qué quieres analizar?</Kicker>
          <div className="mt-3">
            <FilterPills
              options={focusOptions.map((o) => ({ value: o.id, label: o.label }))}
              value={focus.id}
              onChange={setFocusId}
            />
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {focus.tips.map((tip) => (
              <div
                key={tip.id}
                className="overflow-hidden rounded-2xl border border-line-soft bg-paper"
              >
                <AppImage src={tip.imageUrl} alt={tip.title} className="aspect-square w-full" />
                <div className="p-4">
                  <p className="font-medium text-ink">{tip.title}</p>
                  <p className="mt-1 text-sm text-muted">{tip.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-line-soft/60 px-5 py-4 text-sm text-muted">
            Tu imagen es privada y solo tú puedes verla. NuraVision entrega una{' '}
            <strong className="text-ink">orientación estética</strong>, no un diagnóstico médico.
          </div>

          <Button className="mt-8" onClick={() => setStep('upload')}>
            Continuar
          </Button>
        </>
      )}

      {step === 'upload' && (
        <>
          <button
            onClick={() => setStep('prepare')}
            className="mt-6 text-sm text-muted hover:text-ink"
          >
            ← Cambiar enfoque
          </button>
          <h1 className="mt-2 font-serif-display text-4xl text-ink">Sube tu fotografía</h1>
          <p className="mt-3 text-sm text-muted">Analizaremos {focus.analysisLabel}.</p>

          {simulatedError && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#e6c9c0] bg-danger-soft px-5 py-4 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {simulatedError === 'imagen_invalida'
                ? 'No pudimos leer esta imagen. Intenta con una foto en formato JPG o PNG, con buena luz.'
                : 'El servicio de análisis no está disponible en este momento. Intenta nuevamente en unos minutos.'}
            </div>
          )}

          <label className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-paper px-6 py-16 text-center hover:border-olive-400">
            <Upload className="h-6 w-6 text-muted" />
            <span className="text-sm text-ink">
              {fileName ?? 'Arrastra tu foto aquí o haz clic para subirla'}
            </span>
            <span className="text-xs text-muted-light">JPG o PNG · máx. 10 MB</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                setSimulatedError(null)
                setFileName(e.target.files?.[0]?.name ?? null)
              }}
            />
          </label>

          {analyzing && (
            <div className="mt-8 rounded-2xl border border-line-soft bg-paper p-6">
              <p className="text-sm font-medium text-ink">Analizando tu fotografía…</p>
              <p className="mt-1 text-xs text-muted">
                Estamos identificando características visuales.
              </p>
              <div className="mt-4 space-y-2">
                <div className="animate-shimmer h-3 w-3/4 rounded-full" />
                <div className="animate-shimmer h-3 w-1/2 rounded-full" />
                <div className="animate-shimmer h-3 w-2/3 rounded-full" />
              </div>
            </div>
          )}

          <Button
            className="mt-8"
            disabled={!fileName || !!simulatedError || analyzing}
            onClick={() => {
              setAnalyzing(true)
              setTimeout(() => {
                setAnalyzing(false)
                setStep('result')
              }, 1400)
            }}
          >
            {analyzing ? 'Analizando…' : 'Analizar fotografía'}
          </Button>
        </>
      )}

      {step === 'result' && (
        <>
          <h1 className="mt-6 font-serif-display text-4xl text-ink">Tu orientación está lista</h1>
          <p className="mt-3 max-w-xl text-sm text-muted">
            A partir de tu fotografía, esto es lo que NuraVision observó y los servicios del
            catálogo que podrían acompañarte.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <AppImage
              src={focus.imageUrl}
              variant="lavender"
              label={focus.label}
              alt={focus.label}
              className="aspect-square w-full rounded-2xl"
            />
            <div>
              <Kicker>Servicios recomendados</Kicker>
              <div className="mt-3 space-y-3">
                {recommended.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-line-soft bg-paper p-4"
                  >
                    <div>
                      <p className="font-medium text-ink">{s.name}</p>
                      <p className="text-xs text-muted">
                        {s.durationMin} min · {formatPrice(s.price)}
                      </p>
                    </div>
                    <Link
                      to={`/servicios/${s.id}`}
                      className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-ivory"
                    >
                      Ver servicio
                    </Link>
                  </div>
                ))}
                {recommended.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
                    Sin servicios recomendados para este enfoque.
                  </p>
                )}
              </div>

              <div className="mt-6 rounded-xl bg-line-soft/60 px-5 py-4 text-sm text-muted">
                Esta es una orientación estética basada en análisis visual, no un diagnóstico
                médico.
              </div>
            </div>
          </div>

          {/* Spec §11: despues del aviso de los servicios, lo que sigue en
              casa. Si la tienda no cargo o no hay productos para este enfoque,
              el bloque no aparece. */}
          {productosParaCasa.length > 0 && (
            <section className="mt-11">
              <h2 className="font-serif text-[26px] font-light text-ink sm:text-[30px]">
                Y para continuar en casa
              </h2>
              <p className="mt-2 text-sm text-muted">
                Productos de la tienda que complementan los servicios sugeridos.
              </p>
              <div className="mt-5">
                <ProductGrid productos={productosParaCasa} columnas={3} />
              </div>
            </section>
          )}

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/reservar"
              className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-ink-soft"
            >
              Reservar un servicio
            </Link>
            <button
              onClick={() => {
                setStep('prepare')
                setFileName(null)
              }}
              className="rounded-full border border-line px-6 py-3 text-sm font-medium text-ink hover:bg-ivory"
            >
              Analizar otra foto
            </button>
          </div>
        </>
      )}
    </div>
  )
}
