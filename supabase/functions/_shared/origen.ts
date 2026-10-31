// ============================================================================
// De donde vuelve la clienta despues de pagar
// ============================================================================
// Lo comparten `webpay-crear-transaccion` y `webpay-retorno`. Resuelve una sola
// pregunta: a que sitio hay que devolver a la clienta al salir del banco.
//
// ----------------------------------------------------------------------------
// EL PROBLEMA QUE ARREGLA
// ----------------------------------------------------------------------------
// El destino se tomaba de `SITIO_URL`, un secreto fijo. Puesto en
// `http://localhost:5173` para probar en local, TODAS las vueltas del banco
// acababan en localhost — incluidas las de otros computadores, donde no hay
// nada escuchando en ese puerto. Es lo que fallo en la presentacion.
//
// Ahora el origen se deriva de la peticion, asi que el mismo despliegue sirve
// en local, en una IP de la red y en una URL publica sin cambiar ningun secreto.
//
// ----------------------------------------------------------------------------
// POR QUE NO BASTA CON LEER LA CABECERA `Origin`
// ----------------------------------------------------------------------------
// Porque seria un OPEN REDIRECT, y de los caros. Estas funciones se invocan con
// la anon key, que es publica: cualquiera podria mandar
// `Origin: https://sitio-falso.cl` y conseguir que el banco devolviera a la
// clienta —con su `token_ws` en la URL— a una pagina ajena. Ahi se le puede
// mostrar un comprobante falso, o pedirle "de nuevo" los datos de la tarjeta.
//
// Por eso el origen se comprueba contra una LISTA BLANCA (`ORIGENES_PERMITIDOS`)
// y lo que no esta en ella se descarta en favor de `SITIO_URL`. La cabecera
// elige entre destinos que ya autorizamos; no puede inventar uno.
// ============================================================================

/** Normaliza un origen: minusculas, sin barra final. '' si no es utilizable. */
function normalizar(valor: string | null | undefined): string {
  const texto = (valor ?? '').trim()
  if (texto === '') return ''
  try {
    // `new URL` valida de verdad y descarta la ruta: de `https://x.cl/a?b` deja
    // `https://x.cl`. Asi la comparacion es siempre entre origenes.
    const u = new URL(texto)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.origin.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Convierte una entrada de la lista en una comprobacion.
 *
 * Se admite `*` como comodin dentro de la entrada —`http://192.168.*.*:5173`—
 * porque las demos en la red local cambian de IP y pedir la exacta cada vez
 * seria inusable. Todo lo demas se escapa, de modo que un punto es un punto y no
 * "cualquier caracter".
 *
 * Una entrada que sea SOLO comodines se rechaza: eso es exactamente el open
 * redirect que la lista existe para impedir.
 */
function coincide(entrada: string, origen: string): boolean {
  const patron = entrada.trim().toLowerCase().replace(/\/+$/, '')
  if (patron === '') return false
  if (/^[*\s:/.]+$/.test(patron)) {
    console.error(`ORIGENES_PERMITIDOS: se ignora la entrada "${entrada}" por ser un comodin total.`)
    return false
  }

  const regex = new RegExp(
    '^' + patron.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '[^/]*' : `\\${c}`)) + '$',
  )
  return regex.test(origen)
}

/** La lista blanca, con `SITIO_URL` incluida siempre. */
function permitidos(): string[] {
  const lista = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '')

  const porDefecto = normalizar(Deno.env.get('SITIO_URL'))
  // `SITIO_URL` se autoriza sola: es el destino que el proyecto ya declaraba, y
  // obligar a repetirla en la lista solo serviria para olvidarla.
  return porDefecto ? [...lista, porDefecto] : lista
}

/** El destino de reserva cuando no hay nada de fiar en la peticion. */
export function origenPorDefecto(): string {
  return normalizar(Deno.env.get('SITIO_URL'))
}

