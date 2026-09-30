// ============================================================================
// NuraVision · Edge Function · enviar-confirmacion-reserva
// ============================================================================
// Envia el correo de confirmacion de una reserva.
//
// ----------------------------------------------------------------------------
// LA DECISION QUE MANDA SOBRE TODO LO DEMAS: NO SE CONFIA EN EL CUERPO
// ----------------------------------------------------------------------------
// La peticion trae SOLO el id de la reserva. El nombre, el correo de destino, el
// servicio, la hora y el precio se leen de la base con la service_role key.
//
// Lo natural seria que el frontend —que ya tiene esos datos en pantalla— los
// mandara y ahorrar la consulta. Seria un agujero: esta funcion se invoca desde
// el navegador con la anon key, que es publica, de modo que cualquiera podria
// pedirle que enviara un correo con el texto que quisiera a la direccion que
// quisiera, firmado por el estudio. Leyendo de la base, lo unico que un atacante
// controla es CUAL reserva se confirma, no que dice el correo ni a donde va.
//
// ----------------------------------------------------------------------------
// Y QUIEN PUEDE PEDIRLO
// ----------------------------------------------------------------------------
// Tres caminos, porque hay tres situaciones legitimas:
//
//   · La clienta con sesion: su `auth.uid()` coincide con `cliente_id`.
//   · El personal del estudio: `es_staff` en su `app_metadata`.
//   · Quien reservo SIN cuenta: no tiene sesion que cruzar, asi que prueba que
//     la reserva es suya con el `codigo`, que solo aparece en su pantalla de
//     confirmacion. Sin esta via, las reservas de invitada no podrian recibir
//     correo, que es justo cuando mas falta hace.
//
// ----------------------------------------------------------------------------
// UN SOLO CORREO POR RESERVA, SIEMPRE
// ----------------------------------------------------------------------------
// Antes de llamar al proveedor se RECLAMA el envio con un UPDATE condicional
// sobre `confirmacion_enviada_en` (0012). Si no toca ninguna fila, otro lo
// reclamo ya y esta llamada no envia nada.
//
// Es lo que impide que la funcion sirva para bombardear a alguien a correos, y
// de paso la vuelve idempotente: se puede invocar desde el frontend y desde un
// webhook de la base sin que llegue dos veces.
//
// Si el proveedor falla, la marca se LIBERA para que un reintento funcione.
// Queda una ventana: si el proceso muere entre el envio y la liberacion, la
// reserva queda marcada sin correo. Se prefiere ese fallo —visible en la
// columna, y corregible a mano— al de mandar correos repetidos.
//
// ----------------------------------------------------------------------------
// DESPLIEGUE Y CONFIGURACION
// ----------------------------------------------------------------------------
//   supabase functions deploy enviar-confirmacion-reserva
//
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//   supabase secrets set CORREO_REMITENTE="Estudio Nura <hola@tudominio.cl>"
//   supabase secrets set SITIO_URL=https://tudominio.cl
//   supabase secrets set ESTUDIO_DIRECCION="Av. Ejemplo 123, Viña del Mar"
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase; no se declaran.
//
// El remitente tiene que ser de un dominio verificado en el proveedor. Sin
// verificar, Resend solo deja enviar a la direccion de la cuenta, que sirve para
// probar y no para produccion.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { construirCorreo, type DatosConfirmacion } from './plantilla.ts'

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

interface Peticion {
  /** id de `reservas`. Es lo UNICO que se acepta como dato de la reserva. */
  reservaId: number | string
  /**
   * Codigo visible, para las reservas sin cuenta. Es la unica prueba de que la
   * reserva es de quien la pide cuando no hay sesion que cruzar.
   */
  codigo?: string
}

/**
 * Envio a traves de Resend.
 *
 * Aislado en una funcion para que cambiar de proveedor —a SMTP con Nodemailer, o
 * a otro API— sea reescribir esto y nada mas. Se eligio un API sobre HTTPS y no
 * SMTP porque una Edge Function corre en Deno Deploy, donde no hay conexiones
 * TCP salientes arbitrarias: un cliente SMTP no funcionaria.
 */
