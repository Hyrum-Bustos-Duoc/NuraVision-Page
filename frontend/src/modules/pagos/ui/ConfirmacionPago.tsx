import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { formatPrice } from '@/shared/lib/format'
import { boton, tamanoBoton } from '@/shared/ui/nv-estilos'
import { confirmarPago } from '../application'
import { ETIQUETA_TIPO_PAGO, type Comprobante, type DestinoPago } from '../domain/pago.types'
import { admiteReintento, resultadoDePago } from '../domain/resultado-pago'
import { esTimeout, leerRetornoWebpay, retornoVacio } from '../domain/webpay.retorno'
import {
  leerPagoPendiente,
  olvidarPagoPendiente,
} from '../infrastructure/pago-pendiente.storage'
import { pagoRepository } from '../infrastructure/supabase-pago.repository'
import { usePagoWebpay } from './usePagoWebpay'

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
  /** Se agotaron los reintentos con la respuesta aun en `procesando`. */
  | { fase: 'demorado' }

/**
 * Cada cuanto se vuelve a preguntar mientras el servidor responde `procesando`,
 * y cuantas veces. 15 x 2 s = 30 s: mas que lo que tarda Transbank en un dia
 * normal, y no tanto como para dejar a la clienta mirando un spinner sin fin.
 */
const INTERVALO_REINTENTO_MS = 2000
const MAX_CONSULTAS = 15