/**
 * Comprueba un origen contra la lista blanca.
 *
 * Devuelve el origen normalizado si esta autorizado, o `''` si no. No cae solo
 * al valor por defecto: quien llama decide, y asi puede registrar el descarte.
 */
export function origenAutorizado(valor: string | null | undefined): string {
  const origen = normalizar(valor)
  if (origen === '') return ''
  return permitidos().some((p) => coincide(p, origen)) ? origen : ''
}

/**
 * De donde viene la peticion del navegador.
 *
 * Se prueban tres fuentes en orden. `Origin` es la buena: el navegador la pone
 * solo en las peticiones a otro origen —y estas funciones siempre lo son— y no
 * se puede falsear desde una pagina. `Referer` cubre los proxys que borran
 * `Origin`. El cuerpo es el ultimo recurso, para entornos que recortan las dos
 * cabeceras.
 *
 * Las tres pasan por la lista blanca, asi que el orden solo decide cual se
 * prefiere entre destinos ya autorizados.
 */
export function origenDeLaPeticion(req: Request, origenDelCuerpo?: unknown): string {
  const candidatos = [
    req.headers.get('Origin'),
    req.headers.get('Referer'),
    typeof origenDelCuerpo === 'string' ? origenDelCuerpo : null,
  ]

  for (const candidato of candidatos) {
    const autorizado = origenAutorizado(candidato)
    if (autorizado !== '') return autorizado
  }

  const descartado = normalizar(req.headers.get('Origin') ?? req.headers.get('Referer'))
  if (descartado !== '') {
    // Se registra porque es el sintoma de una demo mal configurada: el origen
    // llego bien pero nadie lo autorizo, y la clienta acabara en SITIO_URL.
    console.error(
      `Origen no autorizado: ${descartado}. Agregalo a ORIGENES_PERMITIDOS si la demo es legitima.`,
    )
  }
  return ''
}

// ----------------------------------------------------------------------------
// Llevar el origen hasta la vuelta
// ----------------------------------------------------------------------------
// Entre crear el cobro y volver del banco no hay sesion ni estado: lo unico que
// Transbank devuelve es el token. Asi que el origen viaja dentro de la propia
// `return_url`, codificado en SU RUTA.
//
// EN LA RUTA Y NO EN LA QUERY, a proposito: Transbank agrega `?token_ws=...` al
// volver, y una `return_url` que ya trajera `?origen=...` depende de que lo
// concatene con `&`. Si usara `?` otra vez, la URL quedaria malformada y se
// perderia el token, que es justo lo que no se puede perder. La ruta no tiene
// ese problema. Comprobado que Supabase entrega a la funcion las subrutas.
//
// Al volver se REVALIDA contra la lista blanca, de modo que manipular este
// fragmento no sirve de nada: solo permite elegir un destino ya autorizado.

/** Mete el origen en la ruta de la URL de retorno. */
export function rutaConOrigen(base: string, origen: string): string {
  if (origen === '') return base
  // base64url: sin `+`, `/` ni `=`, que en una ruta obligarian a escapar.
  const codificado = btoa(origen).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${base.replace(/\/+$/, '')}/${codificado}`
}

/** Saca el origen de la ruta, ya revalidado. '' si no hay o no esta permitido. */
export function origenDeLaRuta(url: string): string {
  let ruta: string
  try {
    ruta = new URL(url).pathname
  } catch {
    return ''
  }

  // El ultimo segmento, si lo hay despues del nombre de la funcion.
  const segmentos = ruta.split('/').filter((s) => s !== '')
  const ultimo = segmentos[segmentos.length - 1] ?? ''
  if (ultimo === '' || ultimo === 'webpay-retorno') return ''

  try {
    const normalizado = ultimo.replace(/-/g, '+').replace(/_/g, '/')
    // atob exige que el largo sea multiplo de 4; se repone el relleno quitado.
    const relleno = normalizado.length % 4 === 0 ? '' : '='.repeat(4 - (normalizado.length % 4))
    return origenAutorizado(atob(normalizado + relleno))
  } catch {
    return ''
  }
}
