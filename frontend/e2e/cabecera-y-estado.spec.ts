import { expect, test, type Page } from '@playwright/test'
import { simularPanelStaff } from './fixtures/panel'
import { simularTienda } from './fixtures/tienda'

/** El contenido del sitio (0014) sin guardar nada: la portada usa el original. */
async function sinContenidoGuardado(page: Page) {
  await page.route('**/rest/v1/contenido_sitio*', (route) =>
    route.fulfill({ json: [{ datos: {}, actualizado_en: '2026-10-01T12:00:00Z' }] }),
  )
}

/**
 * Lleva la pagina al fondo y comprueba que se queda alli: mientras carga, la
 * pagina crece y `ScrollToTop` repite su salto a 0 tras el montaje. Sin la
 * espera, el clic podria hacerse ya arriba y la prueba pasaria sin probar nada.
 */
async function bajarAlFondo(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
        await new Promise((r) => setTimeout(r, 300))
        return window.scrollY
      }),
    )
    .toBeGreaterThan(500)
}

/** Registra cada posicion de scroll desde ahora, para detectar animaciones. */
async function grabarScroll(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __scrolls: number[] }
    w.__scrolls = []
    window.addEventListener('scroll', () => w.__scrolls.push(window.scrollY))
  })
}
const posiciones = (page: Page) => page.evaluate(() => (window as unknown as { __scrolls: number[] }).__scrolls)

const inicio = (page: Page) => page.getByRole('link', { name: 'Estudio Nura, ir al inicio' })

test.describe('logo de la cabecera', () => {
  test('en la portada, el texto "Estudio Nura" sube con desplazamiento suave', async ({ page }) => {
    await sinContenidoGuardado(page)
    await page.goto('/')
    await bajarAlFondo(page)
    await grabarScroll(page)
    await inicio(page).getByText('Estudio Nura').click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    // Suave: pasa por posiciones intermedias antes de llegar a 0.
    expect((await posiciones(page)).filter((y) => y > 0).length).toBeGreaterThan(1)
    await expect(page).toHaveURL(/\/$/)
  })

  test('con movimiento reducido sube de golpe, y tambien con Enter', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await sinContenidoGuardado(page)
    await page.goto('/')
    await bajarAlFondo(page)
    await grabarScroll(page)
    await inicio(page).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    expect((await posiciones(page)).filter((y) => y > 0)).toEqual([])
  })

  test('desde otra ruta lleva a la portada arriba sin animar la pagina que se va', async ({ page }) => {
    await simularTienda(page)
    await sinContenidoGuardado(page)
    await page.goto('/tienda')
    await expect(page.getByRole('button', { name: /^Agregar .* al carrito$/ }).first()).toBeVisible()
    await bajarAlFondo(page)
    await grabarScroll(page)
    await inicio(page).locator('img').click()
    await expect(page).toHaveURL(/\/$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    // Un solo salto instantaneo a 0: ningun paso intermedio de una animacion.
    const intermedios = (await posiciones(page)).filter((y) => y > 0)
    expect(intermedios).toEqual([])
  })
})

test.describe('modo "Solo datos de Supabase" retirado', () => {
  test('una marca antigua no vacia los datos y se borra al cargar', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('nuravision:solo-supabase', '1'))
    await simularPanelStaff(page)
    await page.goto('/admin/clientes')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    // Los datos locales siguen visibles: con el modo antiguo eran 0 filas.
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.getByText(/^0 clientes/)).toHaveCount(0)
    // addInitScript la vuelve a escribir en cada carga; lo que importa es que
    // la app la borra despues de arrancar.
    expect(await page.evaluate(() => window.localStorage.getItem('nuravision:solo-supabase'))).toBeNull()
  })
})

test.describe('carrusel sin boton de pausa', () => {
  test('solo hay flechas, y el foco de teclado detiene el avance', async ({ page }) => {
    await page.clock.install()
    await sinContenidoGuardado(page)
    await page.goto('/')
    await page.mouse.move(0, 0)
    const regiones = page.getByRole('region', { name: /estudio|tienda/i })
    await expect(regiones.first()).toBeVisible()
    for (const region of await regiones.all()) {
      await expect(region.getByRole('button')).toHaveCount(2)
      await expect(region.getByRole('button', { name: /Pausar|Reanudar/ })).toHaveCount(0)
    }
    const estudio = page.getByRole('region', { name: /estudio/i }).first()
    const contador = estudio.locator('span.tabular-nums')
    await expect(contador).toHaveText('01 / 06')
    // Foco puesto con teclado (no con clic): el avance no corre.
    await estudio.getByRole('button', { name: 'Foto anterior' }).focus()
    await page.clock.runFor(12_000)
    await expect(contador).toHaveText('01 / 06')
    // Al sacar el foco vuelve a avanzar.
    await page.locator('body').focus()
    await estudio.getByRole('button', { name: 'Foto anterior' }).blur()
    await page.clock.runFor(5_100)
    await expect(contador).toHaveText('02 / 06')
  })
})
