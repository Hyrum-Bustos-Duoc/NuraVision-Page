import { Link } from 'react-router-dom'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { ETIQUETA_INSIGNIA, etiquetaCategoria } from '../domain/categorias'
import type { Producto } from '../domain/producto.types'
import { Precio } from './Precio'
import { ProductoImagen } from './ProductoImagen'

/**
 * Tarjeta de producto (spec §5). Es UNA sola para la portada, el catalogo,
 * "Combina bien con" y las recomendaciones del analisis: cambiarla aqui la
 * cambia en los cuatro lugares.
 */
export function ProductCard({ producto }: { producto: Producto }) {
  const { agregar } = useCarrito()
  const ruta = `/tienda/${producto.slug}`

  return (
    <article className="nv-card flex flex-col overflow-hidden rounded-lg border border-nv-line1 bg-nv-surface">
      <Link to={ruta} className="relative block" tabIndex={-1} aria-hidden="true">
        <ProductoImagen producto={producto} className="aspect-square w-full" />
        {producto.insignia && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-nv-surface px-2.5 py-[5px] text-[10px] uppercase tracking-[0.12em] text-nv-accent sm:left-3 sm:top-3">
            {ETIQUETA_INSIGNIA[producto.insignia]}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-3 sm:px-4 sm:pb-4 sm:pt-[15px]">
        <p className="text-[10px] uppercase tracking-[0.15em] text-nv-accent">
          {etiquetaCategoria(producto.categoria)}
        </p>
        <h3 className="font-serif text-base leading-[1.25] text-nv-ink sm:text-lg">
          <Link to={ruta} className="hover:text-nv-accent">
            {producto.nombre}
          </Link>
        </h3>
        <p className="text-xs text-nv-soft1">{producto.tamano}</p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 pt-3">
          <Precio precio={producto.precio} precioAnterior={producto.precioAnterior} />
          <button
            type="button"
            onClick={() => agregar(producto.slug)}
            aria-label={`Agregar ${producto.nombre} al carrito`}
            className="flex-none rounded-full border border-nv-line3 px-[15px] py-2 text-[12.5px] text-nv-ink transition-colors hover:border-nv-ink hover:bg-nv-ink hover:text-nv-bg"
          >
            Agregar
          </button>
        </div>
      </div>
    </article>
  )
}
