import type { Producto } from '../domain/producto.types'
import { ProductCard } from './ProductCard'

/**
 * Grilla de tarjetas: 2 columnas en movil, 3 en tablet y 4 en escritorio
 * (spec §2.3). `columnas={3}` es la de las recomendaciones del analisis.
 */
export function ProductGrid({ productos, columnas = 4 }: { productos: Producto[]; columnas?: 3 | 4 }) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:gap-5 ${columnas === 4 ? 'md:grid-cols-3 lg:grid-cols-4' : 'md:grid-cols-3'}`}
    >
      {productos.map((p) => (
        <ProductCard key={p.slug} producto={p} />
      ))}
    </div>
  )
}

/** Esqueleto mientras carga el catalogo, con la misma forma que la grilla. */
export function ProductGridSkeleton({ cantidad = 4, columnas = 4 }: { cantidad?: number; columnas?: 3 | 4 }) {
  return (
    <div
      aria-hidden="true"
      className={`grid grid-cols-2 gap-3 sm:gap-5 ${columnas === 4 ? 'md:grid-cols-3 lg:grid-cols-4' : 'md:grid-cols-3'}`}
    >
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-nv-line1 bg-nv-surface">
          <div className="aspect-square w-full animate-pulse bg-nv-tint2" />
          <div className="space-y-2 p-4">
            <div className="h-2.5 w-16 animate-pulse rounded bg-nv-tint2" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-nv-tint2" />
            <div className="h-3 w-12 animate-pulse rounded bg-nv-tint2" />
          </div>
        </div>
      ))}
    </div>
  )
}
