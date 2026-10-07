import { expect, test, type Page } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

const ANCHOS = [320, 375, 768, 1280]

/** El contenido del sitio (0014) sin guardar nada: la portada usa el original. */
async function sinContenidoGuardado(page: Page) {
  await page.route('**/rest/v1/contenido_sitio*', (route) =>
    route.fulfill({ json: [{ datos: {}, actualizado_en: '2026-10-01T12:00:00Z' }] }),
  )
}

const carrusel = (page: Page, nombre: RegExp) => page.getByRole('region', { name: nombre })
const contador = (region: ReturnType<typeof carrusel>) => region.locator('span.tabular-nums')

test.describe('cabecera y pie', () => {
  for (const ancho of ANCHOS) {
    test(`logo de Estudio Nura legible y sin desborde a ${ancho}px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 })
      await sinContenidoGuardado(page)
      await page.goto('/')

      const inicio = page.getByRole('link', { name: 'Estudio Nura, ir al inicio' })
      const logo = inicio.locator('img')
      await expect(logo).toHaveAttribute('src', '/estudio-nura-logo.jpg')
      await expect(inicio.getByText('Estudio Nura')).toBeVisible()
      // Con poll: bajo carga en paralelo la imagen puede no haber terminado de bajar.
      await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
      expect(await logo.evaluate((img) => getComputedStyle(img).borderRadius)).not.toBe('0px')

      // El texto no se recorta ni pisa los botones de la derecha.
      const texto = inicio.getByText('Estudio Nura')
      expect(await texto.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      // El primer boton de la derecha es el de Nuria (compacto bajo `sm`).
      const cajaInicio = (await inicio.boundingBox())!
      const cajaNuria = (await page.getByRole('banner').getByRole('button', { name: /^Nuria/ }).filter({ visible: true }).boundingBox())!
      expect(cajaInicio.x + cajaInicio.width).toBeLessThanOrEqual(cajaNuria.x)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho)

      // El pie conserva el logo de NuraVision, a 24 px de alto.
      const logoPie = page.getByRole('contentinfo').getByRole('img', { name: 'Nuravision' })
      await logoPie.scrollIntoViewIfNeeded()
      expect((await logoPie.boundingBox())!.height).toBe(24)
    })
  }

  test('el pie no muestra "Nunca spam." ni deja un salto vacio', async ({ page }) => {
    await sinContenidoGuardado(page)
    await page.goto('/')
    const pie = page.getByRole('contentinfo')
    await expect(pie.getByText('Mantente actualizado y no te pierdas de nada!')).toBeVisible()
    await expect(pie.getByText('Nunca spam.')).toHaveCount(0)
    const titulo = pie.getByText('Mantente actualizado y no te pierdas de nada!')
    expect(await titulo.evaluate((p) => p.querySelectorAll('br, em').length)).toBe(0)
  })
})

test.describe('Nuria', () => {
  test('ningun texto ni etiqueta accesible dice Nuva', async ({ page }) => {
    await simularTienda(page)
    await sinContenidoGuardado(page)
    const restos = async () =>
      page.evaluate(() => {
        const atributos = [...document.querySelectorAll('[aria-label],[alt],[title],[placeholder]')].flatMap((el) =>
          ['aria-label', 'alt', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
        )
        return [document.title, document.body.innerText, ...atributos].filter((t) => /nuva/i.test(t))
      })

    for (const ruta of ['/', '/tienda', '/servicios']) {
      await page.goto(ruta)
      await page.waitForLoadState('networkidle')
      expect(await restos(), ruta).toEqual([])
    }
    await page.getByRole('button', { name: /Pregúntale a Nuria/ }).click()
    await expect(page.getByRole('dialog', { name: /Nuria/ })).toBeVisible()
    expect(await restos()).toEqual([])
  })
})

test.describe('inicio de sesion', () => {
  test('sin atajos del prototipo ni interruptor de datos', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByText(/Prototipo/)).toHaveCount(0)
    await expect(page.getByRole('switch')).toHaveCount(0)
  })

  test('credenciales malas: muestra el error y se queda en /login', async ({ page }) => {
    let pedido: { email?: string } | null = null
    await page.route('**/auth/v1/token?grant_type=password', (route) => {
      pedido = route.request().postDataJSON()
      return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } })
    })
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('alguien@nura.test')
    await page.locator('input[type="password"]').fill('mala-clave')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect.poll(() => pedido?.email).toBe('alguien@nura.test')
    await expect(page.locator('form p.rounded-xl')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('credenciales buenas: entra y sale de /login', async ({ page }) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const expira = Math.floor(Date.now() / 1000) + 3600
    const usuario = {
      id: '00000000-0000-4000-8000-000000000009',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'camila@nura.test',
      app_metadata: {},
      user_metadata: { nombre: 'Camila' },
      created_at: '2026-01-01T00:00:00Z',
    }
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', exp: expira })}.firma`
    await page.route('**/auth/v1/token?grant_type=password', (route) =>
      route.fulfill({ json: { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: expira, user: usuario } }),
    )
    await page.route('**/auth/v1/user', (route) => route.fulfill({ json: usuario }))
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('camila@nura.test')
    await page.locator('input[type="password"]').fill('buena-clave')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('carruseles de la portada', () => {
  test('todas las fotos locales existen y son imagenes', async ({ page, request }) => {
    const rutas = [
      ...Array.from({ length: 6 }, (_, i) => `/carrusel/inicio/inicio-${String(i + 1).padStart(2, '0')}.jpg`),
      ...Array.from({ length: 22 }, (_, i) => `/carrusel/productos/productos-${String(i + 1).padStart(2, '0')}.jpg`),
    ]
    for (const ruta of rutas) {
      const r = await request.get(ruta)
      expect(r.status(), ruta).toBe(200)
      expect(r.headers()['content-type'], ruta).toMatch(/^image\//)
    }
    // Y se pintan de verdad al recorrer el carrusel de la tienda entero.
    await sinContenidoGuardado(page)
    const rotas: string[] = []
    page.on('response', (r) => {
      if (r.url().includes('/carrusel/') && r.status() >= 400) rotas.push(r.url())
    })
    await page.goto('/')
    const tienda = carrusel(page, /La tienda|Tienda/i)
    for (let i = 0; i < 22; i++) {
      const img = tienda.locator('img:not([aria-hidden="true"])')
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
      await tienda.getByRole('button', { name: 'Foto siguiente' }).click()
    }
    expect(rotas).toEqual([])
  })

  test('las flechas cambian la foto sin navegar; la tarjeta si navega', async ({ page }) => {
    await sinContenidoGuardado(page)
    await page.goto('/')
    const estudio = carrusel(page, /estudio/i).first()
    await expect(contador(estudio)).toHaveText('01/06')
    await estudio.getByRole('button', { name: 'Foto siguiente' }).click()
    await expect(contador(estudio)).toHaveText('02/06')
    await estudio.getByRole('button', { name: 'Foto anterior' }).click()
    await estudio.getByRole('button', { name: 'Foto anterior' }).click()
    await expect(contador(estudio)).toHaveText('06/06')
    await expect(page).toHaveURL(/\/$/)

    await estudio.getByRole('link').click()
    await expect(page).toHaveURL(/\/servicios$/)
    await page.goBack()
    await carrusel(page, /tienda/i).first().getByRole('link').click()
    await expect(page).toHaveURL(/\/tienda$/)
  })

  test('avanza solo cada 5 s y se detiene con el puntero encima', async ({ page }) => {
    await page.clock.install()
    await sinContenidoGuardado(page)
    await page.goto('/')
    await page.mouse.move(0, 0)
    const estudio = carrusel(page, /estudio/i).first()
    await expect(contador(estudio)).toHaveText('01/06')

    await page.clock.runFor(4_000)
    await expect(contador(estudio)).toHaveText('01/06')
    await page.clock.runFor(1_100)
    await expect(contador(estudio)).toHaveText('02/06')

    await estudio.hover()
    await page.clock.runFor(12_000)
    await expect(contador(estudio)).toHaveText('02/06')

    await page.mouse.move(0, 0)
    await page.clock.runFor(5_100)
    await expect(contador(estudio)).toHaveText('03/06')
  })

  test('con el foco dentro no avanza aunque el puntero salga', async ({ page }) => {
    // Regresion (2026-10-07): puntero y foco compartian un booleano y sacar el
    // puntero reanudaba el avance con el foco aun dentro.
    await page.clock.install()
    await sinContenidoGuardado(page)
    await page.goto('/')
    const estudio = carrusel(page, /estudio/i).first()
    // Clic con el raton en la flecha: el foco queda en el boton.
    await estudio.getByRole('button', { name: 'Foto siguiente' }).click()
    await expect(contador(estudio)).toHaveText('02/06')
    await expect(estudio.getByRole('button', { name: 'Foto siguiente' })).toBeFocused()
    await page.mouse.move(0, 0)
    await page.clock.runFor(6_000)
    await expect(contador(estudio)).toHaveText('02/06')
  })

  test('sin autoavance con movimiento reducido', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install()
    await sinContenidoGuardado(page)
    await page.goto('/')
    await page.mouse.move(0, 0)
    const estudio = carrusel(page, /estudio/i).first()
    await page.clock.runFor(20_000)
    await expect(contador(estudio)).toHaveText('01/06')
    await estudio.getByRole('button', { name: 'Foto siguiente' }).click()
    await expect(contador(estudio)).toHaveText('02/06')
  })

  test('un carrusel guardado vacio deja la tarjeta a rayas, sin controles', async ({ page }) => {
    await page.route('**/rest/v1/contenido_sitio*', (route) =>
      route.fulfill({ json: [{ datos: { carruseles: { estudio: [], tienda: ['/carrusel/inicio/inicio-02.jpg'] } }, actualizado_en: '2026-10-01T12:00:00Z' }] }),
    )
    await page.goto('/')
    const estudio = carrusel(page, /estudio/i).first()
    await expect(estudio.locator('.placeholder-stripes')).toBeVisible()
    await expect(estudio.getByRole('button')).toHaveCount(0)
    // Con una sola foto tampoco hay flechas ni contador.
    const tienda = carrusel(page, /tienda/i).first()
    await expect(tienda.locator('img')).toHaveCount(1)
    await expect(tienda.getByRole('button')).toHaveCount(0)
    await estudio.getByRole('link').click()
    await expect(page).toHaveURL(/\/servicios$/)
  })
})
