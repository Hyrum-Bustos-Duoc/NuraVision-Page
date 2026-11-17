import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Trash2, Upload } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { AppImage, Button, FilterPills, Kicker } from '@/shared/ui/ui'
import { useScrollToTopOnChange } from '@/shared/components/ScrollToTop'
import { formatPrice } from '@/shared/lib/format'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import { ProductGrid } from '@/modules/tienda/ui/ProductGrid'
import { useContenido } from '@/modules/contenido/ui/useContenido'
import { ErrorAnalisis, type ResultadoAnalisis } from '@/modules/analisis/domain/analisis.types'
import { analizarFoto, mensajeNoConcluyente } from '@/modules/analisis/infrastructure/analisis.api'
import { ResultadoUnas } from '@/modules/analisis/ui/ResultadoUnas'

type Step = 'prepare' | 'upload' | 'result'
type SimulatedError = 'imagen_invalida' | 'servicio_caido' | null

export default function AIAnalysis() {
  const { siteContent, activeServices: services } = useAppState()
  const { porSlug } = useCatalogo()
  const { contenido } = useContenido()

  // Las opciones (ids, servicios y productos recomendados) siguen en el codigo;
  // el nombre y los consejos se editan en Panel -> Contenido.
  const focusOptions = useMemo(
    () =>
      siteContent.aiFocusOptions.map((o) => {
        const editado = contenido.analisis[o.id]
        if (!editado) return o
        return {
          ...o,
          label: editado.label,
          tips: editado.tips
            .filter((t) => t.titulo.trim())
            .map((t, i) => ({
              id: o.tips[i]?.id ?? `${o.id}-${i}`,
              title: t.titulo,
              description: t.detalle,
              imageUrl: o.tips[i]?.imageUrl,
            })),
        }
      }),
    [siteContent.aiFocusOptions, contenido.analisis],
  )

  const [focusId, setFocusId] = useState(focusOptions[0]?.id ?? '')
  const [step, setStep] = useState<Step>('prepare')
  const [simulatedError, setSimulatedError] = useState<SimulatedError>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [foto, setFoto] = useState<{ archivo: File; url: string } | null>(null)
  const [resultado, setResultado] = useState<ResultadoAnalisis | null>(null)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const inputFoto = useRef<HTMLInputElement>(null)
  const peticion = useRef<AbortController | null>(null)
  const urlActual = useRef<string | null>(null)

  useScrollToTopOnChange(step)

  // La vista previa es una URL de objeto: se libera al cambiar de foto y al salir.
  useEffect(
    () => () => {
      peticion.current?.abort()
      if (urlActual.current) URL.revokeObjectURL(urlActual.current)
    },
    [],
  )

  function elegirFoto(archivo: File | undefined) {
    peticion.current?.abort()
    setAnalyzing(false)
    setSimulatedError(null)
    setErrorAnalisis(null)
    setResultado(null)
    if (urlActual.current) URL.revokeObjectURL(urlActual.current)
    urlActual.current = archivo ? URL.createObjectURL(archivo) : null
    setFoto(archivo && urlActual.current ? { archivo, url: urlActual.current } : null)
  }

  /** Quita la foto elegida (por error o para cambiarla); no se analiza ni se guarda nada. */
  function quitarFoto() {
    elegirFoto(undefined)
    // Sin esto, volver a elegir el mismo archivo no dispara onChange.
    if (inputFoto.current) inputFoto.current.value = ''
  }

  function soltarFoto(archivo: File | undefined) {
    if (!archivo) return
    // Venga del arrastre o del selector, el input no debe conservar un archivo que ya no es la foto elegida.
    if (inputFoto.current) inputFoto.current.value = ''
    if (!archivo.type.startsWith('image/')) {
      elegirFoto(undefined)
      setErrorAnalisis('Ese archivo no es una imagen. Suelta una foto en formato JPG o PNG.')
      return
    }
    elegirFoto(archivo)
  }

  async function analizar() {
    if (!foto) return
    peticion.current?.abort()
    const control = new AbortController()
    peticion.current = control
    setAnalyzing(true)
    setErrorAnalisis(null)
    try {
      const r = await analizarFoto(foto.archivo, control.signal)
      if (control.signal.aborted) return
      if (r.estado === 'ok') {
        setResultado(r)
        setStep('result')
      } else {
        // Sin mano o foto muy pequena: no es un fallo, se le dice que hacer.
        setErrorAnalisis(mensajeNoConcluyente(r.motivo))
      }
    } catch (error) {
      if (error instanceof ErrorAnalisis && error.codigo === 'cancelado') return
      setErrorAnalisis(
        error instanceof ErrorAnalisis
          ? error.message
          : 'No pudimos analizar la foto. Intenta nuevamente.',
      )
    } finally {
      if (peticion.current === control) setAnalyzing(false)
    }
  }

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
            Tu imagen es privada y solo tú puedes verla. La forma de tus uñas es una{' '}
            <strong className="text-ink">orientación estética</strong>. El reporte clínico opcional
            reconoce solo algunas señales: no es un diagnóstico médico ni descarta nada. Ante
            cualquier duda sobre tus uñas, consulta con un profesional.
          </div>

          <Button className="mt-8" onClick={() => setStep('upload')}>
            Continuar
          </Button>
        </>
      )}

      {step === 'upload' && (
        <>
          <button
            onClick={() => {
              // Si hay un analisis en curso, su respuesta ya no le interesa a la clienta.
              peticion.current?.abort()
              setAnalyzing(false)
              setStep('prepare')
            }}
            className="mt-6 text-sm text-muted hover:text-ink"
          >
            ← Cambiar enfoque
          </button>
          <h1 className="mt-2 font-serif-display text-4xl text-ink">Sube tu fotografía</h1>
          <p className="mt-3 text-sm text-muted">Analizaremos {focus.analysisLabel}.</p>

          {(simulatedError || errorAnalisis) && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-xl border border-[#e6c9c0] bg-danger-soft px-5 py-4 text-sm text-danger"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {errorAnalisis ??
                (simulatedError === 'imagen_invalida'
                  ? 'No pudimos leer esta imagen. Intenta con una foto en formato JPG o PNG, con buena luz.'
                  : 'El servicio de análisis no está disponible en este momento. Intenta nuevamente en unos minutos.')}
            </div>
          )}

          <label
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrando(true)
            }}
            onDragLeave={(e) => {
              // Pasar a un hijo de la zona también dispara dragleave: no apagar el resaltado.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setArrastrando(false)
              soltarFoto(e.dataTransfer.files?.[0])
            }}
            className={`mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors hover:border-olive-400 ${
              arrastrando ? 'border-olive-400 bg-olive-50/50' : 'border-line bg-paper'
            }`}
          >
            <Upload className="h-6 w-6 text-muted" />
            <span className="text-sm text-ink">
              {foto?.archivo.name ?? 'Arrastra tu foto aquí o haz clic para subirla'}
            </span>
            <span className="text-xs text-muted-light">JPG o PNG · máx. 10 MB</span>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                if (!archivo) return elegirFoto(undefined)
                // El selector muestra "Todos los archivos": se valida igual que al soltar,
                // pero sin vaciar el input (el archivo elegido sigue siendo el actual).
                if (archivo.type.startsWith('image/')) elegirFoto(archivo)
                else soltarFoto(archivo)
              }}
            />
          </label>

          {foto && (
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <img
                src={foto.url}
                alt="Vista previa de tu fotografía"
                className="max-h-64 rounded-xl border border-line-soft"
              />
              <button
                type="button"
                onClick={quitarFoto}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger-soft"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Quitar foto
              </button>
            </div>
          )}

          {analyzing && (
            <div className="mt-8 rounded-2xl border border-line-soft bg-paper p-6">
              <p className="text-sm font-medium text-ink">Analizando tu fotografía…</p>
              <p className="mt-1 text-xs text-muted">
                Estamos buscando tus manos y uñas en la foto.
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
            disabled={!foto || !!simulatedError || analyzing}
            onClick={analizar}
          >
            {analyzing ? 'Analizando…' : 'Analizar fotografía'}
          </Button>
        </>
      )}

      {step === 'result' && (
        <>
          <h1 className="mt-6 font-serif-display text-4xl text-ink">Tu orientación está lista</h1>
          <p className="mt-3 max-w-xl text-sm text-muted">
            Localizamos las uñas de tu fotografía. Los servicios sugeridos corresponden al enfoque
            que elegiste.
          </p>

          {resultado && foto && <ResultadoUnas resultado={resultado} fotoUrl={foto.url} />}

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
                La forma y los servicios sugeridos son una orientación estética. El reporte
                clínico es una señal para consultar con un profesional, no un diagnóstico médico.
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
                elegirFoto(undefined)
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
