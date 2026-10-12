// ============================================================================
// NuraVision · Edge Function · webpay-crear-transaccion
// ============================================================================
// Inicia un cobro con Webpay Plus y devuelve a donde tiene que ir el navegador.
//
// ----------------------------------------------------------------------------
// LO QUE JUSTIFICA QUE ESTO SEA UNA FUNCION DE SERVIDOR
// ----------------------------------------------------------------------------
// EL MONTO. La peticion trae SOLO un identificador —el id o el codigo del
// pedido o de la reserva— y el monto se lee de la base con la service_role key.
//
// Si el navegador mandara el monto, cualquiera podria pagar $1 por un pedido de
// $50.000: esta funcion se invoca con la anon key, que viaja dentro del bundle y
// es publica por diseno. Leyendolo de la base, lo unico que un atacante controla
// es QUE pedido paga, no cuanto.
//
// Es la misma decision que toma `enviar-confirmacion-reserva`, y por el mismo
// motivo, pero aqui el fallo costaria dinero.
//
// ----------------------------------------------------------------------------
// QUIEN PUEDE INICIAR UN PAGO
// ----------------------------------------------------------------------------
// Tres caminos, los mismos que para el correo de confirmacion:
//
//   · La clienta con sesion: su `auth.uid()` coincide con `cliente_id`.
//   · El personal del estudio: `es_staff` en su `app_metadata`.
//   · Quien compro o reservo SIN cuenta: prueba que es suyo con el `codigo`,
//     que solo aparece en su pantalla. Sin esta via, una invitada no podria
//     pagar lo que acaba de pedir, que es el caso mas comun de la tienda.
//
// El permiso se comprueba JUSTO despues de leer la fila, y "no existe" y "no es
// tuyo" responden el mismo 403 con el mismo texto. Si respondieran distinto,
// probar ids correlativos diria cuales existen, y el estado de un pedido o una
// reserva ajena (pagado, cancelada) solo se cuenta a quien puede pagarlo.
//
// ----------------------------------------------------------------------------
// LO QUE NO SE COBRA DOS VECES
// ----------------------------------------------------------------------------
// Antes de crear nada se comprueba que no exista ya un pago 'autorizado' para
// ese pedido o esa reserva. Un reintento tras una tarjeta rechazada SI esta
// permitido —y crea una orden de compra nueva, porque Transbank rechaza las
// repetidas—, pero un segundo cobro de algo ya pagado, no.
//
// Esa pregunta tiene una ventana: dos pestanas pueden iniciar dos intentos y
// pagar los dos en Transbank. La garantia final esta en la base (indices unicos
// parciales de 0018) y salta al CONFIRMAR, no aqui: aqui solo se insertan
// intentos 'iniciado', que esos indices no restringen.
//
// ----------------------------------------------------------------------------
// EL NAVEGADOR TIENE QUE HACER UN POST
// ----------------------------------------------------------------------------
// Esta funcion devuelve `{ token, url }`. El navegador debe enviar un
// FORMULARIO por POST a esa `url` con el campo `token_ws`. Una redireccion GET
// no funciona: Webpay responde con un error de token no encontrado.
//
// ----------------------------------------------------------------------------
// DESPLIEGUE Y CONFIGURACION
// ----------------------------------------------------------------------------
//   supabase functions deploy webpay-crear-transaccion
//
//   supabase secrets set SITIO_URL=http://localhost:5173
//
// Opcionales, con las credenciales publicas de integracion por defecto:
//
//   supabase secrets set WEBPAY_ENTORNO=integracion
//   supabase secrets set WEBPAY_CODIGO_COMERCIO=597055555532
//   supabase secrets set WEBPAY_API_KEY=...
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { crearTransaccion, nuevaOrdenDeCompra } from '../_shared/transbank.ts'

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

/** Un entero positivo, o null. Para los id que llegan en el cuerpo. */
function comoId(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isInteger(valor) && valor > 0) return valor
  if (typeof valor === 'string' && /^[0-9]{1,18}$/.test(valor)) return Number(valor)
  return null
}

function comoTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** PostgREST devuelve la relacion como objeto o como lista segun el caso. */
function unoDe<T>(valor: T | T[] | null): T | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : valor
}

