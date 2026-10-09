// ============================================================================
// NuraVision · Edge Function · webpay-confirmar-transaccion
// ============================================================================
// Cierra el cobro contra Transbank y, si quedo autorizado, marca el pedido o la
// reserva como pagados.
//
// ----------------------------------------------------------------------------
// EL TOKEN ES LA CREDENCIAL, Y NO HAY SESION QUE EXIGIR
// ----------------------------------------------------------------------------
// Esta funcion no pide sesion, y es deliberado. Transbank devuelve a la clienta
// a `/confirmacion-pago` con el `token_ws` y nada mas; mucha gente compra sin
// cuenta, asi que exigir un `auth.uid()` dejaria sin comprobante justo a quien
// no tiene otra via.
//
// El token sirve de credencial porque solo lo conoce quien acaba de pasar por
// Webpay, caduca, y lo unico que permite hacer es confirmar el cobro que le
// corresponde — que es precisamente lo que tiene que ocurrir. No deja leer ni
// tocar nada de otra persona.
//
// ----------------------------------------------------------------------------
// UN COMMIT POR TOKEN, NI UNO MAS
// ----------------------------------------------------------------------------
// Transbank responde con ERROR a un segundo PUT sobre el mismo token: no
// repite el resultado anterior. Y esta pantalla se recarga, se comparte y se
// abre dos veces con toda normalidad.
//
// Por eso el intento se RECLAMA antes de llamar a Transbank, con un UPDATE
// condicional sobre `confirmado_en` (0015) — el mismo patron que 0012 usa para
// el correo. Si no toca ninguna fila, el commit ya se hizo y se devuelve lo que
// quedo guardado. Esa respuesta guardada es lo que hace que recargar la pantalla
// muestre el comprobante en vez de un error.
//
// ----------------------------------------------------------------------------
// NO SE CREE LO QUE DICE TRANSBANK SIN COMPROBARLO
// ----------------------------------------------------------------------------
// Para dar un pago por bueno se exigen cuatro cosas:
//
//   · response_code 0 y status AUTHORIZED,
//   · que el `buy_order` devuelto sea el del intento,
//   · y que el `amount` devuelto sea el monto que se registro.
//
// Las dos ultimas parecen redundantes. No lo son: son la ultima linea que
// detecta que se confirmo un token que no era de este intento.
//
// ----------------------------------------------------------------------------
// EL ESTADO QUE SE ESCRIBE
// ----------------------------------------------------------------------------
//   · pedidos  -> 'pagado', que es un valor que `estado_pedido` ya tenia (0013).
//   · reservas -> 'confirmada'. `estado_reserva` (0003) NO TIENE "pagada", y no
//     se le agrega: el estado de una reserva habla de la cita, no del dinero.
//     Que se pago, y cuanto, lo dice `pagos`. Pagar confirma la hora, que es el
//     significado que la clienta espera.
//
// ----------------------------------------------------------------------------
// DESPLIEGUE
// ----------------------------------------------------------------------------
//   supabase functions deploy webpay-confirmar-transaccion
//
// Comparte los secretos de `webpay-crear-transaccion`. SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import {
  confirmarTransaccion,
  fueAprobada,
  type RespuestaCommit,
} from '../_shared/transbank.ts'

const CABECERAS_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respuesta(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CABECERAS_CORS, 'Content-Type': 'application/json' },
  })
}

function comoTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** Fila de `pagos` con lo que hace falta aqui. */
interface FilaPago {
  id: number
  buy_order: string
  monto: number
  /** Total del servicio cuando solo se cobro un abono (0016). */
  monto_total: number | null
  estado: string
  pedido_id: number | null
  reserva_id: number | null
  confirmado_en: string | null
  response_code: number | null
  authorization_code: string | null
  payment_type_code: string | null
  cuotas: number | null
  tarjeta_final: string | null
}

/**
 * El comprobante que ve la clienta. Nunca incluye el token.
 *
 * `codigo` es el del pedido o la reserva —no la orden de compra de Transbank—
 * porque es el que la clienta reconoce y con el que nos escribe. Llega como
 * parametro porque vive en otra tabla.
 */
