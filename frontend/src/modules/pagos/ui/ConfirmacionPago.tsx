import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { formatPrice } from '@/shared/lib/format'
import { boton, tamanoBoton } from '@/shared/ui/nv-estilos'
import { confirmarPago } from '../application'
import { ETIQUETA_TIPO_PAGO, type Comprobante } from '../domain/pago.types'
import { leerRetornoWebpay, retornoVacio } from '../domain/webpay.retorno'
import { pagoRepository } from '../infrastructure/supabase-pago.repository'

/**
 * Pantalla de resultado del pago. Es la `return_url` que recibe Transbank.
 *
 * ----------------------------------------------------------------------------
 * LO QUE PASA AQUI
 * ----------------------------------------------------------------------------
 * Transbank devuelve a la clienta a esta ruta con el token en la URL. La
 * pantalla lo lee, pide la confirmacion al servidor y muestra el comprobante.
 *
 * EL COBRO NO ESTA CERRADO HASTA QUE ESTA LLAMADA OCURRE. Si no se confirmara,
 * Transbank reversaria la operacion: la clienta veria el cargo un rato y luego
 * desapareceria. Por eso la peticion se lanza sola al entrar, sin pedir ningun
 * clic.
 *
 * ----------------------------------------------------------------------------
 * RECARGAR ESTA PANTALLA ES SEGURO
 * ----------------------------------------------------------------------------
 * La Edge Function es idempotente: reclama el intento en la base antes de hablar
 * con Transbank y, si ya estaba confirmado, devuelve el resultado guardado. Eso
 * cubre la recarga, el boton de atras y el doble montaje que hace StrictMode en
 * desarrollo, que si no duplicaria la llamada.
 */

type Estado =
  | { fase: 'confirmando' }
  | { fase: 'resuelto'; comprobante: Comprobante }
  | { fase: 'fallo'; motivo: string }

export default function ConfirmacionPago() {
  const { search } = useLocation()

  // Se lee durante el render, no en un efecto: asi el caso "esta URL no trae
  // nada" se resuelve sin tocar el estado ni lanzar ninguna peticion.
  const retorno = useMemo(() => leerRetornoWebpay(search), [search])
  const sinDatos = retornoVacio(retorno)

  const [estado, setEstado] = useState<Estado>({ fase: 'confirmando' })

  useEffect(() => {
    if (sinDatos) return
    // Guarda de cancelacion: si la clienta se va antes de que responda, no se
    // escribe en un componente desmontado.
    let vivo = true
    confirmarPago(pagoRepository, retorno)
      .then((comprobante) => {
        if (!vivo) return
        setEstado(
          comprobante
            ? { fase: 'resuelto', comprobante }
            : { fase: 'fallo', motivo: 'No encontramos datos del pago en esta dirección.' },
        )
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setEstado({
          fase: 'fallo',
          motivo: e instanceof Error ? e.message : 'No pudimos confirmar el pago.',
        })
      })
    return () => {
      vivo = false
    }
  }, [retorno, sinDatos])

  if (sinDatos) {
    return (
      <Marco>
        <h1 className="font-serif text-3xl font-light text-nv-ink">Nada que confirmar</h1>
        <p className="mt-3 text-sm text-nv-muted1">
          Esta página muestra el resultado de un pago. Si acabas de pagar y ves esto, escríbenos
          con tu código de pedido y lo revisamos.
        </p>
        <Acciones />
      </Marco>
    )
  }

  if (estado.fase === 'confirmando') {
    return (
      <Marco>
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-nv-line3 border-t-nv-accent"
          role="status"
          aria-label="Confirmando el pago"
        />
        <h1 className="mt-6 font-serif text-3xl font-light text-nv-ink">Confirmando tu pago…</h1>
        {/* Importa decirlo: si cierra la pestaña ahora, el cobro puede quedar sin cerrar. */}
        <p className="mt-3 text-sm text-nv-muted1">
          No cierres esta ventana. Estamos verificando la transacción con Transbank.
        </p>
      </Marco>
    )
  }

  if (estado.fase === 'fallo') {
    return (
      <Marco>
        <Insignia ok={false} />
        <h1 className="mt-6 font-serif text-3xl font-light text-nv-ink">
          No pudimos confirmar el pago
        </h1>
        <p className="mt-3 text-sm text-nv-muted1">{estado.motivo}</p>
        <p className="mt-2 text-xs text-nv-soft1">
          Si el cargo aparece en tu cartola, escríbenos antes de volver a pagar: lo revisamos con
          Transbank.
        </p>
        <Acciones />
      </Marco>
    )
  }

  return <Voucher comprobante={estado.comprobante} />
}

