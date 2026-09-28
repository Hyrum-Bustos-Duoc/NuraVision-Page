import { Link } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { categoryLabel } from '@/modules/servicios/domain/serviceCategories'
import { useServicios } from '@/modules/servicios/ui/useServicios'
import { useEquipoConAgenda } from '@/modules/profesionales/ui/useEquipoConAgenda'
import { imagenDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { AppImage, Kicker, LinkButton } from '@/shared/ui/ui'
import { Reveal } from '@/shared/ui/Reveal'
import { formatPrice } from '@/shared/lib/format'
import { getNextAvailableSlots } from '@/shared/lib/availability'

const STEPS = [
  {
    n: '01',
    title: 'Elige tu servicio',
    desc: 'Explora el catálogo con duración y precio a la vista.',
  },
  {
    n: '02',
    title: 'Elige profesional',
    desc: 'Solo verás a quienes realizan ese servicio.',
  },
  {
    n: '03',
    title: 'Selecciona horario',
    desc: 'Únicamente los bloques realmente disponibles.',
  },
  {
    n: '04',
    title: 'Confirma',
    desc: 'Revisa el resumen y recibe tu confirmación al instante.',
  },
]

export default function Landing() {
  // `bookings` sigue siendo local: es lo unico que hay para marcar las horas
  // ya tomadas al calcular la proxima libre.
  const { activeServices: services, siteContent, bookings } = useAppState()

  /**
   * Los destacados salen de la base, no de los datos de ejemplo.
   *
   * Es lo que hace que la imagen cruce: el mapa de `servicio.imagenes` esta
   * escrito con los nombres reales del catalogo, y los del prototipo son
   * otros ("Manicure Ritual Nura", "Pedicure Spa"). Con esos, los tres
   * servicios de uñas caian todos en la imagen generica de la categoria y la
   * portada mostraba la misma foto tres veces seguidas.
   *
   * De paso arregla los enlaces: apuntaban a ids del prototipo, que la ficha
   * de servicio ya no sabe resolver contra la base.
   */
  const catalogo = useServicios()
  const featured = catalogo.servicios.slice(0, 4)
  /**
   * El equipo sale de la base, igual que los destacados.
   *
   * Se usa `useEquipoConAgenda` y no `useProfesionales` a proposito: trae
   * ademas el horario semanal, que es lo que permite seguir mostrando la
   * tarjeta de "proxima hora libre". Con la entidad de dominio a secas habria
   * que quitarla, porque sin agenda no hay proxima hora que calcular.
   */
  const equipo = useEquipoConAgenda()
  const professionals = equipo.equipo

  const firstProfessional = professionals[0]
  const nextSlot = firstProfessional
    ? getNextAvailableSlots(firstProfessional, bookings, 1)[0]
    : undefined

  return (
    <div>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-olive-700">
            <span className="h-1.5 w-1.5 rounded-full bg-olive-600" />
            Análisis visual con IA
          </span>
          <h1 className="mt-6 font-serif-display text-5xl leading-[1.05] text-ink sm:text-6xl">
            Reserva tu próxima <em className="italic text-olive-700">experiencia</em> de belleza
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            Elige tu servicio, tu profesional y tu horario en menos de un minuto. Y si no sabes por
            dónde empezar, deja que NuraVision analice una fotografía y te oriente.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <LinkButton to="/reservar">Reservar ahora</LinkButton>
            <LinkButton to="/servicios" variant="outline">
              Conocer servicios
            </LinkButton>
          </div>
          <div className="mt-12 flex gap-10 border-t border-line-soft pt-8">
            <Stat value={String(catalogo.servicios.length || services.length)} label="servicios" />
            {/* Mientras carga se muestra un guion en vez de un 0, que se leeria
                como "el estudio no tiene profesionales". */}
            <Stat
              value={equipo.cargando || equipo.error ? '—' : String(professionals.length)}
              label="profesionales"
            />
            <Stat value="24/7" label="agenda en línea" />
          </div>
        </div>

        <div className="animate-fade-up relative [animation-delay:120ms]">
          <AppImage
            src={siteContent.heroImage}
            label={siteContent.heroCaption}
            alt="Estudio Nura"
            className="aspect-[4/5] w-full rounded-2xl"
          />
          {firstProfessional && nextSlot && (
            <div className="animate-fade-up absolute bottom-6 left-6 w-56 rounded-xl border border-line-soft bg-paper p-4 shadow-sm [animation-delay:320ms]">
              <Kicker>Próxima hora libre</Kicker>
              <p className="mt-2 text-sm font-medium text-ink">{firstProfessional.name}</p>
              <p className="text-sm text-muted">{nextSlot.label.replace(' ', ' · ')}</p>
            </div>
          )}
        </div>
      </section>

      <Reveal>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Kicker>Servicios destacados</Kicker>
            <h2 className="mt-2 font-serif-display text-4xl text-ink">Cuidado que se nota</h2>
          </div>
          <Link
            to="/servicios"
            className="group text-sm font-medium text-ink transition-colors hover:text-olive-700"
          >
            Ver catálogo completo{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
        {/* En la portada un error de carga no se muestra: no hay nada que la
            persona pueda hacer al respecto, y el resto de la pagina sigue
            siendo util. La seccion simplemente no aparece. */}
        {catalogo.cargando && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-line-soft bg-paper"
              >
                <div className="aspect-square w-full animate-pulse bg-line-soft" />
                <div className="p-5">
                  <div className="h-3 w-16 animate-pulse rounded bg-line-soft" />
                  <div className="mt-3 h-5 w-32 animate-pulse rounded bg-line-soft" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="stagger grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((s) => (
            <Link
              key={s.id}
              to={`/servicios/${s.id}`}
              className="card-hover overflow-hidden rounded-2xl border border-line-soft bg-paper"
            >
              {/* Mismo helper y mismo encuadre que el catalogo, para que la
                  portada y /servicios muestren la misma fotografia. El
                  `overflow-hidden` de la tarjeta recorta la imagen con su
                  radio, sin redondearla por su cuenta. */}
              <AppImage
                src={imagenDeServicio(s.nombre, s.categoria)}
                label={s.nombre.split(' ')[0].toUpperCase()}
                alt={s.nombre}
                className="aspect-square w-full"
              />
              <div className="p-5">
                <Kicker>{categoryLabel(s.categoria)}</Kicker>
                <h3 className="mt-1 font-serif-display text-xl text-ink">{s.nombre}</h3>
                <p className="mt-2 text-sm text-muted">
                  {s.duracionMinutos} min · {formatPrice(s.precioBase)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      </Reveal>

      <Reveal>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:items-center">
        <AppImage
          src={siteContent.aiTeaserImage}
          label={siteContent.aiTeaserCaption}
          alt="Análisis con NuraVision IA"
          variant="lavender"
          className="aspect-square w-full rounded-2xl"
        />
        <div>
          <Kicker>NuraVision IA</Kicker>
          <h2 className="mt-3 font-serif-display text-4xl leading-tight text-ink">
            Una fotografía. Una orientación clara.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted">
            Sube o captura una imagen de tus manos, uñas, piel o cuero cabelludo. NuraVision
            identifica características visuales y te sugiere servicios de nuestro catálogo que
            podrían acompañarte.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-ink">
            {[
              ...siteContent.aiFocusOptions.map((option) => option.label),
              'Recomendación de servicios del catálogo',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-olive-600" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl bg-line-soft/60 px-5 py-4 text-sm text-muted">
            NuraVision entrega una orientación estética basada en análisis visual.{' '}
            <strong className="text-ink">No constituye un diagnóstico médico</strong> ni reemplaza la
            evaluación de un profesional de la salud.
          </div>
          <LinkButton to="/analisis-ia" variant="olive" className="mt-6">
            Probar el análisis
          </LinkButton>
        </div>
      </section>
      </Reveal>

      <Reveal>
      <section className="bg-ink py-16 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <Kicker className="text-white/50">Cómo funciona</Kicker>
          <div className="stagger mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.n} className={`pl-6 ${i > 0 ? 'border-l border-white/15' : ''}`}>
                <p className="font-serif-display text-3xl text-white/30">{step.n}</p>
                <h3 className="mt-3 text-lg font-medium text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-white/55">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </Reveal>

      <Reveal>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Kicker>El equipo</Kicker>
            <h2 className="mt-2 font-serif-display text-4xl text-ink">Quién te atiende</h2>
          </div>
          <Link
            to="/profesionales"
            className="group text-sm font-medium text-ink transition-colors hover:text-olive-700"
          >
            Ver profesionales{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
        {equipo.cargando && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-line-soft" />
                <div className="mt-3 h-5 w-28 animate-pulse rounded bg-line-soft" />
              </div>
            ))}
          </div>
        )}

        {/* El fallo se dice, no se esconde. Antes se ocultaba con el argumento
            de que la visitante no puede hacer nada al respecto, pero eso deja
            un hueco mudo justo bajo el titulo "Nuestro equipo": no se
            distingue de un estudio sin profesionales, y quien reporte el
            problema no tendra nada que contar. */}
        {!equipo.cargando && equipo.error && (
          <p role="alert" className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            No pudimos cargar el equipo: {equipo.error}
          </p>
        )}

        {!equipo.cargando && !equipo.error && professionals.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Todavía no hay profesionales publicados.
          </p>
        )}

        {/* La rejilla solo aparece cuando hay algo que poner: con error o
            cargando, pintar un grid vacio debajo del aviso sobra. */}
        {!equipo.cargando && !equipo.error && professionals.length > 0 && (
        <div className="stagger grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {professionals.map((p) => (
            <Link key={p.id} to={`/profesionales/${p.id}`} className="zoom-media group">
              <AppImage
                src={p.imageUrl}
                label="Retrato"
                alt={p.name}
                className="aspect-[3/4] w-full rounded-2xl"
              />
              <p className="mt-3 font-serif-display text-lg text-ink">{p.name}</p>
              <p className="text-sm text-muted">{p.role}</p>
            </Link>
          ))}
        </div>
        )}
      </section>
      </Reveal>

      <Reveal>
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="font-serif-display text-4xl text-ink sm:text-5xl">Tu hora te está esperando</h2>
        <p className="mx-auto mt-4 max-w-md text-base text-muted">
          Agenda en línea, confirma al instante y recibe tu recordatorio.
        </p>
        <LinkButton to="/reservar" className="mt-8">
          Reservar ahora
        </LinkButton>
      </section>
      </Reveal>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-serif-display text-3xl text-ink">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}
