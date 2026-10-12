import { Lock } from 'lucide-react'
import { saldoTrasAbono } from '@/shared/lib/abono'
import { formatLongDate, formatPrice } from '@/shared/lib/format'
import { boton } from '@/shared/ui/nv-estilos'
import { POLITICA_ABONO } from './politica-abono'

/**
 * Paso «Abono» del flujo de reserva: el abono se paga con Webpay.
 *
 * Este componente no sabe de la pasarela. `onPagar` lo resuelve la pagina, que
 * crea la reserva y abre el cobro: un modulo no importa de otro, y `pagos` es
 * otro modulo. Aqui solo se explica que se va a cobrar y se pinta lo que paso.
 *
 * No hay opcion de «pagar en el estudio»: con abono > 0 el abono es obligatorio
 * y se paga en linea. El monto lo fija el servidor con la reserva; las cifras de
 * esta pantalla son las mismas reglas leidas del catalogo, para anunciarlo.
 *
 * Los dos errores son distintos y se dicen distinto:
 *   · `errorAlGuardar`: la reserva NO se creo. No hubo cobro.
 *   · `errorDePago`: la reserva SI se creo, pero el cobro no llego a abrirse. El
 *     boton reintenta solo el cobro (la pagina reutiliza el mismo codigo).
 */
export function PasoAbono({
  servicioNombre,
  profesionalNombre,
  dateISO,
  time,
  precio,
  abono,
  guardando,
  abriendoPago,
  errorAlGuardar,
  errorDePago,
  onBack,
  onPagar,
}: {
  servicioNombre: string
  profesionalNombre: string
  dateISO: string
  time: string
  /** Precio ya resuelto del servicio (el de la variante elegida, si hay). */
  precio: number
  /** Mayor que 0: con 0 este paso no existe. */
  abono: number
  guardando: boolean
  /** Se esta abriendo Webpay: la pagina esta a punto de cambiar sola. */
  abriendoPago: boolean
  errorAlGuardar: string | null
  errorDePago: string | null
  onBack: () => void
  onPagar: () => void
}) {
  const ocupado = guardando || abriendoPago

  // El titulo va dentro de la columna izquierda, como en Checkout, y no encima
  // de la rejilla: asi el resumen empieza arriba y en 1280x800 su final (la
  // politica) no cae bajo el boton flotante de Nuria.
  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_0.9fr] lg:gap-11">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-[12.5px] text-nv-soft1 transition-colors hover:text-nv-ink"
        >
          ← Volver a la confirmación
        </button>
        <h1 className="mt-3 font-serif text-[30px] font-light leading-tight tracking-[-0.02em] text-nv-ink sm:text-[38px]">
          Abono
        </h1>
        <p className="mt-2 max-w-lg text-sm text-nv-muted1">
          Para reservar este servicio se adelanta un abono de {formatPrice(abono)}. Te llevaremos
          a Webpay para pagarlo con tarjeta de débito, crédito o prepago, y al terminar volverás
          aquí con tu comprobante.
        </p>

        {errorAlGuardar && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-nv-error-line bg-nv-error-bg px-4 py-3 text-sm text-nv-error"
          >
            <p>{errorAlGuardar}</p>
            <p className="mt-1 font-medium">No se realizó ningún cobro.</p>
          </div>
        )}

        {/* La reserva YA existe: si no se dice, parecera que se perdio y se
            intentara reservar otra vez desde el principio. */}
        {errorDePago && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-nv-error-line bg-nv-error-bg px-4 py-3 text-sm text-nv-error"
          >
            <p>{errorDePago}</p>
            <p className="mt-1 font-medium">
              Tu hora quedó registrada, pero sin el abono no está confirmada. Reintenta el pago.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onPagar}
          disabled={ocupado}
          aria-busy={ocupado}
          className={`${boton.acento} mt-8 inline-flex w-full items-center justify-center gap-2 px-8 py-[15px] text-[14.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nv-accent active:scale-[0.98] sm:w-auto`}
        >
          <Lock aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          {abriendoPago
            ? 'Redirigiendo a Webpay…'
            : guardando
              ? 'Reservando…'
              : errorDePago
                ? 'Reintentar el pago del abono'
                : 'Pagar abono con Webpay'}
        </button>
        <p className="mt-3 text-xs text-nv-soft1">
          Los datos de tu tarjeta los ingresas en Webpay: nunca pasan por este sitio.
        </p>
      </div>

      <aside className="h-fit rounded-[10px] border border-nv-line1 bg-nv-surface p-5 sm:p-[22px] lg:sticky lg:top-[100px]">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-nv-soft1">Tu reserva</h2>
        <p className="mt-4 font-serif text-xl font-light text-nv-ink">{servicioNombre}</p>
        <p className="mt-1 text-[13px] text-nv-soft1">
          {profesionalNombre} · {formatLongDate(dateISO)} · {time} h
        </p>

        {/* Total, abono, saldo: es como se lee una cuenta. */}
        <dl className="mt-5 space-y-2 border-t border-nv-line1 pt-4 text-sm">
          <div className="flex justify-between text-nv-muted1">
            <dt>Total del servicio</dt>
            <dd className="text-nv-ink">{formatPrice(precio)}</dd>
          </div>
          <div className="flex items-baseline justify-between text-nv-ink">
            <dt className="text-base">Abono hoy con Webpay</dt>
            <dd className="font-serif text-2xl font-light">{formatPrice(abono)}</dd>
          </div>
          <div className="flex justify-between border-t border-nv-line1 pt-3 text-nv-muted1">
            <dt>Saldo a pagar en el local</dt>
            <dd className="text-nv-ink">{formatPrice(saldoTrasAbono(precio, abono))}</dd>
          </div>
        </dl>

        <p className="mt-5 rounded-lg bg-nv-paper2 px-4 py-3 text-xs leading-relaxed text-nv-muted1">
          {POLITICA_ABONO}
        </p>
      </aside>
    </div>
  )
}