/** La fecha de hoy en Chile, 'YYYY-MM-DD', comparable con `reservas.fecha`. */
function hoyEnChile(): string {
  // en-CA formatea como YYYY-MM-DD. La zona importa: en UTC, desde las 20:00 o
  // 21:00 de Chile ya es "mañana" y una reserva de hoy pareceria pasada.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

interface Cobrable {
  tipo: 'pedido' | 'reserva'
  id: string
  /** Lo que se cobra AHORA. Con abono, no es el precio del servicio. */
  monto: number
  /**
   * El precio efectivo cuando se cobra un abono MENOR que ese precio, o `null`
   * cuando se cobra todo (pedidos y reservas sin abono).
   *
   * Se guarda en `pagos.monto_total` (0018) para que el comprobante pueda decir
   * el saldo pendiente sin recalcularlo: el estudio edita sus precios, y un
   * comprobante de hace dos meses mostraria una deuda que nadie acordo.
   */
  montoTotal: number | null
}

/** Mismo texto y mismo codigo para "no existe" y "no es tuyo". */
const SIN_PERMISO = { error: 'No puedes pagar esto.' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS_CORS })
  if (req.method !== 'POST') return respuesta({ error: 'Metodo no permitido.' }, 405)

  const urlSupabase = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!urlSupabase || !serviceRole || !anonKey) {
    console.error('Faltan las variables que inyecta Supabase.')
    return respuesta({ error: 'La funcion no esta configurada.' }, 500)
  }

  const sitioUrl = (Deno.env.get('SITIO_URL') ?? '').trim().replace(/\/+$/, '')
  if (!sitioUrl) {
    console.error('Falta SITIO_URL: sin ella no hay URL de retorno.')
    return respuesta({ error: 'La funcion no esta configurada.' }, 500)
  }

  // --- Que se paga ----------------------------------------------------------
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await req.json()) as Record<string, unknown>
  } catch {
    return respuesta({ error: 'El cuerpo no es JSON valido.' }, 400)
  }

  const pedidoId = comoId(cuerpo.pedidoId)
  const pedidoCodigo = comoTexto(cuerpo.pedidoCodigo)
  const reservaId = comoId(cuerpo.reservaId)
  const reservaCodigo = comoTexto(cuerpo.reservaCodigo)

  const esPedido = pedidoId !== null || pedidoCodigo !== null
  const esReserva = reservaId !== null || reservaCodigo !== null

  if (esPedido === esReserva) {
    return respuesta(
      { error: 'Indica un pedido O una reserva, por su id o su codigo.' },
      400,
    )
  }

  const admin = createClient(urlSupabase, serviceRole, {
    auth: { persistSession: false },
  })

  // --- Quien lo pide --------------------------------------------------------
  // El token se valida contra el servidor de Auth: `getUser` devuelve el
  // `app_metadata` que esta en la base, no el que venga firmado en el JWT. Es la
  // diferencia entre comprobar un rol y creerselo.
  const autorizacion = req.headers.get('Authorization') ?? ''
  const token = autorizacion.toLowerCase().startsWith('bearer ')
    ? autorizacion.slice(7).trim()
    : ''

  let uid: string | null = null
  let esStaff = false
  if (token && token !== anonKey) {
    const comoVisitante = createClient(urlSupabase, anonKey, {
      auth: { persistSession: false },
    })
    const { data } = await comoVisitante.auth.getUser(token)
    if (data.user) {
      uid = data.user.id
      esStaff = (data.user.app_metadata as { es_staff?: boolean } | null)?.es_staff === true
    }
  }

  const codigoRecibido = esPedido ? pedidoCodigo : reservaCodigo
  /** Staff, dueña con sesion o quien trae el codigo. */
  const puedePagar = (fila: { codigo: string; cliente_id: string | null }): boolean =>
    esStaff ||
    (uid !== null && fila.cliente_id === uid) ||
    (codigoRecibido !== null && codigoRecibido === fila.codigo)

  // --- Se lee el monto de la base -------------------------------------------
  let cobrable: Cobrable

  if (esPedido) {
    const lectura = admin
      .from('pedidos')
      .select('id, codigo, cliente_id, total, estado')
    const { data: pedido, error } =
      await (pedidoId !== null
        ? lectura.eq('id', pedidoId)
        : lectura.eq('codigo', pedidoCodigo!)
      ).maybeSingle()

    if (error) {
      console.error('No se pudo leer el pedido:', error.message)
      return respuesta({ error: 'No se pudo leer el pedido.' }, 500)
    }
    if (!pedido || !puedePagar(pedido)) return respuesta(SIN_PERMISO, 403)

    // Un pedido ya pagado, preparandose o entregado no se vuelve a cobrar. Y uno
    // cancelado tampoco: cobrarlo dejaria dinero cobrado por algo que no se va a
    // entregar.
    if (pedido.estado !== 'pendiente_pago') {
      return respuesta(
        { error: `Este pedido no esta pendiente de pago (esta ${pedido.estado}).` },
        409,
      )
    }

    cobrable = {
      tipo: 'pedido',
      id: String(pedido.id),
      monto: Number(pedido.total),
      // El abono es una regla de los SERVICIOS. Un pedido de la tienda se paga
      // completo: no hay nada que ir a terminar de pagar al local.
      montoTotal: null,
    }
  } else {
    const lectura = admin
      .from('reservas')
      // Una sola cadena literal: concatenada, supabase-js no puede inferir el
      // tipo de la fila y la tipa como error.
      .select('id, codigo, cliente_id, estado, fecha, abono, detalles_extra, servicios ( precio_base )')
    const { data: reserva, error } =
      await (reservaId !== null
        ? lectura.eq('id', reservaId)
        : lectura.eq('codigo', reservaCodigo!)
      ).maybeSingle()

    if (error) {
      console.error('No se pudo leer la reserva:', error.message)
      return respuesta({ error: 'No se pudo leer la reserva.' }, 500)
    }
    if (!reserva || !puedePagar(reserva)) return respuesta(SIN_PERMISO, 403)

    // Una cita ya atendida o cancelada no se cobra: el dinero no compraria
    // nada. Una de un dia que ya paso tampoco, aunque siga 'pendiente': pagarla
    // no recupera la hora.
    if (reserva.estado === 'completada' || reserva.estado === 'cancelada') {
      return respuesta(
        { error: `Esta reserva ya no se puede pagar (esta ${reserva.estado}).` },
        409,
      )
    }
    if ((reserva.fecha as string) < hoyEnChile()) {
      return respuesta({ error: 'Esta reserva es de una fecha que ya paso.' }, 409)
    }

    /**
     * Precio efectivo: la variante guardada en `detalles_extra` o, sin ella, el
     * `precio_base` del servicio. Desde 0019 la variante la escribe la BASE
     * desde el catalogo (el navegador solo elige la opcion), asi que leerla aqui
     * ya no es creerle al navegador. Es la misma regla que usa el correo de
     * confirmacion, para que lo cobrado y lo anunciado no discrepen.
     *
     * `reservas.abono` tambien lo fija la base (0019), ya topado al precio
     * efectivo. > 0: se cobra el abono. 0: se cobra el precio completo.
     */
    const servicio = unoDe<{ precio_base: number }>(reserva.servicios)
    const variante = (reserva.detalles_extra as
      | { variante?: { precio?: number } }
      | null)?.variante
    const precio = Math.round(
      Number(typeof variante?.precio === 'number' ? variante.precio : (servicio?.precio_base ?? 0)),
    )
    const abono = Number(reserva.abono ?? 0)
    const monto = abono > 0 ? abono : precio

    cobrable = {
      tipo: 'reserva',
      id: String(reserva.id),
      monto,
      // Solo hay saldo que explicar si el abono es menor que el precio.
      montoTotal: monto < precio ? precio : null,
    }
  }

  // --- Monto utilizable -----------------------------------------------------
  // Transbank rechaza 0 y los negativos, y un servicio sin precio configurado
  // llegaria aqui como 0. Mejor decirlo que dejar que la pasarela responda un
  // error generico que nadie sabra interpretar.
  if (!Number.isFinite(cobrable.monto) || cobrable.monto <= 0) {
    console.error(`Monto no cobrable para ${cobrable.tipo} ${cobrable.id}: ${cobrable.monto}`)
    return respuesta({ error: 'Este cobro no tiene un monto valido.' }, 409)
  }

  // --- Nada se cobra dos veces ---------------------------------------------
  const columna = cobrable.tipo === 'pedido' ? 'pedido_id' : 'reserva_id'
  const { data: yaAutorizado, error: errorPrevio } = await admin
    .from('pagos')
    .select('id')
    .eq(columna, Number(cobrable.id))
    .eq('estado', 'autorizado')
    .limit(1)

  if (errorPrevio) {
    console.error('No se pudo revisar los pagos previos:', errorPrevio.message)
    return respuesta({ error: 'No se pudo iniciar el pago.' }, 500)
  }
  if (yaAutorizado && yaAutorizado.length > 0) {
    return respuesta({ error: 'Esto ya esta pagado.', yaPagado: true }, 409)
  }

  // --- Se registra el intento ANTES de llamar a Transbank -------------------
  // En este orden a proposito: si se llamara primero y el registro fallara
  // despues, existiria un cobro en Transbank del que no habria rastro, y el
  // commit seria imposible porque el token no estaria guardado en ninguna parte.
  const buyOrder = nuevaOrdenDeCompra(cobrable.tipo, cobrable.id)
  // Sin el `codigo`: Transbank devuelve la sesion en la URL de abandono
  // (TBK_ID_SESION), que queda en el historial y en los registros, y el codigo
  // de una reserva sin cuenta es la credencial de quien la hizo.
  const sessionId = crypto.randomUUID()

  const { data: intento, error: errorIntento } = await admin
    .from('pagos')
    .insert({
      buy_order: buyOrder,
      session_id: sessionId,
      monto: Math.round(cobrable.monto),
      monto_total: cobrable.montoTotal,
      estado: 'iniciado',
      [columna]: Number(cobrable.id),
    })
    .select('id')
    .single()

  if (errorIntento || !intento) {
    console.error('No se pudo registrar el intento:', errorIntento?.message)
    return respuesta({ error: 'No se pudo iniciar el pago.' }, 500)
  }

  // --- Transbank ------------------------------------------------------------
  /**
   * La vuelta NO apunta al sitio, sino a `webpay-retorno`.
   *
   * Transbank no vuelve siempre igual: el pago completado llega por GET, pero
   * el abandono y el timeout en integracion llegan por POST. Un sitio estatico
   * no puede atender ese POST —el hosting solo reescribe a index.html las
   * peticiones GET—, asi que apuntar aqui directamente dejaria a la clienta en
   * una pagina vacia justo despues de pagar.
   *
   * `webpay-retorno` absorbe las dos formas y rebota con un 303 a
   * `${SITIO_URL}/confirmacion-pago` con la query normalizada.
   */
  const retornoUrl = `${urlSupabase.replace(/\/+$/, '')}/functions/v1/webpay-retorno`

  try {
    const { token: tokenWs, url } = await crearTransaccion({
      buyOrder,
      sessionId,
      amount: cobrable.monto,
      returnUrl: retornoUrl,
    })

    const { error: errorToken } = await admin
      .from('pagos')
      .update({ token_ws: tokenWs })
      .eq('id', intento.id)

    if (errorToken) {
      // El cobro existe en Transbank pero no se pudo guardar su token, asi que
      // nunca se podria confirmar. Se deja el intento en 'error' y no se manda a
      // la clienta a pagar algo que quedaria colgado.
      console.error('No se pudo guardar el token:', errorToken.message)
      await admin.from('pagos').update({ estado: 'error' }).eq('id', intento.id)
      return respuesta({ error: 'No se pudo iniciar el pago.' }, 500)
    }

    // `url` y `token` son lo que el navegador tiene que enviar por POST.
    //
    // `destinoFinal` se devuelve para poder diagnosticar: es a donde acabara la
    // clienta, y depende de SITIO_URL, que es un secreto y no se puede leer de
    // otro modo. Si apunta a un puerto o a un dominio equivocado, el sintoma es
    // una pagina en blanco al volver del banco, y sin esto no habria forma de
    // verlo sin hacer una compra entera.
    return respuesta(
      {
        token: tokenWs,
        url,
        buyOrder,
        monto: Math.round(cobrable.monto),
        montoTotal: cobrable.montoTotal,
        retornoUrl,
        destinoFinal: `${sitioUrl}/confirmacion-pago`,
      },
      200,
    )
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error('Transbank no creo la transaccion:', detalle)
    await admin.from('pagos').update({ estado: 'error' }).eq('id', intento.id)
    return respuesta({ error: 'La pasarela de pago no respondio.' }, 502)
  }
})
