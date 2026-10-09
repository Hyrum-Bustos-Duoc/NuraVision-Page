// ============================================================================
// Cliente de la API REST de Transbank · Webpay Plus
// ============================================================================
// Lo comparten `webpay-crear-transaccion` y `webpay-confirmar-transaccion`. Va
// en `_shared/` y no duplicado en cada funcion por una razon concreta: si las
// dos tuvieran su propia copia, una podria apuntar al entorno de integracion y
// la otra al de produccion. Se crearia el cobro en un sitio y se confirmaria en
// otro, y el pago quedaria colgado sin que nada lo delate.
//
// ----------------------------------------------------------------------------
// COMO FUNCIONA WEBPAY PLUS, EN TRES PASOS
// ----------------------------------------------------------------------------
//   1. POST /transactions  -> Transbank devuelve { token, url }.
//   2. El NAVEGADOR va a esa `url` con el token. Tiene que ser un POST de
//      formulario con el campo `token_ws`; una redireccion GET no sirve.
//   3. Transbank devuelve a la clienta a nuestra `return_url` con el token, y
//      ahi se hace PUT /transactions/{token} para cerrar el cobro (commit).
//
// EL PASO 3 ES OBLIGATORIO. Sin commit, Transbank reversa la operacion: la
// clienta ve el cargo un rato y luego desaparece. "Pago aprobado" significa
// commit hecho con response_code 0, no que el formulario se completara.
//
// ----------------------------------------------------------------------------
// EL COMMIT SE PUEDE HACER UNA SOLA VEZ
// ----------------------------------------------------------------------------
// Un segundo PUT sobre el mismo token responde con error, no con el resultado
// anterior. Por eso quien llama tiene que reclamar el intento en la base antes
// de llamar aqui (`pagos.confirmado_en`, ver 0015) y guardar la respuesta: es
// la unica oportunidad de leerla.
// ============================================================================

/** Entorno de Transbank. Cambia la URL base y las credenciales. */
export type EntornoTransbank = 'integracion' | 'produccion'

const BASE: Record<EntornoTransbank, string> = {
  integracion: 'https://webpay3gint.transbank.cl',
  produccion: 'https://webpay3g.transbank.cl',
}

const RUTA = '/rswebpaytransaction/api/webpay/v1.0/transactions'

/**
 * Credenciales publicas del entorno de INTEGRACION de Transbank.
 *
 * No son un secreto filtrado: Transbank las publica en su documentacion y en
 * todos sus SDK, son las mismas para cualquiera que integre, y solo funcionan
 * contra webpay3gint, donde no existe dinero real. Estan aqui como valor por
 * defecto para que la integracion se pueda probar sin configurar nada.
 *
 * En produccion NO hay valor por defecto: si falta cualquiera de las dos
 * variables, `configuracion()` se niega a seguir. Caer de vuelta a estas
 * credenciales en produccion seria mandar cobros reales al entorno de pruebas.
 */
const INTEGRACION_CODIGO_COMERCIO = '597055555532'
const INTEGRACION_API_KEY =
  '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C'

export interface ConfiguracionTransbank {
  entorno: EntornoTransbank
  codigoComercio: string
  apiKey: string
  base: string
}

/**
 * Lee la configuracion del entorno.
 *
 * `WEBPAY_ENTORNO` manda: cualquier valor distinto de 'produccion' se trata
 * como integracion. Es el valor seguro por defecto — equivocarse hacia
 * integracion no cobra a nadie; equivocarse hacia produccion, si.
 */
export function configuracion(): ConfiguracionTransbank {
  const entorno: EntornoTransbank =
    (Deno.env.get('WEBPAY_ENTORNO') ?? '').trim().toLowerCase() === 'produccion'
      ? 'produccion'
      : 'integracion'

  const codigoComercio = (Deno.env.get('WEBPAY_CODIGO_COMERCIO') ?? '').trim()
  const apiKey = (Deno.env.get('WEBPAY_API_KEY') ?? '').trim()

  if (entorno === 'produccion') {
    if (!codigoComercio || !apiKey) {
      throw new Error(
        'Falta WEBPAY_CODIGO_COMERCIO o WEBPAY_API_KEY. En produccion no se ' +
          'usan las credenciales de prueba.',
      )
    }
  }

  return {
    entorno,
    codigoComercio: codigoComercio || INTEGRACION_CODIGO_COMERCIO,
    apiKey: apiKey || INTEGRACION_API_KEY,
    base: BASE[entorno],
  }
}

