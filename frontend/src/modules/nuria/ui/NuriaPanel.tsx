import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, X } from 'lucide-react'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { ProductoImagen } from '@/modules/tienda/ui/ProductoImagen'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import { formatPrice } from '@/shared/lib/format'
import { useCapaFlotante } from '@/shared/ui/useCapaFlotante'
import type { AccionNuria, Mensaje, MensajeNuria } from '../domain/nuria.types'
import { NuriaAvatar } from './NuriaAvatar'
import { TarjetaServicioNuria } from './TarjetaServicioNuria'
import { useNuria } from './useNuria'

const ETIQUETA_ACCION: Record<AccionNuria, string> = {
  'ver-carrito': 'Ver carrito →',
  'ir-a-pagar': 'Ir a pagar →',
  'ver-reservas': 'Ver mis reservas →',
  'confirmar-reserva': 'Confirmar reserva →',
  'ver-servicios': 'Ver servicios →',
}

/** Panel de chat de Nuria (spec §12.2). En movil ocupa la pantalla completa. */
export function NuriaPanel() {
  const nuria = useNuria()
  const { abrir: abrirCarrito } = useCarrito()
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const lista = useRef<HTMLDivElement>(null)
  const entrada = useCapaFlotante<HTMLInputElement>(nuria.abierto, nuria.cerrar)

  // Auto-scroll al final con cada mensaje, con "escribiendo" y al abrir.
  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [nuria.mensajes.length, nuria.escribiendo, nuria.abierto])

  if (!nuria.abierto) return null

  const ultimo = nuria.mensajes[nuria.mensajes.length - 1]
  const chips = !nuria.escribiendo && ultimo?.de === 'nuria' ? (ultimo.chips ?? []) : []

  function enviar() {
    nuria.enviar(texto)
    setTexto('')
  }

  function ejecutar(accion: AccionNuria) {
    nuria.cerrar()
    if (accion === 'ver-carrito') abrirCarrito()
    if (accion === 'ir-a-pagar') navigate('/checkout')
    if (accion === 'ver-reservas') navigate('/mis-reservas')
    if (accion === 'confirmar-reserva') navigate('/reservar')
    if (accion === 'ver-servicios') navigate('/servicios')
  }

  function elegirChip(chip: string) {
    if (chip === 'No, gracias') nuria.declinar()
    else nuria.enviar(chip)
  }

  return (
    <section
      role="dialog"
      aria-label="Nuria, asistente de compras y reservas"
      className="animate-nv-pop fixed inset-0 z-[97] flex flex-col overflow-hidden bg-nv-bg sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(660px,calc(100dvh-40px))] sm:w-[410px] sm:rounded-[18px] sm:border sm:border-nv-line2 sm:shadow-panel"
    >
      <header className="flex items-center gap-3 bg-nv-ink px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-nv-bg">
        <NuriaAvatar tamano={38} enLinea />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[21px] leading-none">Nuria</p>
          <p className="mt-1 text-[11.5px] leading-snug text-nv-soft2">Asistente de compras y reservas · en línea</p>
        </div>
        <button
          type="button"
          onClick={nuria.reiniciar}
          className="rounded-full px-2.5 py-1.5 text-xs text-nv-faint2 transition-colors hover:bg-nv-ink2 hover:text-nv-bg"
        >
          Reiniciar
        </button>
        <button
          type="button"
          onClick={nuria.cerrar}
          aria-label="Cerrar Nuria"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full transition-colors hover:bg-nv-ink2"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </header>

      <div ref={lista} className="flex-1 space-y-3 overflow-y-auto px-4 py-[18px]" aria-live="polite">
        {nuria.mensajes.map((m) => (
          <Burbuja key={m.id} mensaje={m} onAccion={ejecutar} />
        ))}
        {nuria.escribiendo && (
          <div className="animate-nv-rise inline-flex gap-1.5 rounded-[16px_16px_16px_4px] border border-nv-line1 bg-nv-paper2 px-4 py-3.5">
            <span className="sr-only">Nuria está escribiendo…</span>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                aria-hidden="true"
                className="animate-nv-pulse h-1.5 w-1.5 rounded-full bg-nv-soft1"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => elegirChip(chip)}
                className="rounded-full border border-nv-accent-line2 bg-nv-surface px-3 py-[7px] text-[12.5px] text-nv-accent transition-colors hover:bg-nv-accent-wash4"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-nv-line1 bg-nv-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            enviar()
          }}
          className="flex items-center gap-2 rounded-full border border-nv-line2 bg-nv-bg py-1 pl-4 pr-1"
        >
          <input
            ref={entrada}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe: “quiero una manicure el jueves”"
            aria-label="Mensaje para Nuria"
            // 16px en movil: con menos, iOS hace zoom al enfocar.
            className="min-w-0 flex-1 bg-transparent py-2 text-base text-nv-ink outline-none placeholder:text-nv-faint1 sm:text-[13.5px]"
          />
          <button
            type="submit"
            disabled={!texto.trim()}
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nv-accent text-nv-bg transition-colors hover:bg-nv-accent-dk disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 text-center text-[10.5px] text-nv-faint1">
          Nuria puede equivocarse. Confirmas precio y hora antes de pagar.
        </p>
      </footer>
    </section>
  )
}

