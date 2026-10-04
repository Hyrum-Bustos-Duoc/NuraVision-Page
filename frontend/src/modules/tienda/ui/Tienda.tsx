import { useSearchParams } from 'react-router-dom'
import { contenedor } from '@/shared/ui/nv-estilos'
import { Eyebrow } from '@/shared/ui/Eyebrow'
import { CATEGORIAS_PRODUCTO, filtroDesdeParam, type FiltroCategoria } from '../domain/categorias'
import { filtrarPorCategoria, muestraBannerCombo } from '../domain/producto.reglas'
import { ComboBanner } from './ComboBanner'
import { ProductGrid, ProductGridSkeleton } from './ProductGrid'
import { useCatalogo } from './useCatalogo'

const FILTROS: { id: FiltroCategoria; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  ...CATEGORIAS_PRODUCTO,
]

/** Catalogo de la tienda (spec §7). */
export default function Tienda() {
  const { productos, cargando, error } = useCatalogo()
  // El filtro vive en la URL: los links del footer ("Cabello", "Piel"…) llegan
  // con el filtro aplicado, y volver atras lo conserva.
  const [params, setParams] = useSearchParams()
  const filtro = filtroDesdeParam(params.get('categoria'))
  const visibles = filtrarPorCategoria(productos, filtro)

  function elegir(id: FiltroCategoria) {
    setParams(id === 'todos' ? {} : { categoria: id }, { replace: true })
  }

  return (
    <div className={`${contenedor} pb-20 pt-10 sm:pt-[52px]`}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Tienda Nura</Eyebrow>
          <h1 className="mt-3 font-serif text-[38px] font-light leading-[1.05] tracking-[-0.02em] text-nv-ink sm:text-[46px] lg:text-[52px]">
            Lo que usamos en el estudio
          </h1>
          <p className="mt-4 max-w-[560px] text-[15.5px] leading-[1.6] text-nv-muted1">
            Los mismos productos de nuestros rituales, elegidos por las profesionales para mantener
            el resultado entre una cita y otra.
          </p>
        </div>
        {!cargando && !error && (
          <p className="text-[13px] text-nv-soft1" aria-live="polite">
            {visibles.length} {visibles.length === 1 ? 'producto' : 'productos'}
          </p>
        )}
      </header>

      {/* En movil los chips se desplazan en horizontal en vez de apilarse en
          tres filas que empujan el catalogo fuera de la pantalla. */}
      <nav
        aria-label="Categorías"
        className="no-scrollbar -mx-4 mt-8 flex gap-1.5 overflow-x-auto border-b border-nv-line1 px-4 pb-[22px] sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {FILTROS.map((f) => {
          const activo = f.id === filtro
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => elegir(f.id)}
              aria-pressed={activo}
              className={`shrink-0 rounded-full border px-[18px] py-[9px] text-[13px] transition-colors ${
                activo
                  ? 'border-nv-ink bg-nv-ink text-nv-bg'
                  : 'border-nv-line2 text-nv-muted1 hover:bg-nv-paper4'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-7">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-dashed border-nv-line3 px-6 py-12 text-center text-sm text-nv-muted1"
          >
            {error}
          </p>
        )}

        {cargando && <ProductGridSkeleton cantidad={8} />}

        {!cargando && !error && (
          <>
            {muestraBannerCombo(filtro) && <ComboBanner />}
            {visibles.length > 0 ? (
              <ProductGrid productos={visibles} />
            ) : (
              <p className="rounded-lg border border-dashed border-nv-line3 px-6 py-12 text-center text-sm text-nv-muted1">
                Todavía no hay productos en esta categoría.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
