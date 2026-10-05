import { formatPrice } from '@/shared/lib/format'

/** Precio con el anterior tachado, si lo hay. */
export function Precio({
  precio,
  precioAnterior,
  className = 'text-[15px]',
  claseAnterior = 'text-xs',
}: {
  precio: number
  precioAnterior: number | null
  className?: string
  claseAnterior?: string
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={`text-nv-ink ${className}`}>{formatPrice(precio)}</span>
      {precioAnterior !== null && (
        <s className={`text-nv-faint1 ${claseAnterior}`}>
          <span className="sr-only">Antes </span>
          {formatPrice(precioAnterior)}
        </s>
      )}
    </span>
  )
}