function cabeceras(cfg: ConfiguracionTransbank): HeadersInit {
  return {
    'Tbk-Api-Key-Id': cfg.codigoComercio,
    'Tbk-Api-Key-Secret': cfg.apiKey,
    'Content-Type': 'application/json',
  }
}

/**
 * Saca el motivo de un fallo de la API.
 *
 * Transbank responde los errores como `{ error_message: "..." }`, pero no
 * siempre: un 502 del balanceador llega como HTML. Se intenta leer el JSON y se
 * cae al texto crudo, recortado, porque un volcado de HTML en los registros no
 * ayuda a nadie.
 */
async function motivo(res: Response): Promise<string> {
  const texto = await res.text()
  try {
    const cuerpo = JSON.parse(texto) as { error_message?: string }
    if (typeof cuerpo.error_message === 'string' && cuerpo.error_message) {
      return cuerpo.error_message
    }
  } catch {
    // No era JSON.
  }
  return texto.slice(0, 200) || `HTTP ${res.status}`
}

export interface TransaccionCreada {
  token: string
  url: string
}

/**
 * Paso 1: crea la transaccion.
 *
 * `amount` va en pesos enteros. El CLP no tiene decimales y Transbank rechaza
 * un monto fraccionado, asi que se redondea aqui antes de enviarlo en vez de
 * dejar que la API lo rechace con un mensaje generico.
 */
export async function crearTransaccion(datos: {
  buyOrder: string
  sessionId: string
  amount: number
  returnUrl: string
}): Promise<TransaccionCreada> {
  const cfg = configuracion()

  const res = await fetch(`${cfg.base}${RUTA}`, {
    method: 'POST',
    headers: cabeceras(cfg),
    body: JSON.stringify({
      buy_order: datos.buyOrder,
      session_id: datos.sessionId,
      amount: Math.round(datos.amount),
      return_url: datos.returnUrl,
    }),
  })

  if (!res.ok) {
    throw new Error(`Transbank rechazo la creacion: ${await motivo(res)}`)
  }

  const cuerpo = (await res.json()) as Partial<TransaccionCreada>
  if (!cuerpo.token || !cuerpo.url) {
    throw new Error('Transbank no devolvio token y url.')
  }
  return { token: cuerpo.token, url: cuerpo.url }
}

/** La respuesta del commit, tal como la documenta Transbank. */
export interface RespuestaCommit {
  vci?: string
  amount?: number
  status?: string
  buy_order?: string
  session_id?: string
  card_detail?: { card_number?: string }
  accounting_date?: string
  transaction_date?: string
  authorization_code?: string
  payment_type_code?: string
  response_code?: number
  installments_number?: number
}

/**
 * Paso 3: confirma (commit) la transaccion.
 *
 * Solo se puede llamar UNA VEZ por token. Quien llama tiene que haber reclamado
 * antes el intento en la base.
 */
export async function confirmarTransaccion(token: string): Promise<RespuestaCommit> {
  const cfg = configuracion()

  const res = await fetch(`${cfg.base}${RUTA}/${encodeURIComponent(token)}`, {
    method: 'PUT',
    headers: cabeceras(cfg),
  })

  if (!res.ok) {
    throw new Error(`Transbank rechazo la confirmacion: ${await motivo(res)}`)
  }

  return (await res.json()) as RespuestaCommit
}

/**
 * Si el cobro quedo autorizado.
 *
 * Se exigen LAS DOS condiciones. `response_code === 0` es el codigo de
 * aprobacion y `status === 'AUTHORIZED'` el estado de la transaccion; mirar solo
 * una deja pasar casos que Transbank considera no aprobados, y de eso depende
 * que se marque un pedido como pagado.
 */
export function fueAprobada(r: RespuestaCommit): boolean {
  return r.response_code === 0 && r.status === 'AUTHORIZED'
}

/**
 * Orden de compra para un intento.
 *
 * Transbank limita `buy_order` a 26 caracteres y rechaza una orden repetida, de
 * modo que no se puede usar el codigo del pedido tal cual: un reintento tras una
 * tarjeta rechazada chocaria. Se compone del tipo, el identificador y un sufijo
 * aleatorio, y se recorta por si el identificador creciera.
 */
export function nuevaOrdenDeCompra(tipo: 'pedido' | 'reserva', id: string): string {
  const sufijo = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${tipo === 'pedido' ? 'PD' : 'RS'}${id}-${sufijo}`.slice(0, 26)
}