async function enviarConResend(
  apiKey: string,
  remitente: string,
  destinatario: string,
  correo: { asunto: string; html: string; texto: string },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const respuestaApi = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: remitente,
      to: [destinatario],
      subject: correo.asunto,
      html: correo.html,
      // La alternativa en texto plano no es un adorno: hay clientes que no
      // muestran HTML, y enviar solo HTML empeora la reputacion de envio.
      text: correo.texto,
    }),
  })

  if (respuestaApi.ok) return { ok: true }

  // El cuerpo del error del proveedor es lo unico que explica por que rechazo el
  // envio (dominio sin verificar, clave invalida, destinatario bloqueado). Se
  // propaga tal cual: inventarle un mensaje generico obligaria a mirar sus
  // registros para averiguar algo que ya venia dicho.
  const detalle = await respuestaApi.text().catch(() => '')
  return { ok: false, motivo: `El proveedor rechazo el envio (${respuestaApi.status}): ${detalle}` }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS_CORS })
  if (req.method !== 'POST') return respuesta({ error: 'Solo se admite POST.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const remitente = Deno.env.get('CORREO_REMITENTE')
  const sitioUrl = Deno.env.get('SITIO_URL')

  if (!url || !anonKey || !serviceKey) {
    return respuesta({ error: 'La funcion no esta configurada en el servidor.' }, 500)
  }
  if (!apiKey || !remitente || !sitioUrl) {
    // Se distingue de un fallo de permisos y se nombra lo que falta: es un
    // problema de despliegue, y confundirlo manda a buscar donde no esta.
    return respuesta(
      {
        error:
          'Falta configuracion del correo. Define RESEND_API_KEY, CORREO_REMITENTE y SITIO_URL ' +
          'con «supabase secrets set».',
      },
      500,
    )
  }

  /**
   * La direccion del estudio NO esta escrita en el codigo.
   *
   * En el repositorio no hay ninguna: lo unico que existe es "Viña del Mar" como
   * pie de una foto. Inventar una calle en un correo que la clienta va a usar
   * para llegar seria mandarla a un sitio equivocado, asi que se deja la ciudad
   * como respaldo honesto hasta que se configure la real.
   */
  const direccion = Deno.env.get('ESTUDIO_DIRECCION') ?? 'Viña del Mar'

  // --- Quien llama ---------------------------------------------------------
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (token === '') return respuesta({ error: 'Falta la sesion.' }, 401)

  const comoVisitante = createClient(url, anonKey)
  const { data: quien } = await comoVisitante.auth.getUser(token)
  // `quien.user` es null cuando el token es la propia anon key, que es el caso
  // de una reserva de invitada. No es un error: esa via se autoriza con el
  // codigo, mas abajo.
  const usuario = quien?.user ?? null

  // --- Que se pide --------------------------------------------------------
  let cuerpo: Peticion
  try {
    cuerpo = await req.json()
  } catch {
    return respuesta({ error: 'El cuerpo de la peticion no es JSON valido.' }, 400)
  }

  const reservaId = Number(cuerpo.reservaId)
  if (!Number.isInteger(reservaId) || reservaId <= 0) {
    return respuesta({ error: 'Falta el identificador de la reserva.' }, 400)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  /**
   * Se traen tambien el nombre del servicio y de la profesional en la MISMA
   * consulta, por las claves foraneas. Tres consultas sueltas multiplicarian la
   * latencia de una funcion que corre mientras alguien espera.
   */
  const { data: reserva, error: errorLectura } = await admin
    .from('reservas')
    .select(
      'id, codigo, cliente_id, cliente_nombre, cliente_email, fecha, hora_inicio, ' +
        'detalles_extra, confirmacion_enviada_en, ' +
        'servicios ( nombre, precio_base ), profesionales ( nombre )',
    )
    .eq('id', reservaId)
    .maybeSingle()

  if (errorLectura) {
    return respuesta({ error: `No se pudo leer la reserva: ${errorLectura.message}` }, 500)
  }
  if (!reserva) return respuesta({ error: 'La reserva no existe.' }, 404)

  // --- Autorizacion -------------------------------------------------------
  const esDuenia = usuario !== null && reserva.cliente_id === usuario.id
  const marcaStaff = String(usuario?.app_metadata?.es_staff ?? '').toLowerCase()
  const esStaff = ['true', 't', '1'].includes(marcaStaff)
  // El codigo se compara completo y sin distinguir mayusculas, que es como la
  // clienta lo va a copiar de la pantalla.
  const codigoCoincide =
    typeof cuerpo.codigo === 'string' &&
    cuerpo.codigo.trim() !== '' &&
    cuerpo.codigo.trim().toUpperCase() === reserva.codigo.toUpperCase()

  if (!esDuenia && !esStaff && !codigoCoincide) {
    return respuesta({ error: 'No tienes permiso para enviar esta confirmacion.' }, 403)
  }

  if (!reserva.cliente_email) {
    return respuesta({ error: 'La reserva no tiene correo de contacto.' }, 400)
  }

  // --- Reclamar el envio --------------------------------------------------
  // El `is null` es lo que hace la reclamacion atomica: si dos llamadas llegan a
  // la vez, solo una toca la fila y la otra recibe cero filas.
  const { data: reclamada, error: errorReclamo } = await admin
    .from('reservas')
    .update({ confirmacion_enviada_en: new Date().toISOString() })
    .eq('id', reservaId)
    .is('confirmacion_enviada_en', null)
    .select('id')

  if (errorReclamo) {
    return respuesta({ error: `No se pudo registrar el envio: ${errorReclamo.message}` }, 500)
  }
  if (!reclamada || reclamada.length === 0) {
    // No es un error: la confirmacion ya salio. Se responde 200 para que quien
    // llama —el frontend o un webhook— no lo trate como un fallo ni reintente.
    return respuesta({ yaEnviada: true }, 200)
  }

  // --- Armar y enviar -----------------------------------------------------
  // PostgREST devuelve las relaciones como objeto o como lista segun la
  // cardinalidad que deduzca del esquema; se acepta cualquiera de las dos en vez
  // de depender de esa inferencia.
  const unoDe = <T,>(valor: T | T[] | null): T | null =>
    Array.isArray(valor) ? (valor[0] ?? null) : valor

  const servicio = unoDe(reserva.servicios as { nombre: string; precio_base: number } | null)
  const profesional = unoDe(reserva.profesionales as { nombre: string } | null)

  const variante = (reserva.detalles_extra as { variante?: { etiqueta?: string; precio?: number } } | null)
    ?.variante

  const datos: DatosConfirmacion = {
    clienteNombre: reserva.cliente_nombre,
    codigo: reserva.codigo,
    servicioNombre: servicio?.nombre ?? 'Servicio',
    varianteEtiqueta: typeof variante?.etiqueta === 'string' ? variante.etiqueta : null,
    profesionalNombre: profesional?.nombre ?? 'el equipo',
    fecha: reserva.fecha,
    // Postgres devuelve `time` con segundos; el correo muestra "15:30".
    horaInicio: reserva.hora_inicio.slice(0, 5),
    /**
     * El precio ACORDADO manda sobre el vigente: si la reserva guardo una
     * variante, es lo unico que quedo escrito de lo que se cobra. `reservas` no
     * tiene columna de precio propia, asi que para los servicios sin variantes
     * esto sigue siendo el precio de hoy.
     */
    precio: typeof variante?.precio === 'number' ? variante.precio : (servicio?.precio_base ?? 0),
    direccion,
    sitioUrl,
  }

  const correo = construirCorreo(datos)
  const envio = await enviarConResend(apiKey, remitente, reserva.cliente_email, correo)

  if (!envio.ok) {
    // Se LIBERA la reclamacion para que un reintento pueda enviar. Si esta
    // liberacion fallara, la reserva queda marcada sin correo: es visible en la
    // columna y se corrige a mano, que es mejor que repetir envios.
    await admin
      .from('reservas')
      .update({ confirmacion_enviada_en: null })
      .eq('id', reservaId)

    return respuesta({ error: envio.motivo }, 502)
  }

  return respuesta({ enviada: true, destinatario: reserva.cliente_email }, 200)
})
