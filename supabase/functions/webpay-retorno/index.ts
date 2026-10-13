// ============================================================================
// NuraVision · Edge Function · webpay-retorno
// ============================================================================
// La `return_url` que recibe Transbank. Su unico trabajo es rebotar al sitio
// con los parametros en la query. No confirma nada ni toca la base.
//
// ----------------------------------------------------------------------------
// POR QUE HACE FALTA ESTE SALTO
// ----------------------------------------------------------------------------
// Transbank no vuelve siempre igual, y la diferencia rompe una SPA:
//
//   · Pago completado (aprobado o rechazado): GET con `token_ws`.
//   · Abandono y TIMEOUT en integracion: POST con `TBK_TOKEN`,
//     `TBK_ORDEN_COMPRA` y `TBK_ID_SESION`.
//   · Abandono en produccion: GET con los mismos TBK_*.
//   · Timeout: NO manda ningun token, solo la orden y la sesion.
//
// Un sitio estatico no puede atender el POST: el servidor de desarrollo y el
// hosting solo reescriben a `index.html` las peticiones GET, asi que un POST a
// /confirmacion-pago devuelve un 404 y el navegador muestra una pagina vacia.
//
// Aqui se absorben las cuatro formas y se sale SIEMPRE con una redireccion 303 a
// un GET con la query normalizada. La pantalla del sitio no tiene que saber nada
// de esto, y el caso del timeout —sin token— llega identificado en vez de como
// una URL vacia.
//
// Se usa 303 y no 302 a proposito: 303 obliga al navegador a convertir el POST
// en GET. Con 302 algunos navegadores reenvian el POST al destino y el problema
// vuelve.
//
// ----------------------------------------------------------------------------
// DESPLIEGUE
// ----------------------------------------------------------------------------
//   supabase functions deploy webpay-retorno --no-verify-jwt
//
// `--no-verify-jwt` ES IMPRESCINDIBLE: a esta URL llega el navegador de la
// clienta viniendo del banco, sin cabecera Authorization. Con la verificacion
// puesta, Supabase responderia 401 y la clienta veria un error en vez de su
// comprobante.
//
// No recibe ni expone nada sensible: solo traslada un token que despues hay que
// validar contra Transbank, y por eso abrirla no supone riesgo.
// ============================================================================

const CLAVES = ['token_ws', 'TBK_TOKEN', 'TBK_ORDEN_COMPRA', 'TBK_ID_SESION'] as const

/** Saca los parametros de Webpay vengan en la query o en el cuerpo del POST. */
async function parametros(req: Request): Promise<URLSearchParams> {
  const salida = new URLSearchParams()
  const url = new URL(req.url)

  for (const clave of CLAVES) {
    const valor = url.searchParams.get(clave)
    if (valor !== null && valor.trim() !== '') salida.set(clave, valor.trim())
  }

  if (req.method === 'POST') {
    try {
      // Transbank envia un formulario. Se admite tambien JSON por si se prueba
      // la funcion a mano.
      const tipo = req.headers.get('content-type') ?? ''
      if (tipo.includes('json')) {
        const cuerpo = (await req.json()) as Record<string, unknown>
        for (const clave of CLAVES) {
          const valor = cuerpo[clave]
          if (typeof valor === 'string' && valor.trim() !== '') salida.set(clave, valor.trim())
        }
      } else {
        const form = await req.formData()
        for (const clave of CLAVES) {
          const valor = form.get(clave)
          if (typeof valor === 'string' && valor.trim() !== '') salida.set(clave, valor.trim())
        }
      }
    } catch (e: unknown) {
      // Un cuerpo ilegible no debe dejar a la clienta en una pagina de error: se
      // rebota igual y la pantalla dira que no hay nada que confirmar.
      console.error('No se pudo leer el cuerpo del retorno:', e)
    }
  }

  return salida
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    })
  }

  const sitioUrl = (Deno.env.get('SITIO_URL') ?? '').trim().replace(/\/+$/, '')
  if (!sitioUrl) {
    console.error('Falta SITIO_URL: no hay a donde devolver a la clienta.')
    return new Response(
      'No podemos volver al sitio: falta configurar SITIO_URL.',
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  const params = await parametros(req)
  const destino = `${sitioUrl}/confirmacion-pago${params.toString() ? `?${params}` : ''}`

  return new Response(null, {
    status: 303,
    headers: {
      Location: destino,
      // Que no quede en cache: la siguiente compra trae otro token.
      'Cache-Control': 'no-store',
    },
  })
})