function Burbuja({ mensaje, onAccion }: { mensaje: Mensaje; onAccion: (a: AccionNuria) => void }) {
  if (mensaje.de === 'usuaria') {
    return (
      <div className="animate-nv-rise flex justify-end [animation-duration:0.25s]">
        <p className="max-w-[80%] rounded-[16px_16px_4px_16px] bg-nv-ink px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-nv-bg">
          {mensaje.texto}
        </p>
      </div>
    )
  }

  return (
    <div className="animate-nv-rise max-w-[90%] space-y-2 [animation-duration:0.35s]">
      <p className="rounded-[16px_16px_16px_4px] border border-nv-line1 bg-nv-paper2 px-3.5 py-2.5 text-[13.5px] leading-[1.52] text-nv-ink">
        {mensaje.texto}
      </p>
      {mensaje.productos && mensaje.productos.length > 0 && <Carrusel mensaje={mensaje} />}
      {mensaje.servicioId && <TarjetaDeHorarios mensaje={mensaje} />}
      {mensaje.acciones && (
        <div className="flex flex-wrap gap-1.5">
          {mensaje.acciones.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onAccion(a)}
              className="rounded-full bg-nv-ink px-3.5 py-2 text-[12.5px] text-nv-bg transition-colors hover:bg-nv-accent"
            >
              {ETIQUETA_ACCION[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TarjetaDeHorarios({ mensaje }: { mensaje: MensajeNuria }) {
  const { elegirHorario } = useNuria()
  return <TarjetaServicioNuria mensaje={mensaje} onElegir={(h) => elegirHorario(mensaje, h)} />
}

function Carrusel({ mensaje }: { mensaje: MensajeNuria }) {
  const { porSlug } = useCatalogo()
  const { agregados, agregarProducto, cerrar } = useNuria()
  const navigate = useNavigate()

  return (
    <div className="no-scrollbar -mr-4 flex gap-2 overflow-x-auto pr-4">
      {(mensaje.productos ?? []).map((slug) => {
        const p = porSlug(slug)
        if (!p) return null
        const agregado = agregados.has(slug)
        return (
          <div key={slug} className="w-[142px] shrink-0 overflow-hidden rounded-lg border border-nv-line1 bg-nv-surface">
            <button
              type="button"
              onClick={() => {
                cerrar()
                navigate(`/tienda/${slug}`)
              }}
              className="block w-full"
              aria-label={`Ver ${p.nombre}`}
            >
              <ProductoImagen producto={p} className="aspect-square w-full" />
            </button>
            <div className="p-2.5">
              <p className="line-clamp-2 min-h-[2.4em] text-[12.5px] leading-tight text-nv-ink">{p.nombre}</p>
              <p className="mt-1 text-xs text-nv-soft1">{formatPrice(p.precio)}</p>
              <button
                type="button"
                disabled={agregado}
                onClick={() => agregarProducto(mensaje, slug)}
                className={`mt-2 w-full rounded-full py-2 text-xs transition-colors ${
                  agregado ? 'bg-nv-accent-wash4 text-nv-accent' : 'bg-nv-ink text-nv-bg hover:bg-nv-accent'
                }`}
              >
                {agregado ? 'Agregado ✓' : 'Agregar'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