function comprobante(pago: FilaPago, estado: string, codigo: string | null) {
  return {
    estado,
    aprobado: estado === 'autorizado',
    ordenCompra: pago.buy_order,
    codigo,
    monto: pago.monto,
    /**
     * El desglose del abono (0016).
     *
     * `montoTotal` es lo que costaba el servicio el dia del cobro, guardado
     * entonces y no recalculado: el estudio edita sus precios y un comprobante
     * viejo mostraria un saldo que nadie acordo.
     *
     * Los dos van en null cuando se cobro el total, que es el caso de los
     * pedidos de la tienda y de los servicios sin abono: ahi no hay nada que
     * desglosar y la pantalla muestra una sola cifra.
     */
    montoTotal: pago.monto_total,
    saldo: pago.monto_total === null ? null : pago.monto_total - pago.monto,
    codigoAutorizacion: pago.authorization_code,
    tipoPago: pago.payment_type_code,
    cuotas: pago.cuotas,
    tarjetaFinal: pago.tarjeta_final,
    tipo: pago.pedido_id !== null ? 'pedido' : 'reserva',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS_CORS })
  if (req.method !== 'POST') return respuesta({ error: 'Metodo no permitido.' }, 405)

  const urlSupabase = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!urlSupabase || !serviceRole) {
    console.error('Faltan las variables que inyecta Supabase.')
    return respuesta({ error: 'La funcion no esta configurada.' }, 500)
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await req.json()) as Record<string, unknown>
  } catch {
    return respuesta({ error: 'El cuerpo no es JSON valido.' }, 400)
  }

  const tokenWs = comoTexto(cuerpo.tokenWs)
  // Cuando la clienta abandona el formulario de Webpay, Transbank NO manda
  // `token_ws`: manda `TBK_TOKEN` junto a la orden y la sesion. Es un abandono,
  // no un fallo, y se registra como tal.
  const tbkToken = comoTexto(cuerpo.tbkToken)

  const admin = createClient(urlSupabase, serviceRole, {
    auth: { persistSession: false },
  })

  const COLUMNAS =
    'id, buy_order, monto, monto_total, estado, pedido_id, reserva_id, ' +
    'confirmado_en, response_code, authorization_code, payment_type_code, ' +
    'cuotas, tarjeta_final'

  /**
   * El codigo del pedido o de la reserva a la que pertenece el intento.
   *
   * Es una consulta aparte porque `pagos` no lo duplica: duplicarlo obligaria a
   * mantenerlo sincronizado para ahorrar una lectura por confirmacion, que
   * ocurre una vez por compra.
   */
  const codigoDe = async (p: FilaPago): Promise<string | null> => {
    const tabla = p.pedido_id !== null ? 'pedidos' : 'reservas'
    const id = p.pedido_id ?? p.reserva_id
    if (id === null) return null
    const { data } = await admin.from(tabla).select('codigo').eq('id', id).maybeSingle()
    return ((data as { codigo?: string } | null)?.codigo ?? null) as string | null
  }

  // --- Abandono -------------------------------------------------------------
  if (!tokenWs && tbkToken) {
    const { data: pago } = await admin
      .from('pagos')
      .select(COLUMNAS)
      .eq('token_ws', tbkToken)
      .maybeSingle<FilaPago>()

    if (pago && pago.confirmado_en === null) {
      await admin
        .from('pagos')
        .update({ estado: 'anulado', confirmado_en: new Date().toISOString() })
        .eq('id', pago.id)
        .is('confirmado_en', null)
    }

    return respuesta(
      {
        estado: 'anulado',
        aprobado: false,
        motivo: 'El pago se cancelo antes de completarse.',
      },
      200,
    )
  }

  if (!tokenWs) {
    return respuesta({ error: 'Falta el token de la transaccion.' }, 400)
  }

  // --- El intento -----------------------------------------------------------
  const { data: pago, error: errorLectura } = await admin
    .from('pagos')
    .select(COLUMNAS)
    .eq('token_ws', tokenWs)
    .maybeSingle<FilaPago>()

  if (errorLectura) {
    console.error('No se pudo leer el pago:', errorLectura.message)
    return respuesta({ error: 'No se pudo confirmar el pago.' }, 500)
  }
  if (!pago) return respuesta({ error: 'Esta transaccion no existe.' }, 404)

  // Ya confirmado: se devuelve lo guardado. Es lo que hace que recargar la
  // pantalla funcione, en vez de pedirle a Transbank un commit que daria error.
  if (pago.confirmado_en !== null) {
    return respuesta(
      { ...comprobante(pago, pago.estado, await codigoDe(pago)), repetida: true },
      200,
    )
  }

  // --- Se reclama el commit -------------------------------------------------
  // `is('confirmado_en', null)` es la condicion que lo vuelve irrepetible: si
  // dos pestanas llegan a la vez, solo una toca fila y la otra lee el resultado.
  const { data: reclamadas, error: errorReclamo } = await admin
    .from('pagos')
    .update({ confirmado_en: new Date().toISOString() })
    .eq('id', pago.id)
    .is('confirmado_en', null)
    .select('id')

  if (errorReclamo) {
    console.error('No se pudo reclamar el pago:', errorReclamo.message)
    return respuesta({ error: 'No se pudo confirmar el pago.' }, 500)
  }

  if (!reclamadas || reclamadas.length === 0) {
    const { data: actual } = await admin
      .from('pagos')
      .select(COLUMNAS)
      .eq('id', pago.id)
      .maybeSingle<FilaPago>()
    return respuesta(
      {
        ...comprobante(actual ?? pago, actual?.estado ?? pago.estado, await codigoDe(actual ?? pago)),
        repetida: true,
      },
      200,
    )
  }

  // --- Commit contra Transbank ---------------------------------------------
  let commit: RespuestaCommit
  try {
    commit = await confirmarTransaccion(tokenWs)
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error('El commit fallo:', detalle)
    // Queda en 'error' con `confirmado_en` puesto: no se reintenta solo, porque
    // un segundo commit tampoco funcionaria. Es un caso para revisar a mano
    // contra el portal de Transbank, y la fila deja constancia de que paso.
    await admin
      .from('pagos')
      .update({ estado: 'error', respuesta: { error: detalle } })
      .eq('id', pago.id)
    return respuesta({ error: 'La pasarela de pago no respondio.', estado: 'error' }, 502)
  }

  // --- Se comprueba lo que respondio ---------------------------------------
  const montoCoincide = Math.round(Number(commit.amount ?? -1)) === Math.round(pago.monto)
  const ordenCoincide = commit.buy_order === pago.buy_order
  const aprobado = fueAprobada(commit) && montoCoincide && ordenCoincide

  if (fueAprobada(commit) && !(montoCoincide && ordenCoincide)) {
    // Transbank aprobo algo que no cuadra con este intento. Se registra como
    // error, NO como autorizado: marcar un pedido pagado con un monto que no es
    // el suyo es peor que dejar el pago sin resolver.
    console.error(
      `Commit incoherente: orden ${commit.buy_order} vs ${pago.buy_order}, ` +
        `monto ${commit.amount} vs ${pago.monto}`,
    )
  }

  const estadoFinal = aprobado
    ? 'autorizado'
    : fueAprobada(commit)
      ? 'error'
      : 'rechazado'

  const { data: guardado, error: errorGuardar } = await admin
    .from('pagos')
    .update({
      estado: estadoFinal,
      response_code: commit.response_code ?? null,
      authorization_code: commit.authorization_code ?? null,
      payment_type_code: commit.payment_type_code ?? null,
      cuotas: commit.installments_number ?? null,
      // Transbank entrega solo los ultimos digitos, y aqui se recortan otra vez
      // por si algun dia mandara mas: la columna no admite mas de 4.
      tarjeta_final: (commit.card_detail?.card_number ?? '').slice(-4) || null,
      respuesta: commit as unknown as Record<string, unknown>,
    })
    .eq('id', pago.id)
    .select(COLUMNAS)
    .maybeSingle<FilaPago>()

  if (errorGuardar) {
    console.error('No se pudo guardar el resultado:', errorGuardar.message)
    return respuesta({ error: 'No se pudo confirmar el pago.' }, 500)
  }

  const filaFinal = guardado ?? pago

  if (!aprobado) {
    return respuesta(
      {
        ...comprobante(filaFinal, estadoFinal, await codigoDe(filaFinal)),
        motivo:
          estadoFinal === 'rechazado'
            ? 'El pago fue rechazado por el medio de pago.'
            : 'El pago no se pudo validar.',
      },
      200,
    )
  }

  // --- Se marca lo pagado ---------------------------------------------------
  // Se hace DESPUES de guardar el resultado del commit: si esto fallara, el pago
  // ya esta registrado como autorizado y el estudio puede corregir el pedido a
  // mano. Al reves se perderia el unico rastro del cobro.
  if (filaFinal.pedido_id !== null) {
    const { error } = await admin
      .from('pedidos')
      .update({ estado: 'pagado', actualizado_en: new Date().toISOString() })
      .eq('id', filaFinal.pedido_id)
    if (error) console.error('Pago autorizado pero el pedido no se marco:', error.message)
  } else if (filaFinal.reserva_id !== null) {
    const { error } = await admin
      .from('reservas')
      .update({ estado: 'confirmada' })
      .eq('id', filaFinal.reserva_id)
      .neq('estado', 'cancelada')
    if (error) console.error('Pago autorizado pero la reserva no se marco:', error.message)
  }

  // --- Aviso por correo -----------------------------------------------------
  /**
   * Se pide el correo SIN ESPERARLO y sin dejar que un fallo tumbe la respuesta:
   * el cobro ya esta hecho y el comprobante tiene que llegar a la pantalla pase
   * lo que pase con el correo.
   *
   * Solo para RESERVAS. No existe una funcion de correo para pedidos de la
   * tienda —`enviar-confirmacion-reserva` es la unica que hay—, asi que de una
   * compra no se manda nada: queda anotado como pendiente, no disimulado con una
   * invocacion a algo que no esta desplegado.
   */
  if (filaFinal.reserva_id !== null) {
    try {
      const { error } = await admin.functions.invoke('enviar-confirmacion-reserva', {
        body: { reservaId: filaFinal.reserva_id },
      })
      if (error) console.error('El correo de confirmacion no salio:', error.message)
    } catch (e: unknown) {
      console.error('El correo de confirmacion no salio:', e)
    }
  }

  return respuesta(comprobante(filaFinal, 'autorizado', await codigoDe(filaFinal)), 200)
})