/** El comprobante, aprobado o no. */
function Voucher({ comprobante: c }: { comprobante: Comprobante }) {
  const esReserva = c.tipo === 'reserva'

  const titulo = c.aprobado
    ? '¡Pago aprobado!'
    : c.estado === 'anulado'
      ? 'Pago cancelado'
      : 'Pago rechazado'

  const bajada = c.aprobado
    ? esReserva
      ? 'Tu hora quedó confirmada. Te enviamos el detalle a tu correo.'
      : 'Recibimos tu pago. Estamos preparando tu pedido.'
    : c.estado === 'anulado'
      ? 'No se completó el pago, así que no te cobramos nada. Puedes intentarlo otra vez.'
      : (c.motivo ?? 'El medio de pago rechazó la transacción. No se te cobró.')

  return (
    <Marco>
      <Insignia ok={c.aprobado} />
      <h1 className="mt-6 font-serif text-3xl font-light text-nv-ink sm:text-4xl">{titulo}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-nv-muted1">{bajada}</p>

      <dl className="mt-8 divide-y divide-nv-line1 rounded-2xl border border-nv-line1 bg-nv-paper4 px-5 text-left">
        {c.codigo && (
          <Dato etiqueta={esReserva ? 'Reserva' : 'Pedido'} valor={c.codigo} destacado />
        )}
        <Dato etiqueta="Monto" valor={formatPrice(c.monto)} destacado />
        {/* Solo lo que tiene sentido cuando hubo cobro: en un rechazo no hay
            codigo de autorizacion ni tarjeta que mostrar. */}
        {c.aprobado && c.codigoAutorizacion && (
          <Dato etiqueta="Código de autorización" valor={c.codigoAutorizacion} />
        )}
        {c.aprobado && c.tarjetaFinal && (
          <Dato etiqueta="Tarjeta" valor={`•••• ${c.tarjetaFinal}`} />
        )}
        {c.aprobado && c.tipoPago && (
          <Dato
            etiqueta="Medio de pago"
            valor={ETIQUETA_TIPO_PAGO[c.tipoPago] ?? c.tipoPago}
          />
        )}
        {c.aprobado && typeof c.cuotas === 'number' && c.cuotas > 1 && (
          <Dato etiqueta="Cuotas" valor={String(c.cuotas)} />
        )}
        <Dato etiqueta="Orden de compra" valor={c.ordenCompra} />
      </dl>

      {c.aprobado && (
        <p className="mt-4 text-xs text-nv-soft1">
          Guarda el código de autorización: es lo que necesitas si quieres consultar el cargo con
          tu banco.
        </p>
      )}

      <Acciones esReserva={esReserva} />
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-20 text-center sm:py-24">{children}</div>
  )
}

function Insignia({ ok }: { ok: boolean }) {
  return (
    <div
      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
        ok ? 'bg-nv-accent-wash3 text-nv-accent' : 'bg-nv-paper4 text-nv-muted1'
      }`}
    >
      {ok ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
    </div>
  )
}

function Dato({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string
  valor: string
  destacado?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3.5">
      <dt className="text-[13px] text-nv-muted1">{etiqueta}</dt>
      <dd
        className={`text-right ${
          destacado ? 'text-[15px] font-medium text-nv-ink' : 'text-[13.5px] text-nv-ink'
        }`}
      >
        {valor}
      </dd>
    </div>
  )
}

function Acciones({ esReserva = false }: { esReserva?: boolean }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link
        to={esReserva ? '/mis-reservas' : '/tienda'}
        className={`${boton.primario} ${tamanoBoton.medio} inline-block`}
      >
        {esReserva ? 'Ver mis reservas' : 'Seguir comprando'}
      </Link>
      <Link to="/" className={`${boton.secundario} ${tamanoBoton.medio} inline-block`}>
        Volver al inicio
      </Link>
    </div>
  )
}
