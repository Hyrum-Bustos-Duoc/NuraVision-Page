import { expect, test, type Page, type Request } from '@playwright/test'
import { simularSesion } from './fixtures/sesion'

/**
 * «Mi perfil» con la sesion real (openspec/changes/perfil-editable-cliente,
 * requisito «Pantalla "Mi perfil" con la sesion real»).
 *
 * La base se sirve desde memoria con page.route: la fila de `perfiles` y la
 * funcion `actualizar_mi_perfil`. El refresco de la sesion responde con el
 * `user_metadata` que la funcion habria escrito.
 */

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

const ID = '00000000-0000-4000-8000-000000000042'
const EMAIL = 'ana@correo.cl'

interface Fila {
  nombre: string
  telefono: string
  fecha_nacimiento: string | null
}

type RespuestaRpc = { status: number; json: unknown } | null

interface Opciones {
  /** La lectura de `perfiles` falla hasta que la prueba llame a `arreglarCarga`. */
  cargaFalla?: boolean
  /** Respuesta forzada de la funcion; null = la funcion guarda de verdad. */
  rpc?: RespuestaRpc
  /** Retraso de `/auth/v1/user`, para ver la pantalla mientras la sesion carga. */
  retrasoSesionMs?: number
}

async function abrir(page: Page, opciones: Opciones = {}) {
  const fila: Fila = { nombre: 'Ana Pérez', telefono: '+56912345678', fecha_nacimiento: '1990-03-04' }
  const llamadas: Request[] = []
  const lecturas: Request[] = []
  const refrescos: Request[] = []
  let cargaFalla = opciones.cargaFalla ?? false

  const usuario = await simularSesion(page, {
    id: ID,
    email: EMAIL,
    app_metadata: {},
    user_metadata: { nombre: fila.nombre, telefono: fila.telefono, fecha_nacimiento: fila.fecha_nacimiento },
  })
  if (opciones.retrasoSesionMs) {
    await page.route('**/auth/v1/user', async (route) => {
      await new Promise((r) => setTimeout(r, opciones.retrasoSesionMs))
      await route.fulfill({ json: usuario })
    })
  }
  await page.route('**/auth/v1/token?grant_type=refresh_token', (route) => {
    refrescos.push(route.request())
    const expira = Math.floor(Date.now() / 1000) + 3600
    return route.fulfill({
      json: {
        access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ID, role: 'authenticated', exp: expira })}.firma`,
        refresh_token: 'refresh-e2e-2',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expira,
        user: { ...usuario, user_metadata: { ...usuario.user_metadata, ...fila } },
      },
    })
  })

  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/perfiles*', (route) => {
    lecturas.push(route.request())
    if (cargaFalla) {
      return route.fulfill({ status: 500, json: { code: 'XX000', message: 'boom' } })
    }
    return route.fulfill({
      json: [{ id: ID, email: EMAIL, rol: 'cliente', profesional_id: null, creado_en: '2026-01-01T00:00:00Z', ...fila }],
    })
  })
  await page.route('**/rest/v1/rpc/actualizar_mi_perfil', async (route) => {
    llamadas.push(route.request())
    // La respuesta tarda: es lo que da tiempo a una segunda pulsacion.
    await new Promise((r) => setTimeout(r, 400))
    if (opciones.rpc) return route.fulfill(opciones.rpc)
    const args = route.request().postDataJSON() as {
      p_nombre: string
      p_telefono: string
      p_fecha_nacimiento: string | null
    }
    fila.nombre = args.p_nombre
    fila.telefono = args.p_telefono
    fila.fecha_nacimiento = args.p_fecha_nacimiento
    return route.fulfill({ json: [{ ...fila }] })
  })

  return { fila, llamadas, lecturas, refrescos, arreglarCarga: () => (cargaFalla = false) }
}

const campo = (page: Page, nombre: string) => page.getByLabel(nombre, { exact: true })
const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar cambios' })

test.describe('/perfil', () => {
  test('sin sesion termina en /login', async ({ page }) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/perfil')
    await expect(page).toHaveURL(/\/login\?volver=%2Fperfil$/)
  })

  test('mientras la sesion carga no redirige; despues muestra el perfil', async ({ page }) => {
    await abrir(page, { retrasoSesionMs: 1500 })
    await page.goto('/perfil')
    await expect(page.getByText('Cargando tu perfil…')).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(/\/perfil$/)
    await expect(campo(page, 'Nombre y apellido')).toHaveValue('Ana Pérez')
    await expect(page).toHaveURL(/\/perfil$/)
  })

  test('«Mi cuenta» lleva a /perfil con los datos de perfiles y el correo bloqueado', async ({ page }) => {
    await abrir(page)
    await page.goto('/')
    await page.getByTitle('Mi cuenta').click()
    await expect(page).toHaveURL(/\/perfil$/)
    await expect(campo(page, 'Nombre y apellido')).toHaveValue('Ana Pérez')
    await expect(campo(page, 'Teléfono')).toHaveValue('+56912345678')
    await expect(page.getByRole('button', { name: /Cumpleaños/ })).toContainText('1990')
    await expect(campo(page, 'Correo')).toHaveValue(EMAIL)
    await expect(campo(page, 'Correo')).not.toBeEditable()
    // Sin datos de demostracion.
    await expect(page.getByText(/puntos/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Eliminar mis imágenes' })).toHaveCount(0)
  })

  test('guarda normalizado con una sola llamada, refresca la sesion y sobrevive a la recarga', async ({ page }) => {
    const { llamadas, refrescos } = await abrir(page)
    await page.goto('/perfil')
    await campo(page, 'Nombre y apellido').fill('Beatriz Soto')
    await campo(page, 'Teléfono').fill('9 8765 4321')
    // Dos pulsaciones seguidas: la segunda llega con la primera en vuelo.
    await guardar(page).dblclick()

    await expect(page.getByText('Perfil actualizado')).toBeVisible()
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].postDataJSON()).toEqual({
      p_nombre: 'Beatriz Soto',
      p_telefono: '+56987654321',
      p_fecha_nacimiento: '1990-03-04',
    })
    // El formulario muestra lo que devolvio la base.
    await expect(campo(page, 'Teléfono')).toHaveValue('+56987654321')
    // La sesion se refresca y el encabezado ve el nombre nuevo sin salir.
    await expect.poll(() => refrescos.length).toBe(1)
    await expect(page.getByTitle('Mi cuenta')).toContainText('Beatriz')

    await page.reload()
    await expect(campo(page, 'Teléfono')).toHaveValue('+56987654321')
    await expect(campo(page, 'Nombre y apellido')).toHaveValue('Beatriz Soto')
  })

  test('datos invalidos: mensaje junto al campo, foco al primero, 0 llamadas y lo escrito se conserva', async ({ page }) => {
    const { llamadas } = await abrir(page)
    await page.goto('/perfil')
    await campo(page, 'Nombre y apellido').fill('')
    await campo(page, 'Teléfono').fill('12345678')
    await guardar(page).click()

    await expect(campo(page, 'Nombre y apellido')).toHaveAccessibleDescription('Necesitamos tu nombre.')
    await expect(campo(page, 'Teléfono')).toHaveAccessibleDescription(
      'El teléfono debe ser un número chileno de 9 dígitos.',
    )
    await expect(campo(page, 'Nombre y apellido')).toBeFocused()
    await expect(campo(page, 'Teléfono')).toHaveValue('12345678')

    await campo(page, 'Nombre y apellido').fill('a'.repeat(121))
    await guardar(page).click()
    await expect(campo(page, 'Nombre y apellido')).toHaveAccessibleDescription(
      'El nombre admite hasta 120 caracteres.',
    )
    await page.waitForTimeout(300)
    expect(llamadas).toHaveLength(0)
  })

  test('valida al salir del campo, no mientras se escribe', async ({ page }) => {
    await abrir(page)
    await page.goto('/perfil')
    await campo(page, 'Teléfono').fill('123')
    await expect(campo(page, 'Teléfono')).not.toHaveAttribute('aria-invalid', 'true')
    await campo(page, 'Teléfono').blur()
    await expect(campo(page, 'Teléfono')).toHaveAttribute('aria-invalid', 'true')
  })

  test('120 emojis en el nombre se aceptan y se envian', async ({ page }) => {
    const { llamadas } = await abrir(page)
    await page.goto('/perfil')
    const nombre = '💅'.repeat(120)
    await campo(page, 'Nombre y apellido').fill(nombre)
    await guardar(page).click()
    await expect(page.getByText('Perfil actualizado')).toBeVisible()
    expect(llamadas[0].postDataJSON()).toMatchObject({ p_nombre: nombre })
  })

  const fallos: [string, RespuestaRpc, string][] = [
    [
      'P0001 muestra el mensaje de la base',
      { status: 400, json: { code: 'P0001', message: 'No encontramos tu perfil. Escríbenos para revisarlo.', details: null, hint: null } },
      'No encontramos tu perfil. Escríbenos para revisarlo.',
    ],
    [
      // auth.uid() null con la sesion del navegador aun viva: no hay redireccion.
      'P0001 de sesion expirada muestra su mensaje',
      { status: 400, json: { code: 'P0001', message: 'Tu sesión expiró. Vuelve a iniciar sesión.', details: null, hint: null } },
      'Tu sesión expiró. Vuelve a iniciar sesión.',
    ],
    [
      'otro error muestra el generico',
      { status: 500, json: { code: 'XX000', message: 'internal', details: null, hint: null } },
      'No pudimos guardar tus datos. Inténtalo de nuevo.',
    ],
    ['un arreglo vacio es un error', { status: 200, json: [] }, 'La base no confirmó el cambio. Inténtalo de nuevo.'],
  ]
  for (const [caso, rpc, mensaje] of fallos) {
    test(`${caso}, sin toast de exito y conservando lo escrito`, async ({ page }) => {
      const { refrescos } = await abrir(page, { rpc })
      await page.goto('/perfil')
      await campo(page, 'Teléfono').fill('9 8765 4321')
      await guardar(page).click()
      await expect(page.getByRole('alert')).toHaveText(mensaje)
      await expect(page.getByText('Perfil actualizado')).toHaveCount(0)
      await expect(campo(page, 'Teléfono')).toHaveValue('9 8765 4321')
      await expect(guardar(page)).toBeEnabled()
      expect(refrescos).toHaveLength(0)
    })
  }

  test('si falla la carga, «Reintentar» vuelve a leer', async ({ page }) => {
    const { lecturas, arreglarCarga } = await abrir(page, { cargaFalla: true })
    await page.goto('/perfil')
    await expect(page.getByRole('alert')).toContainText('No pudimos cargar tu perfil.')
    // En desarrollo StrictMode monta dos veces: se cuenta desde aqui, no desde 0.
    const antes = lecturas.length
    arreglarCarga()
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(campo(page, 'Nombre y apellido')).toHaveValue('Ana Pérez')
    expect(lecturas.length).toBeGreaterThan(antes)
  })
  // --- Casos de QA (4.1) ---------------------------------------------------

  test('si refrescar la sesion falla tras guardar, el guardado sigue siendo un exito', async ({ page }) => {
    const { llamadas } = await abrir(page)
    // Registrada despues que la de `abrir`: Playwright atiende primero la ultima.
    await page.route('**/auth/v1/token?grant_type=refresh_token', (route) =>
      route.fulfill({ status: 500, json: { message: 'boom' } }),
    )
    await page.goto('/perfil')
    await campo(page, 'Teléfono').fill('9 8765 4321')
    await guardar(page).click()
    await expect(page.getByText('Perfil actualizado')).toBeVisible()
    await expect(campo(page, 'Teléfono')).toHaveValue('+56987654321')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page).toHaveURL(/\/perfil$/)
    expect(llamadas).toHaveLength(1)
  })

  /**
   * Caduca el token sin esperar una hora y guarda: supabase-js no puede
   * refrescar, cierra la sesion y la llamada sale con la anon key. Despues
   * vuelve a entrar por el formulario de login con la cuenta `id`.
   */
  async function expirarAlGuardarYVolverComo(page: Page, id: string) {
    // Reloj falso: setSystemTime no dispara los timers, asi el refresco
    // automatico no se adelanta al clic.
    await page.clock.install()
    const ctx = await abrir(page)
    await page.route('**/auth/v1/token?grant_type=refresh_token', (route) =>
      route.fulfill({
        status: 400,
        json: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' },
      }),
    )
    await page.route('**/rest/v1/rpc/actualizar_mi_perfil', (route) => {
      ctx.llamadas.push(route.request())
      // Sin sesion, supabase-js llama con la anon key, y 0020 le revoca execute.
      return route.fulfill({
        status: 401,
        json: { code: '42501', message: 'permission denied for function actualizar_mi_perfil' },
      })
    })
    await page.goto('/perfil')
    await campo(page, 'Teléfono').fill('9 8765 4321')
    await page.clock.setSystemTime(Date.now() + 2 * 3600 * 1000)
    await guardar(page).click()

    await expect(page).toHaveURL(/\/login\?volver=%2Fperfil$/)
    await expect(page.getByText('Perfil actualizado')).toHaveCount(0)
    // La llamada salio sin token de usuario: la base no la atribuye a nadie.
    const autorizaciones = ctx.llamadas.map((r) => r.headers()['authorization'] ?? '')
    expect(autorizaciones.length).toBeGreaterThan(0)
    expect(autorizaciones.filter((a) => a.endsWith('.firma'))).toEqual([])
    const llamadasAlExpirar = ctx.llamadas.length

    // El reloj del navegador va 2 h adelantado: el token nuevo vence despues.
    const expira = Math.floor(Date.now() / 1000) + 4 * 3600
    const usuario = { id, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: {} }
    await page.route('**/auth/v1/token?grant_type=password', (route) =>
      route.fulfill({
        json: {
          access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp: expira })}.firma`,
          refresh_token: 'refresh-e2e-3',
          token_type: 'bearer',
          expires_in: 4 * 3600,
          expires_at: expira,
          user: usuario,
        },
      }),
    )
    await page.locator('input[type="email"]').fill(EMAIL)
    await page.locator('input[type="password"]').fill('clave')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/perfil$/)
    return { llamadasAlExpirar, llamadas: ctx.llamadas }
  }

  const AVISO = /Recuperamos lo que escribiste antes de que expirara tu sesión/

  test('sesion expirada al guardar: va a /login y, al volver la misma cuenta, recupera lo escrito sin guardarlo', async ({
    page,
  }) => {
    const { llamadasAlExpirar, llamadas } = await expirarAlGuardarYVolverComo(page, ID)
    await expect(campo(page, 'Teléfono')).toHaveValue('9 8765 4321')
    await expect(page.getByText(AVISO)).toBeVisible()
    expect(llamadas).toHaveLength(llamadasAlExpirar)
  })

  test('sesion expirada al guardar: si entra otra cuenta, no ve lo que escribio la anterior', async ({ page }) => {
    await expirarAlGuardarYVolverComo(page, '00000000-0000-4000-8000-000000000043')
    await expect(campo(page, 'Teléfono')).toHaveValue('+56912345678')
    await expect(page.getByText(AVISO)).toHaveCount(0)
    expect(await page.evaluate(() => window.sessionStorage.getItem('nuravision:borrador-perfil'))).toBeNull()
  })

  test('JWT que la base da por vencido y el navegador no (reloj atrasado): conserva lo escrito sin toast', async ({
    page,
  }) => {
    // PostgREST valida `exp` con su reloj; supabase-js, con el del navegador.
    // Con el navegador atrasado la llamada sale con el token de la clienta y
    // vuelve 401 PGRST303, sin que supabase-js cierre la sesion: no hay
    // desmontaje ni viaje al login, el formulario sigue en pantalla.
    const ctx = await abrir(page, {
      rpc: { status: 401, json: { code: 'PGRST303', message: 'JWT expired', details: null, hint: null } },
    })
    await page.goto('/perfil')
    await campo(page, 'Teléfono').fill('9 8765 4321')
    await guardar(page).click()

    await expect(page.getByRole('alert')).toContainText('Tu sesión expiró. Vuelve a iniciar sesión.')
    await expect(page.getByText('Perfil actualizado')).toHaveCount(0)
    await expect(campo(page, 'Teléfono')).toHaveValue('9 8765 4321')
    await expect(page).toHaveURL(/\/perfil$/)
    expect(ctx.llamadas.map((r) => r.headers()['authorization'] ?? '').every((a) => a.endsWith('.firma'))).toBe(true)
    // Y el borrador queda guardado para esta cuenta por si recarga o vuelve a entrar.
    const crudo = await page.evaluate(() => window.sessionStorage.getItem('nuravision:borrador-perfil'))
    expect(JSON.parse(crudo ?? 'null')).toMatchObject({ usuarioId: ID, borrador: { telefono: '9 8765 4321' } })
  })

  test('en movil, el nombre del menu lleva a /perfil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await abrir(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('link', { name: 'Ana Pérez' }).click()
    await expect(page).toHaveURL(/\/perfil$/)
    await expect(campo(page, 'Nombre y apellido')).toHaveValue('Ana Pérez')
  })
})
