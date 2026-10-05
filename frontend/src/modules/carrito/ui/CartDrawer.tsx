import { Link, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { ProductoImagen } from '@/modules/tienda/ui/ProductoImagen'
import { avanceDespachoGratis, faltaParaDespachoGratis } from '@/modules/pedidos/domain/despacho'
import { formatPrice } from '@/shared/lib/format'
import { QuantityStepper } from '@/shared/ui/QuantityStepper'
import { useCapaFlotante } from '@/shared/ui/useCapaFlotante'
import { useCarrito } from './useCarrito'

/** Drawer lateral del carrito (spec §9). */
export function CartDrawer() {
  const { abierto, cerrar, items, unidades, subtotal, cambiarCantidad, quitar } = useCarrito()
  const navigate = useNavigate()
  const cerrarRef = useCapaFlotante<HTMLButtonElement>(abierto, cerrar, { bloquearScroll: true })

  if (!abierto) return null

  const falta = faltaParaDespachoGratis(subtotal)
  const vacio = items.length === 0

  function irA(ruta: string) {
    cerrar()
    navigate(ruta)
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={cerrar}
        className="animate-nv-fade fixed inset-0 z-[80] bg-[rgba(35,32,28,0.32)]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Tu carrito"
        className="animate-nv-slide fixed inset-y-0 right-0 z-[81] flex h-dvh w-[420px] max-w-full flex-col bg-nv-bg shadow-drawer"
      >
        <header className="flex items-center justify-between border-b border-nv-line1 px-5 py-5 sm:px-[26px]">
          <h2 className="font-serif text-2xl text-nv-ink">
            Tu carrito <span className="text-[15px] text-nv-soft1">({unidades})</span>
          </h2>
          <button
            ref={cerrarRef}
            type="button"
            onClick={cerrar}
            aria-label="Cerrar carrito"
            className="rounded-full p-1.5 text-nv-ink transition-colors hover:bg-nv-paper4"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>

        {vacio ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <p className="font-serif text-[22px] text-nv-ink">Tu carrito está vacío</p>
            <p className="mt-2 text-sm text-nv-soft1">Explora los productos que usamos en el estudio.</p>
            <button
              type="button"
              onClick={() => irA('/tienda')}
              className="mt-6 rounded-full bg-nv-ink px-5 py-3 text-[13.5px] text-nv-bg transition-colors hover:bg-nv-accent"
            >
              Ir a la tienda
            </button>
          </div>
        ) : (
          <>
            <div className="bg-nv-paper2 px-5 py-4 sm:px-[26px]">
              <p className="text-[12.5px] text-nv-ink" aria-live="polite">
                {falta > 0
                  ? `Te faltan ${formatPrice(falta)} para despacho gratis.`
                  : 'Tu pedido tiene despacho gratis.'}
              </p>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-nv-line2">
                <div
                  className="h-full rounded-full bg-nv-accent transition-[width] duration-[400ms] ease-out"
                  style={{ width: `${avanceDespachoGratis(subtotal) * 100}%` }}
                />
              </div>
            </div>

            <ul className="flex-1 overflow-y-auto px-5 sm:px-[26px]">
              {items.map(({ producto, cantidad, total }) => (
                <li key={producto.slug} className="flex gap-4 border-b border-nv-line1 py-[18px]">
                  <Link
                    to={`/tienda/${producto.slug}`}
                    onClick={cerrar}
                    className="block shrink-0"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <ProductoImagen
                      producto={producto}
                      conEtiqueta={false}
                      className="h-[76px] w-[76px] rounded-md"
                    />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/tienda/${producto.slug}`}
                        onClick={cerrar}
                        className="font-serif text-[16.5px] leading-snug text-nv-ink hover:text-nv-accent"
                      >
                        {producto.nombre}
                      </Link>
                      <span className="shrink-0 text-sm text-nv-ink">{formatPrice(total)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-nv-soft1">{producto.tamano}</p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <QuantityStepper
                        value={cantidad}
                        min={0}
                        label={producto.nombre}
                        onChange={(n) => cambiarCantidad(producto.slug, n)}
                      />
                      <button
                        type="button"
                        onClick={() => quitar(producto.slug)}
                        className="border-b border-nv-line3 text-xs text-nv-soft1 transition-colors hover:text-nv-ink"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              <li className="my-6 rounded-lg border border-dashed border-nv-line7 px-5 py-4">
                <p className="text-sm text-nv-ink">¿Tienes una reserva?</p>
                <p className="mt-1 text-[12.5px] text-nv-soft1">
                  Elige “Entrega en tu cita” al pagar y te lo dejamos listo.
                </p>
              </li>
            </ul>

            <footer className="border-t border-nv-line1 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-[26px]">
              <div className="flex items-baseline justify-between">
                <span className="text-base text-nv-ink">Subtotal</span>
                <span className="text-base text-nv-ink">{formatPrice(subtotal)}</span>
              </div>
              <p className="mt-1 text-xs text-nv-soft1">Despacho y descuentos se calculan al pagar.</p>
              <button
                type="button"
                onClick={() => irA('/checkout')}
                className="mt-4 w-full rounded-full bg-nv-ink py-3.5 text-[14.5px] text-nv-bg transition-colors hover:bg-nv-accent"
              >
                Ir a pagar
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  )
}
