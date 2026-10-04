import { Link } from 'react-router-dom'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { useIniciarReserva } from '@/modules/reservas/ui/useIniciarReserva'
import { useToast } from '@/shared/state/Toast'
import { boton } from '@/shared/ui/nv-estilos'
import { DESCUENTO_COMBO } from '@/modules/pedidos/domain/pedido.reglas'
import { SLUG_KIT_COMBO } from '../domain/combo'
import { useCatalogo } from './useCatalogo'
import { ProductoImagen } from './ProductoImagen'

/**
 * Banner "Ritual de manos completo" (spec §7).
 *
 * Si el kit no esta en el catalogo (dado de baja, o la migracion sin aplicar)
 * el banner no se muestra: ofrecer un combo que no se puede agregar seria peor
 * que no ofrecerlo.
 */
export function ComboBanner() {
  const { porSlug } = useCatalogo()
  const { agregar, preferirEntregaEnCita } = useCarrito()
  const iniciarReserva = useIniciarReserva()
  const { toast } = useToast()
  const kit = porSlug(SLUG_KIT_COMBO)

  if (!kit) return null

  function reservarYAgregar() {
    if (!kit) return
    // No abre el drawer: la persona va camino a reservar.
    agregar(kit.slug, 1, { abrir: false })
    preferirEntregaEnCita(true)
    toast({ title: 'Kit agregado: lo entregamos en tu cita.' })
    iniciarReserva(kit.servicioId)
  }

  return (
    <section className="mb-7 grid overflow-hidden rounded-lg bg-nv-ink md:grid-cols-2">
      <div className="px-6 py-8 sm:px-11 sm:py-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-nv-accent-mid">Servicio + producto</p>
        <h2 className="mt-3 font-serif text-[28px] font-light leading-tight text-nv-bg sm:text-[34px]">
          Ritual de manos completo
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-nv-faint2">
          Reserva tu manicure y agrega el {kit.nombre} con {Math.round(DESCUENTO_COMBO * 100)}% de
          descuento. Te lo entregamos en tu cita.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reservarYAgregar}
            className={`${boton.claroSobreOscuro} px-6 py-3 text-[13.5px]`}
          >
            Reservar y agregar kit
          </button>
          <Link
            to={`/tienda/${kit.slug}`}
            className={`${boton.bordeSobreOscuro} px-6 py-3 text-[13.5px]`}
          >
            Ver el kit
          </Link>
        </div>
      </div>
      {kit.imagenUrl ? (
        <ProductoImagen producto={kit} className="min-h-[220px] md:min-h-[260px]" />
      ) : (
        <div className="placeholder-stripes-dark flex min-h-[200px] items-center justify-center md:min-h-[260px]">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-nv-soft2">
            kit · manos en casa
          </span>
        </div>
      )}
    </section>
  )
}
