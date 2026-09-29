// ============================================================================
// NuraVision · Edge Function · admin-cuentas
// ============================================================================
// Crea y elimina cuentas de acceso. Existe porque estas dos operaciones no se
// pueden hacer desde el navegador, y conviene entender por que antes de tocarla:
//
//   · `auth.admin.createUser` y `auth.admin.deleteUser` exigen la service_role
//     key, que salta TODAS las politicas de Row Level Security. Esa clave no
//     puede viajar al navegador: el bundle es publico y cualquiera la extraeria.
//     Aqui vive como secreto del proyecto, en el servidor, y nunca en el
//     repositorio.
//
//   · `signUp` si funciona desde el navegador, pero crea sesion: daria de alta
//     a la profesional Y dejaria al administrador fuera de la suya. No sirve.
//
// ----------------------------------------------------------------------------
// DESPLIEGUE (hay que hacerlo a mano una vez)
// ----------------------------------------------------------------------------
//   supabase functions deploy admin-cuentas
//
// La clave NO hace falta declararla: Supabase inyecta SUPABASE_URL,
// SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY en el entorno de toda Edge
// Function. Si alguna vez las renombran, se declaran con:
//
//   supabase secrets set NOMBRE=valor
//
// Mientras no este desplegada, el panel recibe un 404 y lo explica en pantalla.
//
// ----------------------------------------------------------------------------
// QUIEN PUEDE LLAMARLA
// ----------------------------------------------------------------------------
// Solo el personal del estudio, y la comprobacion NO se hace con lo que diga el
// cuerpo de la peticion. El JWT que llega se canjea contra Supabase con la anon
// key (`getUser`), y el `app_metadata` que se mira es el que devuelve el
// servidor, no el que el cliente afirme tener. `app_metadata` ademas solo se
// escribe con la service_role key, asi que nadie se asciende solo.
//
// Sin esta puerta, la funcion seria un agujero mucho peor que el que evita:
// cualquiera con la anon key —que es publica— podria crear cuentas.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

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

