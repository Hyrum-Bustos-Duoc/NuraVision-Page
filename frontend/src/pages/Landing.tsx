import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'
import { categoryLabel } from '@/modules/servicios/domain/serviceCategories'
import { useServicios } from '@/modules/servicios/ui/useServicios'
import { useEquipoConAgenda } from '@/modules/profesionales/ui/useEquipoConAgenda'
import { fotoDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { etiquetaDePrecio } from '@/modules/servicios/ui/precio'
import { useIniciarReserva } from '@/modules/reservas/ui/useIniciarReserva'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import { ProductGrid, ProductGridSkeleton } from '@/modules/tienda/ui/ProductGrid'
import { BandaNuva, TarjetaNuvaHero } from '@/modules/nuva/ui/NuvaPortada'
import { AppImage } from '@/shared/ui/ui'
import { Eyebrow } from '@/shared/ui/Eyebrow'
import { Reveal } from '@/shared/ui/Reveal'
import { boton, contenedor, linkSubrayado } from '@/shared/ui/nv-estilos'

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

/** Los cuatro de la seccion "Tienda Nura" (spec §6), por slug de 0013. */
const DESTACADOS_TIENDA = [
  'aceite-de-cuticula-nura',
  'champu-reconstructor',
  'kit-ritual-manos',
  'protector-solar-fps-50',
]

const MODOS_ENTREGA = [
  { titulo: 'Despacho en 24–72 h', detalle: 'Gratis sobre $40.000 en Viña del Mar y Valparaíso' },
  { titulo: 'Retiro en el estudio', detalle: 'Listo en 2 horas, sin costo' },
  { titulo: 'Entrega en tu cita', detalle: 'Te lo dejamos listo para tu próxima reserva' },
]

const PASOS_IA = [
  { n: '01', titulo: 'Elige qué mirar', detalle: 'Manos, piel, cabello o cuero cabelludo.' },
  { n: '02', titulo: 'Sube una foto', detalle: 'Con luz natural. La analizamos en segundos.' },
  { n: '03', titulo: 'Recibe tu rutina', detalle: 'Un servicio en el estudio y productos para casa.' },
]

const HALLAZGOS_IA = ['Hidratación baja', 'Cutícula irregular', 'Borde libre con descamación']

export default function Landing() {
  const { siteContent } = useAppState()
  const iniciarReserva = useIniciarReserva()

  /**
   * Los destacados salen de la base, no de los datos de ejemplo: el mapa de
   * `servicio.imagenes` esta escrito con los nombres reales del catalogo, y los
   * enlaces apuntan a ids que la ficha de servicio sabe resolver.
   */
  const catalogo = useServicios()
  const featured = catalogo.servicios.slice(0, 4)
  const equipo = useEquipoConAgenda()
  const professionals = equipo.equipo

  const tienda = useCatalogo()
  const destacados = DESTACADOS_TIENDA.map((slug) => tienda.porSlug(slug)).filter((p) => p !== undefined)

  return (
    <div>
      {/* ---------------------------------------------------------------- Hero */}
      <section
        className={`${contenedor} grid gap-12 pb-16 pt-10 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-14 lg:pb-[88px]`}
      >
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-nv-accent-line px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.13em] text-nv-accent sm:text-[11px]">
            <span className="h-[5px] w-[5px] rounded-full bg-nv-accent" />
            Estudio de belleza · Tienda de cuidado
          </span>
          <h1 className="mt-6 text-balance font-serif text-[clamp(42px,6.4vw,66px)] font-light leading-[1.02] tracking-[-0.02em] text-nv-ink">
            Belleza en el estudio, <em className="text-nv-accent">cuidado</em> en casa
          </h1>
          <p className="mt-6 max-w-[460px] text-pretty text-[16px] leading-[1.65] text-nv-muted1 sm:text-[17px]">
            Reserva con nuestras profesionales o lleva a casa los mismos productos que usamos en
            cada ritual. Y si no sabes por dónde empezar, NuraVision analiza una fotografía y te
            orienta en ambos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => iniciarReserva()}
              className={`${boton.primario} px-[30px] py-[15px] text-[14.5px]`}
            >
              Reservar servicio
            </button>
            <Link to="/tienda" className={`${boton.primario} px-[30px] py-[15px] text-[14.5px]`}>
              Comprar productos
            </Link>
          </div>

          <TarjetaNuvaHero />

          <div className="mt-10 flex flex-wrap gap-x-[34px] gap-y-4 border-t border-nv-line1 pt-7">
            {/* Mientras carga se muestra un guion en vez de un 0, que se leeria
                como "el estudio no tiene servicios". */}
            <Stat
              value={catalogo.cargando || catalogo.error ? '—' : String(catalogo.servicios.length)}
              label="servicios"
            />
            <Stat
              value={tienda.cargando || tienda.error ? '—' : String(tienda.productos.length)}
              label="productos del estudio"
            />
            <Stat value="Gratis" label="retiro en el estudio" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <TileHero
            to="/servicios"
            imagen={siteContent.heroImage}
            etiquetaImagen="Fotografía · Estudio"
            eyebrow="El estudio"
            titulo="Servicios con hora en línea"
            link="Ver servicios →"
          />
          <TileHero
            to="/tienda"
            imagen={siteContent.shopImage}
            etiquetaImagen="Fotografía · Productos"
            eyebrow="La tienda"
            titulo="Lo que usamos, para tu casa"
            link="Ver tienda →"
            desplazado
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- Banda Nuva */}
      <div className={`${contenedor} pb-16 lg:pb-[88px]`}>
        <BandaNuva />
      </div>

      {/* ----------------------------------------------- Servicios destacados */}
      <Reveal>
        <section className="bg-nv-paper2 py-16 lg:py-[84px]">
          <div className={contenedor}>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Servicios destacados</Eyebrow>
                <h2 className="mt-3 font-serif text-[32px] font-light leading-[1.1] tracking-[-0.015em] text-nv-ink sm:text-[40px]">
                  Cuidado que se nota
                </h2>
              </div>
              <Link to="/servicios" className={linkSubrayado}>
                Ver catálogo completo →
              </Link>
            </div>
            {/* En la portada un error de carga no se muestra: el resto de la
                pagina sigue siendo util y la seccion simplemente no aparece. */}
            {catalogo.cargando && (
              <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="overflow-hidden rounded-lg border border-nv-line1 bg-nv-surface">
                    <div className="aspect-square w-full animate-pulse bg-nv-tint2" />
                    <div className="p-5">
                      <div className="h-3 w-16 animate-pulse rounded bg-nv-tint2" />
                      <div className="mt-3 h-5 w-32 animate-pulse rounded bg-nv-tint2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="stagger grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {featured.map((s) => (
                <Link
                  key={s.id}
                  to={`/servicios/${s.id}`}
                  className="nv-card overflow-hidden rounded-lg border border-nv-line1 bg-nv-surface"
                >
                  <AppImage
                    src={fotoDeServicio(s)}
                    label={s.nombre.split(' ')[0].toUpperCase()}
                    alt={s.nombre}
                    className="aspect-square w-full"
                  />
                  <div className="p-3 sm:p-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-nv-accent">
                      {categoryLabel(s.categoria)}
                    </p>
                    <h3 className="mt-1 font-serif text-base text-nv-ink sm:text-lg">{s.nombre}</h3>
                    <p className="mt-1 text-xs text-nv-soft1">
                      {s.duracionMinutos} min · {etiquetaDePrecio(s)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ---------------------------------------------------------- Tienda Nura */}
      {!tienda.error && (
        <Reveal>
          <section className={`${contenedor} py-16 lg:py-[84px]`}>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Tienda Nura</Eyebrow>
                <h2 className="mt-3 font-serif text-[32px] font-light leading-[1.1] tracking-[-0.015em] text-nv-ink sm:text-[40px]">
                  El ritual continúa en casa
                </h2>
              </div>
              <Link to="/tienda" className={linkSubrayado}>
                Ver toda la tienda →
              </Link>
            </div>
            {tienda.cargando ? <ProductGridSkeleton /> : <ProductGrid productos={destacados} />}

            <ul className="mt-6 grid gap-px overflow-hidden rounded-lg border border-nv-line1 bg-nv-line1 sm:grid-cols-3">
              {MODOS_ENTREGA.map((m) => (
                <li key={m.titulo} className="bg-nv-bg px-6 py-5">
                  <p className="text-[14.5px] text-nv-ink">{m.titulo}</p>
                  <p className="mt-1 text-[13px] text-nv-soft1">{m.detalle}</p>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      {/* ------------------------------------------------------- NuraVision IA */}
      <BandaAnalisis imagen={siteContent.aiTeaserImage} />

      {/* -------------------------------------------------------- Como funciona */}
      <section className="border-t border-nv-ink3 bg-nv-ink py-16">
        <div className={contenedor}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-nv-soft2">Cómo funciona</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.n} className={`sm:pl-6 ${i > 0 ? 'sm:border-l sm:border-nv-ink3' : ''}`}>
                <p className="font-serif text-3xl text-nv-soft2">{step.n}</p>
                <h3 className="mt-3 text-lg text-nv-bg">{step.title}</h3>
                <p className="mt-2 text-sm text-nv-faint2">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- El equipo */}
      <Reveal>
        <section className={`${contenedor} py-16 lg:py-[84px]`}>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>El equipo</Eyebrow>
              <h2 className="mt-3 font-serif text-[32px] font-light leading-[1.1] tracking-[-0.015em] text-nv-ink sm:text-[40px]">
                Quién te atiende
              </h2>
            </div>
            <Link to="/profesionales" className={linkSubrayado}>
              Ver profesionales →
            </Link>
          </div>
          {equipo.cargando && (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <div className="aspect-[3/4] w-full animate-pulse rounded-md bg-nv-tint2" />
                  <div className="mt-3 h-5 w-28 animate-pulse rounded bg-nv-tint2" />
                </div>
              ))}
            </div>
          )}

          {/* El fallo se dice, no se esconde: un hueco mudo bajo "Quién te
              atiende" no se distingue de un estudio sin profesionales. */}
          {!equipo.cargando && equipo.error && (
            <p role="alert" className="rounded-lg border border-dashed border-nv-line3 p-10 text-center text-sm text-nv-muted1">
              No pudimos cargar el equipo: {equipo.error}
            </p>
          )}

          {!equipo.cargando && !equipo.error && professionals.length === 0 && (
            <p className="rounded-lg border border-dashed border-nv-line3 p-10 text-center text-sm text-nv-muted1">
              Todavía no hay profesionales publicados.
            </p>
          )}

          {!equipo.cargando && !equipo.error && professionals.length > 0 && (
            <div className="stagger grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {professionals.map((p) => (
                <Link key={p.id} to={`/profesionales/${p.id}`} className="zoom-media group">
                  <AppImage src={p.imageUrl} label="Retrato" alt={p.name} className="aspect-[3/4] w-full rounded-md" />
                  <p className="mt-3 font-serif text-lg text-nv-ink">{p.name}</p>
                  <p className="text-sm text-nv-soft1">{p.role}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* ------------------------------------------------------------ CTA final */}
      <Reveal>
        <section className="mx-auto max-w-3xl px-4 pb-20 pt-6 text-center sm:px-6">
          <h2 className="font-serif text-4xl font-light text-nv-ink sm:text-5xl">Tu hora te está esperando</h2>
          <p className="mx-auto mt-4 max-w-md text-base text-nv-muted1">
            Agenda en línea, confirma al instante y recibe tu recordatorio.
          </p>
          <button
            type="button"
            onClick={() => iniciarReserva()}
            className={`${boton.primario} mt-8 px-[30px] py-[15px] text-[14.5px]`}
          >
            Reservar ahora
          </button>
        </section>
      </Reveal>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-serif text-[30px] font-light text-nv-ink sm:text-[34px]">{value}</p>
      <p className="text-[13px] text-nv-soft1">{label}</p>
    </div>
  )
}

function TileHero({
  to,
  imagen,
  etiquetaImagen,
  eyebrow,
  titulo,
  link,
  desplazado = false,
}: {
  to: string
  imagen?: string
  etiquetaImagen: string
  eyebrow: string
  titulo: string
  link: string
  desplazado?: boolean
}) {
  return (
    <Link
      to={to}
      className={`group relative block aspect-[3/5] overflow-hidden rounded-md transition-transform duration-300 hover:-translate-y-1 ${
        desplazado ? 'mt-8 sm:mt-12' : 'mb-8 sm:mb-12'
      }`}
    >
      {imagen ? (
        <AppImage src={imagen} alt={titulo} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="placeholder-stripes absolute inset-0 flex justify-center pt-6">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-nv-soft3">{etiquetaImagen}</span>
        </div>
      )}
      <div className="absolute inset-x-2 bottom-2 rounded-md bg-nv-bg p-3 sm:inset-x-4 sm:bottom-4 sm:p-5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-nv-accent">{eyebrow}</p>
        <p className="mt-1.5 font-serif text-[17px] leading-tight text-nv-ink sm:text-[21px]">{titulo}</p>
        <p className="mt-2 text-xs text-nv-ink sm:mt-3 sm:text-[13px]">{link}</p>
      </div>
    </Link>
  )
}

/** Banda oscura "Una foto. Tu rutina completa." (spec §6.3). */
function BandaAnalisis({ imagen }: { imagen?: string }) {
  const pasoActivo = usePasoCiclico(PASOS_IA.length, 2400)

  return (
    <section className="overflow-hidden bg-nv-ink text-nv-tint3">
      <div className={`${contenedor} grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:gap-20 lg:py-[110px]`}>
        <div>
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.14em] text-nv-accent-mid">
            NuraVision IA · análisis con IA
          </p>
          <h2 className="font-serif text-[clamp(46px,5.2vw,76px)] font-light leading-[0.95] tracking-[-0.02em] text-nv-bg">
            Una foto.
            <br />
            Tu rutina <em className="text-nv-accent-mid">completa</em>.
          </h2>

          <ol className="mt-10 border-t border-nv-ink3">
            {PASOS_IA.map((paso, i) => (
              <li
                key={paso.n}
                className={`grid grid-cols-[48px_1fr] border-b border-nv-ink3 py-5 transition-opacity duration-[600ms] sm:grid-cols-[60px_1fr] ${
                  pasoActivo === null || pasoActivo === i ? 'opacity-100' : 'opacity-40'
                }`}
              >
                <span className="pt-1 font-mono text-[10px] text-nv-accent-mid">{paso.n}</span>
                <span>
                  <span className="block text-[19px] text-nv-bg">{paso.titulo}</span>
                  <span className="mt-1 block text-[13.5px] leading-[1.5] text-nv-faint2">{paso.detalle}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/analisis-ia" className={`${boton.claroSobreOscuro} px-7 py-[15px] text-sm`}>
              Probar el análisis
            </Link>
            <span className="text-xs text-nv-soft2">Orientación estética · no es diagnóstico médico</span>
          </div>
        </div>

        <div className="placeholder-stripes-dark relative aspect-[4/5] w-full overflow-hidden rounded-md">
          {imagen ? (
            <img
              src={imagen}
              alt="Mano con manicura natural, como la que analiza NuraVision IA"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] uppercase tracking-[0.1em] text-nv-soft2">
              foto · manos
            </span>
          )}
          <span
            aria-hidden="true"
            className="animate-nv-scan absolute inset-x-[6%] h-0.5 bg-nv-accent-mid shadow-[0_0_24px_4px_var(--nv-accent-mid)]"
          />
          <ul className="absolute inset-x-5 bottom-5 flex flex-wrap gap-2">
            {HALLAZGOS_IA.map((h) => (
              <li key={h} className="rounded-full bg-[rgba(255,253,250,0.92)] px-3 py-2 text-xs text-nv-ink">
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/**
 * Indice que avanza solo cada `intervalo` ms. Con movimiento reducido devuelve
 * `null`: todos los pasos quedan visibles y nada cambia por su cuenta.
 */
function usePasoCiclico(total: number, intervalo: number): number | null {
  const [reducido] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  const [paso, setPaso] = useState(0)

  useEffect(() => {
    if (reducido) return
    const id = window.setInterval(() => setPaso((p) => (p + 1) % total), intervalo)
    return () => window.clearInterval(id)
  }, [reducido, total, intervalo])

  return reducido ? null : paso
}
