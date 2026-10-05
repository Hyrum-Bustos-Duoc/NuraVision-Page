import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { formatPrice } from '@/shared/lib/format'
import { ESTADOS_PEDIDO, ETIQUETA_ENTREGA, ETIQUETA_ESTADO, ETIQUETA_PAGO } from '../application'
import type { EstadoPedido } from '../domain/pedido.types'
import { usePedidosGestion } from './usePedidosGestion'

const TODOS = 'todos'

const fecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Pedidos de la tienda (panel de administracion).
 *
 * Igual que en reservas, `esStaff` es solo una pista para la interfaz: quien
 * decide que se ve y que se puede cambiar es la RLS de 0013.
 */
export default function AdminPedidos() {
  const { usuario, cargando: cargandoSesion } = useAuth()
  const esStaff = usuario?.esStaff ?? false
  const gestion = usePedidosGestion(esStaff)
  const [estado, setEstado] = useState<EstadoPedido | typeof TODOS>(TODOS)
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return gestion.pedidos.filter(
      (p) =>
        (estado === TODOS || p.estado === estado) &&
        (!termino ||
          p.codigo.toLowerCase().includes(termino) ||
          p.clienteNombre.toLowerCase().includes(termino) ||
          p.clienteEmail.toLowerCase().includes(termino)),
    )
  }, [gestion.pedidos, estado, busqueda])

  if (cargandoSesion) return <Aviso texto="Comprobando tu sesión…" />
  if (!usuario || !esStaff) {
    return (
      <Aviso texto="Esta sección es del personal del estudio. Inicia sesión con una cuenta marcada como personal (es_staff).">
        <Link to="/login" className="mt-4 inline-block text-sm text-ink underline underline-offset-4">
          Ir a iniciar sesión
        </Link>
      </Aviso>
    )
  }

  const porPreparar = gestion.pedidos.filter((p) => p.estado === 'pagado' || p.estado === 'pendiente_pago').length

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="font-serif-display text-4xl text-ink">Pedidos</h1>
      <p className="mt-2 text-sm text-muted">
        Compras de la tienda, leídas de la base de datos.
        {porPreparar > 0 && (
          <>
            {' '}
            Hay <strong className="text-ink">{porPreparar}</strong> por cobrar o preparar.
          </>
        )}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código, nombre o correo…"
          className="w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none focus:border-ink sm:w-72"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoPedido | typeof TODOS)}
          aria-label="Filtrar por estado"
          className="rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink"
        >
          <option value={TODOS}>Todos los estados</option>
          {ESTADOS_PEDIDO.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={gestion.recargar}
          className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:bg-ivory"
        >
          Actualizar
        </button>
      </div>

      {gestion.errorEstado && (
        <p role="alert" className="mt-6 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
          {gestion.errorEstado}
        </p>
      )}

      {gestion.cargando && <Vacio texto="Cargando pedidos…" />}
      {!gestion.cargando && gestion.error && <Vacio texto={gestion.error} />}
      {!gestion.cargando && !gestion.error && visibles.length === 0 && (
        <Vacio texto={gestion.pedidos.length === 0 ? 'Todavía no hay pedidos.' : 'Ningún pedido coincide con el filtro.'} />
      )}

      <ul className="mt-6 space-y-3">
        {visibles.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line-soft bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{p.codigo}</p>
                <p className="mt-1 font-medium text-ink">{p.clienteNombre}</p>
                <p className="text-sm text-muted">
                  {p.clienteEmail} · {fecha.format(new Date(p.creadoEn))}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-serif-display text-2xl text-ink">{formatPrice(p.total)}</span>
                <select
                  value={p.estado}
                  disabled={gestion.actualizando === p.id}
                  onChange={(e) => void gestion.cambiarEstado(p.id, e.target.value as EstadoPedido)}
                  aria-label={`Estado del pedido ${p.codigo}`}
                  className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink disabled:opacity-50"
                >
                  {ESTADOS_PEDIDO.map((e) => (
                    <option key={e} value={e}>
                      {ETIQUETA_ESTADO[e]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 border-t border-line-soft pt-4 text-sm sm:grid-cols-[1.4fr_1fr]">
              <ul className="space-y-1 text-ink">
                {p.items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3">
                    <span>
                      {i.cantidad} × {i.nombre}
                    </span>
                    <span className="text-muted">{formatPrice(i.precioUnitario * i.cantidad)}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 text-muted">
                <div>
                  <dt className="inline text-ink">{ETIQUETA_ENTREGA[p.entrega]}</dt>
                  {p.entrega === 'despacho' && (
                    <dd className="inline">
                      {' '}
                      · {p.direccion}, {p.comuna}
                    </dd>
                  )}
                  {p.entrega === 'cita' && p.reservaId && <dd className="inline"> · reserva #{p.reservaId}</dd>}
                </div>
                <div>Pago: {ETIQUETA_PAGO[p.metodoPago]}</div>
                <div>
                  Subtotal {formatPrice(p.subtotal)} · Envío {p.costoEnvio ? formatPrice(p.costoEnvio) : 'gratis'}
                  {p.descuento > 0 && ` · Descuento −${formatPrice(p.descuento)}`}
                </div>
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Aviso({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <p className="text-sm text-muted">{texto}</p>
      {children}
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">{texto}</p>
  )
}