/** Lo que acepta la funcion. Se valida a mano: el cuerpo llega de fuera. */
interface Peticion {
  accion: 'crear' | 'eliminar'
  /** crear: correo de la cuenta nueva. */
  email?: string
  /** crear: contrasenia inicial. */
  password?: string
  /** crear: que puede hacer la cuenta. Por omision, 'cliente'. */
  rol?: 'cliente' | 'profesional' | 'admin'
  /** crear: ficha de `profesionales` a la que se vincula, si rol = 'profesional'. */
  profesionalId?: number
  /** crear: nombre y telefono, que van a user_metadata y de ahi a `perfiles`. */
  nombre?: string
  telefono?: string
  /** eliminar: uuid de la cuenta. */
  userId?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS_CORS })
  if (req.method !== 'POST') return respuesta({ error: 'Solo se admite POST.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !anonKey || !serviceKey) {
    // Se distingue de un fallo de permisos a proposito: es un problema de
    // despliegue, y confundirlo con "no tienes permiso" manda a buscar donde no
    // esta.
    return respuesta({ error: 'La funcion no esta configurada en el servidor.' }, 500)
  }

  // --- Quien llama ---------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') ?? ''
  const token = autorizacion.replace(/^Bearer\s+/i, '')
  if (token === '') return respuesta({ error: 'Falta la sesion.' }, 401)

  const comoVisitante = createClient(url, anonKey)
  const { data: quien, error: errorSesion } = await comoVisitante.auth.getUser(token)

  if (errorSesion || !quien.user) {
    return respuesta({ error: 'La sesion no es valida.' }, 401)
  }

  // Mismo criterio que `public.es_staff()` en 0006/0007: se acepta solo lo que
  // de verdad significa verdadero. Ante la duda, se niega.
  const marca = String(quien.user.app_metadata?.es_staff ?? '').toLowerCase()
  if (!['true', 't', '1'].includes(marca)) {
    return respuesta({ error: 'Se requieren permisos de personal del estudio.' }, 403)
  }

  // --- Que se pide --------------------------------------------------------
  let cuerpo: Peticion
  try {
    cuerpo = await req.json()
  } catch {
    return respuesta({ error: 'El cuerpo de la peticion no es JSON valido.' }, 400)
  }

  const admin = createClient(url, serviceKey, {
    // Una funcion sin navegador no tiene donde guardar una sesion, y no la
    // necesita: cada llamada trae la suya.
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (cuerpo.accion === 'crear') {
    const email = (cuerpo.email ?? '').trim().toLowerCase()
    const password = cuerpo.password ?? ''
    const rol = cuerpo.rol ?? 'cliente'
    const profesionalId = cuerpo.profesionalId

    if (email === '' || !email.includes('@')) {
      return respuesta({ error: 'El correo no es valido.' }, 400)
    }
    // El minimo de Supabase son 6 caracteres; se comprueba aqui para devolver un
    // mensaje en castellano en vez del suyo.
    if (password.length < 6) {
      return respuesta({ error: 'La contrasenia debe tener al menos 6 caracteres.' }, 400)
    }
    if (!['cliente', 'profesional', 'admin'].includes(rol)) {
      return respuesta({ error: 'El rol no es valido.' }, 400)
    }
    // Una cuenta de profesional SIN ficha entraria a su panel y no encontraria
    // nada: la politica de 0007 cruza `profesional_id` con las reservas, y sin
    // marca no devuelve ni una fila. Es mejor no crearla que crearla a medias.
    if (rol === 'profesional' && (typeof profesionalId !== 'number' || !Number.isInteger(profesionalId))) {
      return respuesta({ error: 'Una cuenta de profesional necesita su ficha vinculada.' }, 400)
    }

    /**
     * Solo va a `app_metadata` lo que corresponde al rol, y nada mas.
     *
     * Es el metadato en el que se apoyan las politicas de 0006, 0007 y 0010, y
     * el unico que la propia persona no puede editar. Escribir aqui de mas es
     * conceder permisos de mas, asi que se construye explicitamente en vez de
     * volcar lo que venga en el cuerpo de la peticion.
     */
    const metadatos: Record<string, unknown> = {}
    if (rol === 'admin') metadatos.es_staff = true
    if (rol === 'profesional') metadatos.profesional_id = profesionalId

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      // Nadie va a recibir el correo de confirmacion de una cuenta creada desde
      // el panel, asi que se da por confirmada. Sin esto, GoTrue responde
      // "Email not confirmed" al primer intento de entrar.
      email_confirm: true,
      // El vinculo va en `app_metadata` y no en `user_metadata` porque este
      // ultimo lo puede editar la propia persona: ahi, cualquiera podria
      // asignarse una ficha y leer la agenda de otra.
      app_metadata: metadatos,
      // Estos dos si van en `user_metadata`: son datos de contacto, no permisos,
      // y de ahi los recoge el trigger de 0010 para `perfiles`.
      user_metadata: {
        nombre: (cuerpo.nombre ?? '').trim(),
        telefono: (cuerpo.telefono ?? '').trim(),
      },
    })

    if (error) {
      // 422 es lo que devuelve Supabase cuando el correo ya existe. Se conserva
      // para que el panel pueda decir "ya hay una cuenta con ese correo" en vez
      // de un error genérico.
      return respuesta({ error: error.message }, error.status ?? 400)
    }

    // El trigger `perfil_al_crear_cuenta` de 0010 ya creo su fila en `perfiles`
    // con el rol deducido de estos mismos metadatos; no hay que tocarla aqui.
    return respuesta({ userId: data.user?.id ?? null, email, rol }, 200)
  }

  if (cuerpo.accion === 'eliminar') {
    const userId = (cuerpo.userId ?? '').trim()
    if (userId === '') return respuesta({ error: 'Falta el identificador de la cuenta.' }, 400)

    // No se deja borrar la propia cuenta: quien lo hiciera perderia el acceso al
    // panel en el mismo clic, y si fuera el unico personal del estudio no
    // quedaria nadie que pudiera volver a entrar.
    if (userId === quien.user.id) {
      return respuesta({ error: 'No puedes eliminar tu propia cuenta.' }, 400)
    }

    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return respuesta({ error: error.message }, error.status ?? 400)

    // La fila de `perfiles` cae por la clave foranea a auth.users si la tiene, y
    // si no, el panel la borra aparte. No se asume aqui.
    return respuesta({ userId }, 200)
  }

  return respuesta({ error: 'Accion no reconocida.' }, 400)
})
