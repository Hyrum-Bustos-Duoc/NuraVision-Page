import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { useIniciarReserva } from '@/modules/reservas/ui/useIniciarReserva'
import { ProductoImagen } from '@/modules/tienda/ui/ProductoImagen'
import { useScrollToTopOnChange } from '@/shared/components/ScrollToTop'
import { formatPrice } from '@/shared/lib/format'
import { useToast } from '@/shared/state/Toast'
import { boton } from '@/shared/ui/nv-estilos'
import {
  calcularTotales,
  COSTO_DESPACHO,
  erroresDeEntrega,
  metodoPermitido,
  UMBRAL_DESPACHO_GRATIS,
  type EntregaPedido,
  type MetodoPagoPedido,
  type PedidoCreado,
} from '../application'
import { useCrearPedido } from './useCrearPedido'
import { useProximasCitas, type CitaProxima } from './useProximasCitas'

type Paso = 1 | 2 | 3

interface Confirmado {
  pedido: PedidoCreado
  entrega: EntregaPedido
  cita: CitaProxima | null
}

/** Checkout en tres pasos (spec §10). */
export default function Checkout() {
  const { usuario } = useAuth()
  const carrito = useCarrito()
  const { toast } = useToast()
  const pedido = useCrearPedido()
  const { citas, cargando: cargandoCitas } = useProximasCitas(usuario?.id ?? null)

  const [paso, setPaso] = useState<Paso>(1)
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null)
  // `null` = la persona no ha elegido: rige el valor por defecto, que depende
  // de si tiene citas (y estas llegan despues del primer render).
  const [entregaElegida, setEntregaElegida] = useState<EntregaPedido | null>(null)
  const [pagoElegido, setPagoElegido] = useState<MetodoPagoPedido>('webpay')
  // `null` = sin tocar: se muestra lo de la cuenta. Asi el prellenado funciona
  // aunque la sesion termine de restaurarse despues del primer render.
  const [nombreEscrito, setNombre] = useState<string | null>(null)
  const [emailEscrito, setEmail] = useState<string | null>(null)
  const nombre = nombreEscrito ?? usuario?.nombre ?? ''
  const email = emailEscrito ?? usuario?.email ?? ''
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')
  const [citaElegida, setCitaElegida] = useState<string | null>(null)
  const [intentoContinuar, setIntentoContinuar] = useState(false)

  useScrollToTopOnChange(paso)

  const hayCitas = citas.length > 0
  const entrega: EntregaPedido =
    entregaElegida === 'cita' && !hayCitas
      ? 'despacho'
      : (entregaElegida ?? (carrito.prefiereEntregaEnCita && hayCitas ? 'cita' : 'despacho'))
  // Con una sola cita no hace falta elegirla.
  const cita = entrega === 'cita' ? (citas.find((c) => c.id === citaElegida) ?? citas[0] ?? null) : null
  const pago: MetodoPagoPedido = metodoPermitido(pagoElegido, entrega) ? pagoElegido : 'webpay'

  const lineas = carrito.items.map((i) => ({
    categoria: i.producto.categoria,
    servicioId: i.producto.servicioId,
    precio: i.producto.precio,
    cantidad: i.cantidad,
  }))
  const totales = calcularTotales(lineas, entrega, cita?.servicioId ?? null)
  const errores = erroresDeEntrega({ nombre, email, entrega, direccion, comuna, reservaId: cita?.id })

  if (confirmado) return <Confirmacion {...confirmado} />

  if (carrito.items.length === 0) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-24 text-center">
        <h1 className="font-serif text-4xl font-light text-nv-ink">Tu carrito está vacío</h1>
        <p className="mt-3 text-sm text-nv-muted1">Agrega productos para continuar con la compra.</p>
        <Link to="/tienda" className={`${boton.primario} mt-8 inline-block px-6 py-3 text-[13.5px]`}>
          Ir a la tienda
        </Link>
      </div>
    )
  }

  function continuar() {
    setIntentoContinuar(true)
    if (Object.keys(errores).length === 0) setPaso(2)
  }

  async function pagar() {
    const creado = await pedido.crear({
      items: carrito.lineas,
      nombre,
      email,
      entrega,
      direccion,
      comuna,
      reservaId: cita?.id,
      metodoPago: pago,
    })
    if (!creado) return
    setConfirmado({ pedido: creado, entrega, cita })
    carrito.vaciar()
    setPaso(3)
    toast({ title: 'Pedido registrado', description: `Código ${creado.codigo}` })
  }

  const mostrarError = (campo: keyof typeof errores) => (intentoContinuar ? errores[campo] : undefined)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-10 sm:px-6 sm:pt-[52px] lg:px-10">
      <IndicadorPasos paso={paso} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_0.9fr] lg:gap-11">
        <div>
          {paso === 1 && (
            <>
              <h1 className="font-serif text-[30px] font-light leading-tight tracking-[-0.02em] text-nv-ink sm:text-[38px]">
                ¿Cómo quieres recibirlo?
              </h1>

              <fieldset className="mt-7 space-y-3">
                <legend className="sr-only">Modo de entrega</legend>
                <OpcionRadio
                  nombre="entrega"
                  activa={entrega === 'despacho'}
                  onElegir={() => setEntregaElegida('despacho')}
                  titulo="Despacho a domicilio"
                  detalle="24–72 h hábiles · Viña del Mar y Valparaíso"
                  costo={totales.subtotal >= UMBRAL_DESPACHO_GRATIS ? 'Gratis' : formatPrice(COSTO_DESPACHO)}
                />
                <OpcionRadio
                  nombre="entrega"
                  activa={entrega === 'retiro'}
                  onElegir={() => setEntregaElegida('retiro')}
                  titulo="Retiro en Estudio Nura"
                  detalle="Av. Libertad 1250 · listo en 2 horas"
                  costo="Gratis"
                />
                <OpcionRadio
                  nombre="entrega"
                  activa={entrega === 'cita'}
                  deshabilitada={!hayCitas}
                  onElegir={() => setEntregaElegida('cita')}
                  titulo="Entrega en tu próxima cita"
                  detalle={detalleCita(usuario !== null, cargandoCitas, citas)}
                  costo="Gratis"
                />
              </fieldset>

              {!usuario && (
                <p className="mt-3 text-[12.5px] text-nv-soft1">
                  ¿Tienes una reserva?{' '}
                  <Link to="/login?volver=/checkout" className="text-nv-accent underline underline-offset-4">
                    Inicia sesión
                  </Link>{' '}
                  para recibirlo en tu cita.
                </p>
              )}

              {entrega === 'cita' && citas.length > 1 && (
                <Campo etiqueta="¿En qué cita?" error={mostrarError('reserva')} className="mt-5">
                  <select
                    value={cita?.id ?? ''}
                    onChange={(e) => setCitaElegida(e.target.value)}
                    className={claseInput}
                  >
                    {citas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}

              <Seccion titulo="Contacto">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Nombre" error={mostrarError('nombre')}>
                    <input
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      autoComplete="name"
                      maxLength={120}
                      className={claseInput}
                    />
                  </Campo>
                  <Campo etiqueta="Correo" error={mostrarError('email')}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      maxLength={254}
                      className={claseInput}
                    />
                  </Campo>
                </div>
              </Seccion>

              {entrega === 'despacho' && (
                <Seccion titulo="Dirección de despacho">
                  <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                    <Campo etiqueta="Calle y número" error={mostrarError('direccion')}>
                      <input
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        autoComplete="street-address"
                        maxLength={300}
                        className={claseInput}
                      />
                    </Campo>
                    <Campo etiqueta="Comuna" error={mostrarError('comuna')}>
                      <input
                        value={comuna}
                        onChange={(e) => setComuna(e.target.value)}
                        list="comunas-con-despacho"
                        autoComplete="address-level2"
                        maxLength={80}
                        className={claseInput}
                      />
                      <datalist id="comunas-con-despacho">
                        <option value="Viña del Mar" />
                        <option value="Valparaíso" />
                      </datalist>
                    </Campo>
                  </div>
                </Seccion>
              )}

              <button
                type="button"
                onClick={continuar}
                className={`${boton.primario} mt-8 w-full px-[30px] py-[15px] text-[14.5px] sm:w-auto`}
              >
                Continuar al pago
              </button>
            </>
          )}

          {paso === 2 && (
            <>
              <button
                type="button"
                onClick={() => setPaso(1)}
                className="text-[12.5px] text-nv-soft1 hover:text-nv-ink"
              >
                ← Entrega
              </button>
              <h1 className="mt-3 font-serif text-[30px] font-light leading-tight tracking-[-0.02em] text-nv-ink sm:text-[38px]">
                Pago
              </h1>

              <fieldset className="mt-7 space-y-3">
                <legend className="sr-only">Medio de pago</legend>
                <OpcionRadio
                  nombre="pago"
                  activa={pago === 'webpay'}
                  onElegir={() => setPagoElegido('webpay')}
                  titulo="Webpay"
                  detalle="Tarjeta de débito, crédito o prepago"
                />
                <OpcionRadio
                  nombre="pago"
                  activa={pago === 'transferencia'}
                  onElegir={() => setPagoElegido('transferencia')}
                  titulo="Transferencia bancaria"
                  detalle="Confirmamos tu pedido al recibir el pago"
                />
                <OpcionRadio
                  nombre="pago"
                  activa={pago === 'estudio'}
                  deshabilitada={!metodoPermitido('estudio', entrega)}
                  onElegir={() => setPagoElegido('estudio')}
                  titulo="Pagar en el estudio"
                  detalle="Solo para retiro o entrega en tu cita"
                />
              </fieldset>

              {pedido.error && (
                <p
                  role="alert"
                  className="mt-6 rounded-lg border border-nv-error-line bg-nv-error-bg px-4 py-3 text-sm text-nv-error"
                >
                  {pedido.error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void pagar()}
                disabled={pedido.enviando}
                className={`${boton.acento} mt-8 w-full px-8 py-[15px] text-[14.5px] sm:w-auto`}
              >
                {pedido.enviando ? 'Procesando…' : `Pagar ${formatPrice(totales.total)}`}
              </button>
              <p className="mt-4 max-w-lg text-xs leading-relaxed text-nv-soft1">{NOTA_PAGO[pago]}</p>
            </>
          )}
        </div>

        <ResumenPedido
          entrega={entrega}
          subtotal={totales.subtotal}
          envio={totales.envio}
          descuento={totales.descuento}
          total={totales.total}
        />
      </div>
    </div>
  )
}

/**
 * Lo que se dice bajo el boton de pagar, segun el medio.
 *
 * La integracion con Webpay todavia no existe (necesita las credenciales de
 * Transbank). Prometer una redireccion que no ocurre seria mentir en el peor
 * momento posible, asi que se dice lo que de verdad pasa.
 */
const NOTA_PAGO: Record<MetodoPagoPedido, string> = {
  webpay:
    'Registraremos tu pedido y te enviaremos el enlace de pago por correo. El pago en línea con Webpay se habilitará pronto.',
  transferencia: 'Te enviaremos los datos para transferir. Confirmamos el pedido al recibir el pago.',
  estudio: 'Pagas al retirar o en tu cita. Te avisaremos cuando esté listo.',
}

function detalleCita(conSesion: boolean, cargando: boolean, citas: CitaProxima[]): string {
  if (!conSesion) return 'Disponible con tu cuenta y una reserva próxima'
  if (cargando) return 'Buscando tus reservas…'
  if (citas.length === 0) return 'No tienes reservas próximas'
  if (citas.length === 1) return citas[0].etiqueta
  return `${citas.length} reservas próximas`
}

const claseInput =
  'w-full rounded-lg border border-nv-line2 bg-nv-surface px-3.5 py-3 text-sm text-nv-ink outline-none transition-colors focus:border-nv-ink'

function IndicadorPasos({ paso }: { paso: Paso }) {
  const pasos = ['Entrega', 'Pago', 'Confirmación']
  return (
    <ol className="flex flex-wrap gap-x-[26px] gap-y-1 text-[13px]">
      {pasos.map((nombre, i) => {
        const n = i + 1
        const clase = n === paso ? 'font-semibold text-nv-ink' : n < paso ? 'text-nv-muted1' : 'text-nv-faint2'
        return (
          <li key={nombre} className={clase} aria-current={n === paso ? 'step' : undefined}>
            {n} · {nombre}
          </li>
        )
      })}
    </ol>
  )
}

function OpcionRadio({
  nombre,
  activa,
  deshabilitada = false,
  onElegir,
  titulo,
  detalle,
  costo,
}: {
  nombre: string
  activa: boolean
  deshabilitada?: boolean
  onElegir: () => void
  titulo: string
  detalle: string
  costo?: string
}) {
  return (
    <label
      className={`flex items-center gap-3.5 rounded-[10px] border px-4 py-4 transition-colors sm:px-[18px] ${
        activa ? 'border-nv-accent bg-nv-accent-wash4' : 'border-nv-line2 bg-nv-surface'
      } ${deshabilitada ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-nv-line3'}`}
    >
      <input
        type="radio"
        name={nombre}
        checked={activa}
        disabled={deshabilitada}
        onChange={onElegir}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 rounded-full ${activa ? 'border-[5px] border-nv-accent' : 'border-[1.5px] border-nv-line7'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] text-nv-ink">{titulo}</span>
        <span className="block text-[12.5px] text-nv-soft1">{detalle}</span>
      </span>
      {costo && <span className="shrink-0 text-sm text-nv-ink">{costo}</span>}
    </label>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-[11px] uppercase tracking-[0.16em] text-nv-soft1">{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({
  etiqueta,
  error,
  className = '',
  children,
}: {
  etiqueta: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs text-nv-soft1">{etiqueta}</span>
      {children}
      {error && (
        <span role="alert" className="mt-1.5 block text-xs text-nv-error">
          {error}
        </span>
      )}
    </label>
  )
}

const ETIQUETA_LINEA_ENTREGA: Record<EntregaPedido, string> = {
  despacho: 'Despacho',
  retiro: 'Retiro en estudio',
  cita: 'Entrega en cita',
}

function ResumenPedido({
  entrega,
  subtotal,
  envio,
  descuento,
  total,
}: {
  entrega: EntregaPedido
  subtotal: number
  envio: number
  descuento: number
  total: number
}) {
  const { items } = useCarrito()
  return (
    <aside className="h-fit rounded-[10px] border border-nv-line1 bg-nv-surface p-5 sm:p-[22px] lg:sticky lg:top-[100px]">
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-nv-soft1">Tu pedido</h2>
      <ul className="mt-4 space-y-3 border-b border-nv-line1 pb-4">
        {items.map(({ producto, cantidad, total: totalLinea }) => (
          <li key={producto.slug} className="flex items-center gap-3.5">
            <ProductoImagen producto={producto} conEtiqueta={false} className="h-[52px] w-[52px] shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] text-nv-ink">{producto.nombre}</p>
              <p className="text-xs text-nv-soft1">Cantidad {cantidad}</p>
            </div>
            <span className="text-[13.5px] text-nv-ink">{formatPrice(totalLinea)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 pt-4 text-sm">
        <div className="flex justify-between text-nv-muted1">
          <dt>Subtotal</dt>
          <dd className="text-nv-ink">{formatPrice(subtotal)}</dd>
        </div>
        <div className="flex justify-between text-nv-muted1">
          <dt>{ETIQUETA_LINEA_ENTREGA[entrega]}</dt>
          <dd className="text-nv-ink">{envio > 0 ? formatPrice(envio) : 'Gratis'}</dd>
        </div>
        {descuento > 0 && (
          <div className="flex justify-between text-nv-muted1">
            <dt>Descuento combo</dt>
            <dd className="text-nv-accent">−{formatPrice(descuento)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-nv-line1 pt-3 text-base text-nv-ink">
          <dt>Total</dt>
          <dd>{formatPrice(total)}</dd>
        </div>
      </dl>
    </aside>
  )
}

const MENSAJE_ENTREGA: Record<EntregaPedido, string> = {
  despacho: 'Te avisaremos por correo cuando tu pedido salga a despacho.',
  retiro: 'Te avisaremos por correo cuando esté listo para retirar en el estudio.',
  cita: 'Lo tendremos listo para tu cita.',
}

function Confirmacion({ pedido, entrega, cita }: Confirmado) {
  const iniciarReserva = useIniciarReserva()
  const mensaje =
    entrega === 'cita' && cita ? `Lo tendremos listo para tu cita del ${cita.fechaLarga}.` : MENSAJE_ENTREGA[entrega]

  return (
    <div className="mx-auto max-w-[560px] px-4 py-16 text-center sm:py-24">
      <span className="mx-auto flex h-[58px] w-[58px] items-center justify-center rounded-full bg-nv-accent-wash4 text-nv-accent">
        <Check className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <h1 className="mt-6 font-serif text-[34px] font-light tracking-[-0.02em] text-nv-ink sm:text-[42px]">
        Pedido confirmado
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-nv-muted1">{mensaje}</p>
      {/* El total es el que devolvio la base, no el calculado en el navegador. */}
      <p className="mt-6 font-mono text-[12.5px] uppercase tracking-[0.1em] text-nv-soft1">
        Pedido {pedido.codigo} · {formatPrice(pedido.total)}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/tienda" className={`${boton.secundario} px-6 py-3 text-[13.5px]`}>
          Seguir comprando
        </Link>
        <button
          type="button"
          onClick={() => iniciarReserva()}
          className={`${boton.primario} px-6 py-3 text-[13.5px]`}
        >
          Reservar un servicio
        </button>
      </div>
    </div>
  )
}
