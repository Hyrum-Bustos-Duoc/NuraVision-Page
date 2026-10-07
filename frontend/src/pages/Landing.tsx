import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useContenido } from '@/modules/contenido/ui/useContenido'
import { TextoConEnfasis } from '@/modules/contenido/ui/TextoConEnfasis'
import type { ContenidoSitio } from '@/modules/contenido/application'
import { categoryLabel } from '@/modules/servicios/domain/serviceCategories'
import { useServicios } from '@/modules/servicios/ui/useServicios'
import { useEquipoConAgenda } from '@/modules/profesionales/ui/useEquipoConAgenda'
import { fotoDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { etiquetaDePrecio } from '@/modules/servicios/ui/precio'
import { useIniciarReserva } from '@/modules/reservas/ui/useIniciarReserva'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import { ProductGrid, ProductGridSkeleton } from '@/modules/tienda/ui/ProductGrid'
import { BandaNuria, TarjetaNuriaHero } from '@/modules/nuria/ui/NuriaPortada'
import { AppImage } from '@/shared/ui/ui'
import { Carrusel } from '@/shared/ui/Carrusel'
import { Eyebrow } from '@/shared/ui/Eyebrow'
import { Reveal } from '@/shared/ui/Reveal'
import { boton, contenedor, linkSubrayado } from '@/shared/ui/nv-estilos'


/** Los cuatro de la seccion "Tienda Nura" (spec §6), por slug de 0013. */
const DESTACADOS_TIENDA = [
  'aceite-de-cuticula-nura',
  'champu-reconstructor',
  'kit-ritual-manos',
  'protector-solar-fps-50',
]




export default function Landing() {
  const { contenido } = useContenido()
  const c = contenido
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
            {c.portada.etiqueta}
          </span>
          <h1 className="mt-6 text-balance font-serif text-[clamp(42px,6.4vw,66px)] font-light leading-[1.02] tracking-[-0.02em] text-nv-ink">
            <TextoConEnfasis texto={c.portada.titulo} claseEnfasis="text-nv-accent" />
          </h1>
          <p className="mt-6 max-w-[460px] text-pretty text-[16px] leading-[1.65] text-nv-muted1 sm:text-[17px]">
            {c.portada.descripcion}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => iniciarReserva()}
              className={`${boton.primario} px-[30px] py-[15px] text-[14.5px]`}
            >
              {c.portada.botonReservar}
            </button>
            <Link to="/tienda" className={`${boton.primario} px-[30px] py-[15px] text-[14.5px]`}>
              {c.portada.botonTienda}
            </Link>
          </div>

          <TarjetaNuriaHero />

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

        <div className="grid gap-3 sm:gap-5">
          <TileHero
            to="/servicios"
            fotos={c.carruseles.estudio}
            etiquetaImagen="Fotografía · Estudio"
            eyebrow={c.portada.tarjetaEstudio.eyebrow}
            titulo={c.portada.tarjetaEstudio.titulo}
            link={c.portada.tarjetaEstudio.enlace}
          />
          <TileHero
            to="/tienda"
            fotos={c.carruseles.tienda}
            etiquetaImagen="Fotografía · Productos"
            eyebrow={c.portada.tarjetaTienda.eyebrow}
            titulo={c.portada.tarjetaTienda.titulo}
            link={c.portada.tarjetaTienda.enlace}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- Banda Nuria */}
      <div className={`${contenedor} pb-16 lg:pb-[88px]`}>
        <BandaNuria />
      </div>

      {/* ----------------------------------------------- Servicios destacados */}
      <Reveal>
        <section className="bg-nv-paper2 py-16 lg:py-[84px]">
          <div className={contenedor}>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>{c.servicios.eyebrow}</Eyebrow>
                <h2 className="mt-3 font-serif text-[32px] font-light leading-[1.1] tracking-[-0.015em] text-nv-ink sm:text-[40px]">
                  <TextoConEnfasis texto={c.servicios.titulo} claseEnfasis="text-nv-accent" />
                </h2>
              </div>
              <Link to="/servicios" className={linkSubrayado}>
                {c.servicios.enlace}
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
                <Eyebrow>{c.tienda.eyebrow}</Eyebrow>
                <h2 className="mt-3 font-serif text-[32px] font-light leading-[1.1] tracking-[-0.015em] text-nv-ink sm:text-[40px]">
                  <TextoConEnfasis texto={c.tienda.titulo} claseEnfasis="text-nv-accent" />
                </h2>
              </div>
              <Link to="/tienda" className={linkSubrayado}>
                {c.tienda.enlace}
              </Link>
            </div>
            {tienda.cargando ? <ProductGridSkeleton /> : <ProductGrid productos={destacados} />}

            <ul className="mt-6 grid gap-px overflow-hidden rounded-lg border border-nv-line1 bg-nv-line1 sm:grid-cols-3">
              {c.tienda.entregas.map((m) => (
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
      <BandaAnalisis imagen={c.imagenes.bandaIA ?? undefined} textos={c.bandaIA} />

      {/* -------------------------------------------------------- Como funciona */}
      <section className="border-t border-nv-ink3 bg-nv-ink py-16">
        <div className={contenedor}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-nv-soft2">{c.comoFunciona.titulo}</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {c.comoFunciona.pasos.map((step, i) => (
              <div key={i} className={`sm:pl-6 ${i > 0 ? 'sm:border-l sm:border-nv-ink3' : ''}`}>
                <p className="font-serif text-3xl text-nv-soft2">{numeroPaso(i)}</p>
                <h3 className="mt-3 text-lg text-nv-bg">{step.titulo}</h3>
                <p className="mt-2 text-sm text-nv-faint2">{step.detalle}</p>
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
              <Eyebrow>{c.equipo.eyebrow}</Eyebrow>
              <h2 className="mt-3 font-serif text-[32px] font-light leading-[1.1] tracking-[-0.015em] text-nv-ink sm:text-[40px]">
                <TextoConEnfasis texto={c.equipo.titulo} claseEnfasis="text-nv-accent" />
              </h2>
            </div>
            <Link to="/profesionales" className={linkSubrayado}>
              {c.equipo.enlace}
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
          <h2 className="font-serif text-4xl font-light text-nv-ink sm:text-5xl">
            <TextoConEnfasis texto={c.ctaFinal.titulo} claseEnfasis="text-nv-accent" />
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-nv-muted1">{c.ctaFinal.descripcion}</p>
          <button
            type="button"
            onClick={() => iniciarReserva()}
            className={`${boton.primario} mt-8 px-[30px] py-[15px] text-[14.5px]`}
          >
            {c.ctaFinal.boton}
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

/**
 * Tarjeta apaisada de la portada con sus fotos en carrusel: las dos van una
 * sobre la otra, con el mismo ancho y alto, y el texto anclado a la esquina
 * inferior izquierda. El enlace cubre toda la tarjeta; los controles del
 * carrusel quedan por encima y fuera de el (ver `Carrusel`).
 */
function TileHero({
  to,
  fotos,
  etiquetaImagen,
  eyebrow,
  titulo,
  link,
}: {
  to: string
  fotos: string[]
  etiquetaImagen: string
  eyebrow: string
  titulo: string
  link: string
}) {
  return (
    <Carrusel
      fotos={fotos}
      alt={titulo}
      etiqueta={`Fotos: ${eyebrow}`}
      className="aspect-[16/9] rounded-md transition-transform duration-300 hover:-translate-y-1"
    >
      <Link to={to} className="absolute inset-0 block rounded-md">
        {fotos.length === 0 && (
          <div className="placeholder-stripes absolute inset-0 flex justify-end p-4">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-nv-soft3">{etiquetaImagen}</span>
          </div>
        )}
        {/* Texto directo sobre la foto, sin caja (2026-10-07). El velo solo
            oscurece la esquina del texto: las fotos de productos dejan el
            producto a la derecha y debe verse limpio. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md bg-[radial-gradient(ellipse_75%_70%_at_0%_100%,rgba(28,30,22,0.72),rgba(28,30,22,0.25)_55%,transparent_80%)]"
        />
        <div className="absolute bottom-3 left-3 w-[56%] max-w-[300px] text-[#fffefb] [text-shadow:0_1px_8px_rgba(0,0,0,0.35)] max-[359px]:w-[50%] sm:bottom-5 sm:left-5 sm:w-[62%]">
          <p className="text-[10px] uppercase tracking-[0.15em] opacity-90">{eyebrow}</p>
          <p className="mt-1.5 font-serif text-[17px] leading-tight sm:text-[21px]">{titulo}</p>
          <p className="mt-2 text-xs opacity-90 sm:mt-3 sm:text-[13px]">{link}</p>
        </div>
      </Link>
    </Carrusel>
  )
}

/** Banda oscura "Una foto. Tu rutina completa." (spec §6.3). */
/** "01", "02"… : la numeracion la pone el orden, no se edita. */
function numeroPaso(i: number): string {
  return String(i + 1).padStart(2, '0')
}

function BandaAnalisis({ imagen, textos }: { imagen?: string; textos: ContenidoSitio['bandaIA'] }) {
  const pasoActivo = usePasoCiclico(textos.pasos.length, 2400)

  return (
    <section className="overflow-hidden bg-nv-ink text-nv-tint3">
      <div className={`${contenedor} grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:gap-20 lg:py-[110px]`}>
        <div>
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.14em] text-nv-accent-mid">
            {textos.eyebrow}
          </p>
          <h2 className="font-serif text-[clamp(46px,5.2vw,76px)] font-light leading-[0.95] tracking-[-0.02em] text-nv-bg">
            <TextoConEnfasis texto={textos.titulo} claseEnfasis="text-nv-accent-mid" />
          </h2>

          <ol className="mt-10 border-t border-nv-ink3">
            {textos.pasos.map((paso, i) => (
              <li
                key={i}
                className={`grid grid-cols-[48px_1fr] border-b border-nv-ink3 py-5 transition-opacity duration-[600ms] sm:grid-cols-[60px_1fr] ${
                  pasoActivo === null || pasoActivo === i ? 'opacity-100' : 'opacity-40'
                }`}
              >
                <span className="pt-1 font-mono text-[10px] text-nv-accent-mid">{numeroPaso(i)}</span>
                <span>
                  <span className="block text-[19px] text-nv-bg">{paso.titulo}</span>
                  <span className="mt-1 block text-[13.5px] leading-[1.5] text-nv-faint2">{paso.detalle}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/analisis-ia" className={`${boton.claroSobreOscuro} px-7 py-[15px] text-sm`}>
              {textos.boton}
            </Link>
            <span className="text-xs text-nv-soft2">{textos.aviso}</span>
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
            {textos.hallazgos.filter((h) => h.trim()).map((h, i) => (
              <li key={i} className="rounded-full bg-[rgba(255,253,250,0.92)] px-3 py-2 text-xs text-nv-ink">
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