export default function ConfirmacionPago() {
  const { search } = useLocation()

  // Se lee durante el render, no en un efecto: asi el caso "esta URL no trae
  // nada" se resuelve sin tocar el estado ni lanzar ninguna peticion.
  const retorno = useMemo(() => leerRetornoWebpay(search), [search])
  const sinDatos = retornoVacio(retorno)
  const expirada = esTimeout(retorno)
  // Ni la URL vacia ni el timeout tienen nada que confirmar: en los dos casos se
  // resuelve aqui, sin peticion y sin tocar el estado.
  const nadaQueConfirmar = sinDatos || expirada

  const [estado, setEstado] = useState<Estado>({ fase: 'confirmando' })
  /**
   * Cuantas veces se pidio «Volver a consultar». Es dependencia del efecto: al
   * cambiar, el efecto vuelve a lanzar la confirmacion desde cero.
   */
  const [ronda, setRonda] = useState(0)
  /**
   * Lo que se estaba pagando al salir a Webpay. Se lee una vez al montar: es
   * lo que permite reintentar aunque la respuesta no traiga el codigo.
   */
  const [pendiente] = useState(leerPagoPendiente)

  /**
   * Sincroniza con la Edge Function: confirma y, si responde `procesando`,
   * vuelve a preguntar hasta tener el resultado.
   *
   * STRICTMODE: en desarrollo el efecto se monta, se limpia y se vuelve a
   * montar, asi que salen DOS peticiones. La primera reclama el cobro; la
   * segunda suele llegar mientras tanto y recibe `procesando`. Por eso:
   *   · `vivo` es de cada ejecucion del efecto: la respuesta de la ejecucion
   *     descartada no toca el estado, y la viva no depende de ella.
   *   · `procesando` nunca se pinta como rechazo: se reintenta, y la ejecucion
   *     viva acaba recibiendo el comprobante guardado (`repetida`).
   *   · La limpieza cancela el temporizador pendiente, de modo que la ejecucion
   *     descartada no sigue consultando por su cuenta.
   */
  useEffect(() => {
    if (nadaQueConfirmar) return
    let vivo = true
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let consultas = 0

    const consultar = () => {
      consultas += 1
      confirmarPago(pagoRepository, retorno)
        .then((comprobante) => {
          if (!vivo) return
          if (!comprobante) {
            setEstado({ fase: 'fallo', motivo: 'No encontramos datos del pago en esta dirección.' })
            return
          }
          if (comprobante.procesando) {
            if (consultas >= MAX_CONSULTAS) setEstado({ fase: 'demorado' })
            else temporizador = setTimeout(consultar, INTERVALO_REINTENTO_MS)
            return
          }
          // Cobrado: ya no hay nada que reintentar en esta pestaña.
          if (comprobante.aprobado) olvidarPagoPendiente()
          setEstado({ fase: 'resuelto', comprobante })
        })
        .catch((e: unknown) => {
          if (!vivo) return
          setEstado({
            fase: 'fallo',
            motivo: e instanceof Error ? e.message : 'No pudimos confirmar el pago.',
          })
        })
    }

    consultar()
    return () => {
      vivo = false
      clearTimeout(temporizador)
    }
  }, [retorno, nadaQueConfirmar, ronda])

  if (expirada) {
    return (
      <Marco>
        <Insignia ok={false} />
        <h1 className="mt-6 font-serif text-3xl font-light text-nv-ink">
          Se agotó el tiempo para pagar
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-nv-muted1">
          La sesión de pago expiró antes de completarse, así que{' '}
          <strong className="font-medium text-nv-ink">no se te cobró nada</strong>.{' '}
          {pendiente?.tipo === 'reserva' ? 'Tu reserva' : 'Tu pedido'} quedó registrado y puedes
          pagarlo cuando quieras.
        </p>
        {retorno.ordenCompra && (
          <p className="mt-2 text-xs text-nv-soft1">Orden {retorno.ordenCompra}</p>
        )}
        {pendiente && <ReintentarPago destino={pendiente} />}
        <Acciones esReserva={pendiente?.tipo === 'reserva'} />
      </Marco>
    )
  }

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

  // No es un fallo ni un rechazo: el servidor sigue cerrando el cobro. Decir
  // "rechazado" o "no se te cobró" aqui podria ser falso.
  if (estado.fase === 'demorado') {
    return (
      <Marco>
        <h1 className="font-serif text-3xl font-light text-nv-ink">
          Seguimos verificando tu pago
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-nv-muted1">
          Transbank está tardando más de lo normal en confirmarlo. No vuelvas a pagar: consulta
          otra vez en un momento. Si sigue así, escríbenos con tu código y lo revisamos.
        </p>
        {retorno.ordenCompra && (
          <p className="mt-2 text-xs text-nv-soft1">Orden {retorno.ordenCompra}</p>
        )}
        <button
          type="button"
          onClick={() => {
            setEstado({ fase: 'confirmando' })
            setRonda((r) => r + 1)
          }}
          className={`${boton.primario} ${tamanoBoton.medio} mt-8`}
        >
          Volver a consultar
        </button>
        <Acciones />
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

  return <Voucher comprobante={estado.comprobante} pendiente={pendiente} />
}

/** El comprobante, aprobado o no. */
function Voucher({
  comprobante: c,
  pendiente,
}: {
  comprobante: Comprobante
  pendiente: DestinoPago | null
}) {
  const esReserva = c.tipo === 'reserva'
  const resultado = resultadoDePago(c)
  // Se reintenta lo que diga el servidor; si no trae codigo (abandono sin
  // comprobante), lo recordado al salir a Webpay.
  const destinoReintento: DestinoPago | null = c.codigo
    ? { tipo: c.tipo, codigo: c.codigo }
    : pendiente

  /**
   * Si hay un desglose de abono que mostrar.
   *
   * Se exigen las dos cifras y que el saldo sea positivo: un "saldo $0" no
   * aporta nada y tres filas para decir una sola cifra solo confunden.
   */
  const desglose =
    resultado === 'aprobado' && c.monto !== null && c.montoTotal !== null && c.saldo !== null && c.saldo > 0
      ? { total: c.montoTotal, abonado: c.monto, saldo: c.saldo }
      : null

  const titulo = {
    aprobado: '¡Pago aprobado!',
    revision: 'Recibimos tu pago, pero hay que revisarlo',
    rechazado: 'Pago rechazado',
    anulado: 'Pago cancelado',
    incierto: 'No pudimos confirmar el resultado del pago',
  }[resultado]

  const bajada = {
    aprobado: desglose
      ? // Con abono, lo primero que hay que decir es que queda algo por pagar:
        // enterarse en el local de que se debe el resto seria una sorpresa.
        'Tu hora quedó confirmada con el abono. El saldo se paga en el estudio el día de tu cita.'
      : esReserva
        ? 'Tu hora quedó confirmada. Te enviamos el detalle a tu correo.'
        : 'Recibimos tu pago. Estamos preparando tu pedido.',
    // Se cobro, pero ya no habia nada pendiente que confirmar: no se dice
    // «confirmada» y se promete solo lo que el estudio puede cumplir.
    revision: `${c.motivo ?? ''} El estudio revisará tu caso y, si corresponde, te devolverá el dinero.`.trim(),
    // Unico caso en que consta que el medio de pago no cobro.
    rechazado: c.motivo
      ? `${c.motivo} No se te cobró.`
      : 'El medio de pago rechazó la transacción. No se te cobró.',
    // Abandono del formulario de Webpay: no llego a haber cargo.
    anulado: 'No se completó el pago, así que no te cobramos nada. Puedes intentarlo otra vez.',
    // 'error': puede haber cargo (cobro duplicado, o commit y consulta sin
    // respuesta). Ni «no se te cobró» ni invitar a pagar de nuevo.
    incierto: `${c.motivo ? `${c.motivo} ` : ''}No vuelvas a pagar: el cargo podría haberse hecho. Escríbenos al estudio con tu código y lo revisamos con Transbank.`,
  }[resultado]

  return (
    <Marco>
      <Insignia ok={resultado === 'aprobado'} />
      <h1 className="mt-6 font-serif text-3xl font-light text-nv-ink sm:text-4xl">{titulo}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-nv-muted1">{bajada}</p>

      <dl className="mt-8 divide-y divide-nv-line1 rounded-2xl border border-nv-line1 bg-nv-paper4 px-5 text-left">
        {c.codigo && (
          <Dato etiqueta={esReserva ? 'Reserva' : 'Pedido'} valor={c.codigo} destacado />
        )}
        {/* Se comprueba el tipo antes de formatear: `formatPrice` de un valor
            ausente pinta "NaN", y un comprobante que dice NaN en el monto es
            peor que uno que no lo muestra. */}
        {desglose ? (
          <>
            {/* Las tres cifras del abono (pagos.monto_total, 0018). Van en este orden —total,
                pagado, saldo— porque es como se lee una cuenta: cuanto cuesta,
                cuanto llevas, cuanto falta. */}
            <Dato etiqueta="Total del servicio" valor={formatPrice(desglose.total)} />
            <Dato etiqueta="Abonado hoy con Webpay" valor={formatPrice(desglose.abonado)} destacado />
            <Dato
              etiqueta="Saldo a pagar en el local"
              valor={formatPrice(desglose.saldo)}
              destacado
            />
          </>
        ) : (
          c.monto !== null && (
            <Dato etiqueta="Monto" valor={formatPrice(c.monto)} destacado />
          )
        )}
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
        {c.ordenCompra && <Dato etiqueta="Orden de compra" valor={c.ordenCompra} />}
      </dl>

      {c.aprobado && (
        <p className="mt-4 text-xs text-nv-soft1">
          Guarda el código de autorización: es lo que necesitas si quieres consultar el cargo con
          tu banco.
        </p>
      )}

      {admiteReintento(resultado) && destinoReintento && (
        <ReintentarPago destino={destinoReintento} />
      )}
      <Acciones esReserva={esReserva} />
    </Marco>
  )
}

/**
 * Vuelve a abrir Webpay para la misma reserva o pedido. Solo se pinta cuando
 * consta que no hubo cargo (rechazo, abandono o sesion expirada). El monto lo
 * vuelve a decidir el servidor con el codigo.
 */
function ReintentarPago({ destino }: { destino: DestinoPago }) {
  const webpay = usePagoWebpay()
  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => void webpay.pagar(destino)}
        disabled={webpay.enviando}
        aria-busy={webpay.enviando}
        className={`${boton.acento} ${tamanoBoton.medio}`}
      >
        {webpay.enviando ? 'Redirigiendo a Webpay…' : 'Reintentar el pago'}
      </button>
      {webpay.error && (
        <p role="alert" className="mt-3 text-sm text-nv-error">
          {webpay.error}
        </p>
      )}
    </div>
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
