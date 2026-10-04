import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, X } from 'lucide-react'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { ProductoImagen } from '@/modules/tienda/ui/ProductoImagen'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import { formatPrice } from '@/shared/lib/format'
import { useCapaFlotante } from '@/shared/ui/useCapaFlotante'
import type { AccionNuva, Mensaje, MensajeNuva } from '../domain/nuva.types'
import { NuvaAvatar } from './NuvaAvatar'
import { TarjetaServicioNuva } from './TarjetaServicioNuva'
import { useNuva } from './useNuva'

const ETIQUETA_ACCION: Record<AccionNuva, string> = {
  'ver-carrito': 'Ver carrito →',
  'ir-a-pagar': 'Ir a pagar →',
  'ver-reservas': 'Ver mis reservas →',
  'confirmar-reserva': 'Confirmar reserva →',
  'ver-servicios': 'Ver servicios →',
}

/** Panel de chat de Nuva (spec §12.2). En movil ocupa la pantalla completa. */
export function NuvaPanel() {
  const nuva = useNuva()
  const { abrir: abrirCarrito } = useCarrito()
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const lista = useRef<HTMLDivElement>(null)
  const entrada = useCapaFlotante<HTMLInputElement>(nuva.abierto, nuva.cerrar)

  // Auto-scroll al final con cada mensaje, con "escribiendo" y al abrir.
  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [nuva.mensajes.length, nuva.escribiendo, nuva.abierto])

  if (!nuva.abierto) return null

  const ultimo = nuva.mensajes[nuva.mensajes.length - 1]
  const chips = !nuva.escribiendo && ultimo?.de === 'nuva' ? (ultimo.chips ?? []) : []

  function enviar() {
    nuva.enviar(texto)
    setTexto('')
  }

  function ejecutar(accion: AccionNuva) {
    nuva.cerrar()
    if (accion === 'ver-carrito') abrirCarrito()
    if (accion === 'ir-a-pagar') navigate('/checkout')
    if (accion === 'ver-reservas') navigate('/mis-reservas')
    if (accion === 'confirmar-reserva') navigate('/reservar')
    if (accion === 'ver-servicios') navigate('/servicios')
  }

  function elegirChip(chip: string) {
    if (chip === 'No, gracias') nuva.declinar()
    else nuva.enviar(chip)
  }

  return (
    <section
      role="dialog"
      aria-label="Nuva, asistente de compras y reservas"
      className="animate-nv-pop fixed inset-0 z-[97] flex flex-col overflow-hidden bg-nv-bg sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(660px,calc(100dvh-40px))] sm:w-[410px] sm:rounded-[18px] sm:border sm:border-nv-line2 sm:shadow-panel"
    >
      <header className="flex items-center gap-3 bg-nv-ink px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-nv-bg">
        <NuvaAvatar tamano={38} enLinea />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[21px] leading-none">Nuva</p>
          <p className="mt-1 text-[11.5px] leading-snug text-nv-soft2">Asistente de compras y reservas · en línea</p>
        </div>
        <button
          type="button"
          onClick={nuva.reiniciar}
          className="rounded-full px-2.5 py-1.5 text-xs text-nv-faint2 transition-colors hover:bg-nv-ink2 hover:text-nv-bg"
        >
          Reiniciar
        </button>
        <button
          type="button"
          onClick={nuva.cerrar}
          aria-label="Cerrar Nuva"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full transition-colors hover:bg-nv-ink2"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </header>

      <div ref={lista} className="flex-1 space-y-3 overflow-y-auto px-4 py-[18px]" aria-live="polite">
        {nuva.mensajes.map((m) => (
          <Burbuja key={m.id} mensaje={m} onAccion={ejecutar} />
        ))}
        {nuva.escribiendo && (
          <div className="animate-nv-rise inline-flex gap-1.5 rounded-[16px_16px_16px_4px] border border-nv-line1 bg-nv-paper2 px-4 py-3.5">
            <span className="sr-only">Nuva está escribiendo…</span>
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
            aria-label="Mensaje para Nuva"
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
          Nuva puede equivocarse. Confirmas precio y hora antes de pagar.
        </p>
      </footer>
    </section>
  )
}

function Burbuja({ mensaje, onAccion }: { mensaje: Mensaje; onAccion: (a: AccionNuva) => void }) {
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

function TarjetaDeHorarios({ mensaje }: { mensaje: MensajeNuva }) {
  const { elegirHorario } = useNuva()
  return <TarjetaServicioNuva mensaje={mensaje} onElegir={(h) => elegirHorario(mensaje, h)} />
}

function Carrusel({ mensaje }: { mensaje: MensajeNuva }) {
  const { porSlug } = useCatalogo()
  const { agregados, agregarProducto, cerrar } = useNuva()
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
