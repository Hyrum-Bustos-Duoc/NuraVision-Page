import { etiquetaImagen } from '../domain/producto.reglas'
import type { Producto } from '../domain/producto.types'

/**
 * Foto del producto o, mientras no exista, el rayado diagonal con su etiqueta
 * (spec §2.3). La proporcion la pone quien lo usa: 1:1 en tarjeta, 4:5 en el
 * detalle.
 */
export function ProductoImagen({
  producto,
  className = '',
  conEtiqueta = true,
}: {
  producto: Pick<Producto, 'nombre' | 'imagenUrl'>
  className?: string
  /** Las miniaturas del carrito no tienen espacio para la etiqueta. */
  conEtiqueta?: boolean
}) {
  if (producto.imagenUrl) {
    return (
      <div className={`overflow-hidden bg-nv-tint2 ${className}`}>
        <img
          src={producto.imagenUrl}
          alt={producto.nombre}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={producto.nombre}
      className={`placeholder-stripes flex items-center justify-center ${className}`}
    >
      {conEtiqueta && (
        <span className="px-3 text-center font-mono text-[9.5px] uppercase tracking-[0.1em] text-nv-soft3">
          {etiquetaImagen(producto)}
        </span>
      )}
    </div>
  )
}
