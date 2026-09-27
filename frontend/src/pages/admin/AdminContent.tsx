import { FileCode2 } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { Card, Kicker } from '@/shared/ui/ui'

/**
 * Contenido del sitio, en solo lectura.
 *
 * Hasta ahora esta pantalla editaba los textos y las imagenes, y el resultado
 * se guardaba en el almacenamiento del navegador. Eso tenia dos problemas: el
 * cambio solo lo veia quien lo hacia —nunca llegaba a nadie mas— y se perdia
 * al limpiar el navegador.
 *
 * El contenido pasa a estar versionado en `shared/content/sitio.ts`, asi que
 * ahora se cambia con un commit: queda en el historial, pasa por revision y lo
 * ve todo el mundo al desplegar. Esta pantalla se conserva para poder
 * consultar lo que hay publicado sin abrir el editor.
 */
export default function AdminContent() {
  const { siteContent } = useAppState()

  return (
    <div>
      <Kicker>Contenido</Kicker>
      <h1 className="mt-2 font-serif-display text-4xl text-ink">Contenido del sitio</h1>

      <Card className="mt-6 flex gap-4 p-5">
        <FileCode2 className="h-5 w-5 shrink-0 text-olive-600" />
        <div>
          <p className="text-sm font-medium text-ink">Se edita en el código, no aquí</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Estos textos viven en{' '}
            <code className="rounded bg-ivory px-1.5 py-0.5 text-xs text-ink">
              frontend/src/shared/content/sitio.ts
            </code>
            . Cambiarlos es un commit: queda registrado, pasa por revisión y lo ve todo el equipo al
            desplegar.
          </p>
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="font-serif-display text-2xl text-ink">Pies de foto</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <Kicker>Portada</Kicker>
            <p className="mt-2 text-sm text-ink">{siteContent.heroCaption}</p>
          </Card>
          <Card className="p-5">
            <Kicker>Análisis IA</Kicker>
            <p className="mt-2 text-sm text-ink">{siteContent.aiTeaserCaption}</p>
          </Card>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif-display text-2xl text-ink">Opciones de análisis</h2>
        <p className="mt-1 text-sm text-muted">
          Lo que puede elegir la clientela al subir una fotografía, con los consejos que se le
          muestran.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {siteContent.aiFocusOptions.map((option) => (
            <Card key={option.id} className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif-display text-xl text-ink">{option.label}</h3>
                <code className="text-xs text-muted-light">{option.id}</code>
              </div>

              <ul className="mt-4 space-y-3">
                {option.tips.map((tip) => (
                  <li key={tip.id} className="border-l border-line-soft pl-3">
                    <p className="text-sm font-medium text-ink">{tip.title}</p>
                    <p className="text-sm text-muted">{tip.description}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
