import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { useIniciarReserva } from '@/modules/reservas/ui/useIniciarReserva'
import { useServicioDetalle } from '@/modules/servicios/ui/useServicioDetalle'
import { fotoDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { etiquetaDePrecio } from '@/modules/servicios/ui/precio'
import { COSTO_DESPACHO, UMBRAL_DESPACHO_GRATIS } from '@/modules/pedidos/domain/despacho'
import { useScrollToTopOnChange } from '@/shared/components/ScrollToTop'
import { formatPrice } from '@/shared/lib/format'
import { QuantityStepper } from '@/shared/ui/QuantityStepper'
import { boton, contenedor } from '@/shared/ui/nv-estilos'
import { AppImage } from '@/shared/ui/ui'
import { etiquetaCategoria } from '../domain/categorias'
import { productosRelacionados } from '../domain/producto.reglas'
import type { Producto } from '../domain/producto.types'
import { Precio } from './Precio'
import { ProductGrid } from './ProductGrid'
import { ProductoImagen } from './ProductoImagen'
import { useCatalogo } from './useCatalogo'

/** Detalle de producto (spec §8). */
export default function DetalleProducto() {
  const { slug = '' } = useParams()
  const { productos, cargando, error, porSlug } = useCatalogo()
  const producto = porSlug(slug)

  useScrollToTopOnChange(slug)

  if (cargando) {
    return (
      <div className={`${contenedor} py-12`} aria-busy="true">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-nv-tint2" />
          <div className="space-y-4">
            <div className="h-3 w-24 animate-pulse rounded bg-nv-tint2" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-nv-tint2" />
            <div className="h-6 w-28 animate-pulse rounded bg-nv-tint2" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !producto) {
    return (
      <div className={`${contenedor} py-24 text-center`}>
        <h1 className="font-serif text-4xl font-light text-nv-ink">
          {error ? 'No pudimos cargar la tienda' : 'Este producto no está disponible'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-nv-muted1">
          {error ?? 'Puede que se haya agotado o dado de baja del catálogo.'}
        </p>
        <Link to="/tienda" className={`${boton.primario} mt-8 inline-block px-6 py-3 text-[13.5px]`}>
          Ir a la tienda
        </Link>
      </div>
    )
  }

  // La clave reinicia la cantidad elegida al pasar de un producto a otro.
  return <Detalle key={producto.slug} producto={producto} relacionados={productosRelacionados(producto, productos)} />
}

function Detalle({ producto, relacionados }: { producto: Producto; relacionados: Producto[] }) {
  const { agregar } = useCarrito()
  const navigate = useNavigate()
  const [cantidad, setCantidad] = useState(1)
  const categoria = etiquetaCategoria(producto.categoria)

  function comprarAhora() {
    // Salta el drawer y va directo al checkout (spec §13, flujo B).
    agregar(producto.slug, cantidad, { abrir: false })
    navigate('/checkout')
  }

  return (
    <div className={`${contenedor} pb-20 pt-8 sm:pt-10`}>
      <nav aria-label="Migas" className="text-[12.5px] text-nv-soft1">
        <Link to="/tienda" className="hover:text-nv-ink">
          ← Tienda
        </Link>{' '}
        /{' '}
        <Link to={`/tienda?categoria=${producto.categoria}`} className="hover:text-nv-ink">
          {categoria}
        </Link>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        {/* Hoy cada producto tiene una sola foto, asi que no hay tira de
            miniaturas: cuatro copias de la misma imagen no ayudan a decidir.
            Cuando exista mas de una, va aqui. */}
        <ProductoImagen producto={producto} className="aspect-[4/5] w-full rounded-md" />

        <div className="lg:sticky lg:top-[100px] lg:self-start">
          <p className="text-[10.5px] uppercase tracking-[0.15em] text-nv-accent">{categoria}</p>
          <h1 className="mt-3 font-serif text-[34px] font-light leading-[1.08] tracking-[-0.02em] text-nv-ink sm:text-[44px]">
            {producto.nombre}
          </h1>
          <p className="mt-2 text-[13.5px] text-nv-soft1">{producto.tamano}</p>
          <p className="mt-5">
            <Precio
              precio={producto.precio}
              precioAnterior={producto.precioAnterior}
              className="text-[26px]"
              claseAnterior="text-[15px]"
            />
          </p>
          <p className="mt-5 text-[15px] leading-[1.65] text-nv-muted1">{producto.descripcion}</p>

          <div className="mt-7 flex items-center gap-3">
            <QuantityStepper
              value={cantidad}
              onChange={setCantidad}
              size="grande"
              label={producto.nombre}
            />
            <button
              type="button"
              onClick={() => agregar(producto.slug, cantidad)}
              className={`${boton.primario} min-h-12 flex-1 px-5 text-[14px] sm:text-[14.5px]`}
            >
              Agregar al carrito · {formatPrice(producto.precio * cantidad)}
            </button>
          </div>
          <button
            type="button"
            onClick={comprarAhora}
            className={`${boton.secundario} mt-3 w-full px-5 py-3 text-[14px] sm:w-auto`}
          >
            Comprar ahora
          </button>

          <dl className="mt-8 border-t border-nv-line1">
            <FilaInfo
              titulo="Despacho a domicilio"
              detalle={`24–72 h · gratis sobre ${formatPrice(UMBRAL_DESPACHO_GRATIS)}`}
              ayuda={`${formatPrice(COSTO_DESPACHO)} bajo ese monto`}
            />
            <FilaInfo titulo="Retiro en Estudio Nura" detalle="Listo en 2 h · gratis" />
            {producto.modoUso && <Bloque titulo="Cómo usar" texto={producto.modoUso} />}
            {producto.ingredientes && <Bloque titulo="Ingredientes clave" texto={producto.ingredientes} />}
          </dl>

          {producto.servicioId && <ServicioVinculado servicioId={producto.servicioId} />}
        </div>
      </div>

      {relacionados.length > 0 && (
        <section className="mt-16 sm:mt-20">
          <h2 className="font-serif text-[26px] font-light text-nv-ink sm:text-[30px]">Combina bien con</h2>
          <div className="mt-6">
            <ProductGrid productos={relacionados} />
          </div>
        </section>
      )}
    </div>
  )
}

function FilaInfo({ titulo, detalle, ayuda }: { titulo: string; detalle: string; ayuda?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-nv-line1 py-4">
      <dt className="text-sm text-nv-ink">{titulo}</dt>
      <dd className="text-[13px] text-nv-soft1" title={ayuda}>
        {detalle}
      </dd>
    </div>
  )
}

function Bloque({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="border-b border-nv-line1 py-4">
      <dt className="text-[10.5px] uppercase tracking-[0.14em] text-nv-soft1">{titulo}</dt>
      <dd className="mt-1.5 text-[13.5px] leading-[1.6] text-nv-ink4">{texto}</dd>
    </div>
  )
}

/**
 * Caja "Lo usamos en" (spec §8). Lee el servicio de la base: si no carga o ya no
 * existe, la caja no aparece. No es informacion imprescindible para comprar.
 */
function ServicioVinculado({ servicioId }: { servicioId: string }) {
  const estado = useServicioDetalle(servicioId)
  const iniciarReserva = useIniciarReserva()

  if (estado.estado !== 'listo' || !estado.servicio.activo) return null
  const servicio = estado.servicio

  return (
    <div className="mt-6 flex items-center gap-4 rounded-lg bg-nv-paper2 p-4">
      <AppImage
        src={fotoDeServicio(servicio)}
        alt={servicio.nombre}
        className="h-14 w-14 shrink-0 rounded-md"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-nv-accent">Lo usamos en</p>
        <p className="font-serif text-[17px] leading-snug text-nv-ink">{servicio.nombre}</p>
        <p className="text-xs text-nv-soft1">
          {servicio.duracionMinutos} min · {etiquetaDePrecio(servicio)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => iniciarReserva(servicio.id)}
        className={`${boton.primario} shrink-0 px-4 py-2 text-[12.5px]`}
      >
        Reservar
      </button>
    </div>
  )
}
