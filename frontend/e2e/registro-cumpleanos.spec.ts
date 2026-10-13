import { mkdirSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'

/**
 * Cumpleaños opcional en /registro.
 *
 * El signUp de Supabase se intercepta: nunca se crea una cuenta real. La
 * respuesta imita un proyecto con confirmacion de correo (usuario sin sesion),
 * asi el flujo termina en "Revisa tu correo" y la prueba puede leer el payload.
 *
 * El reloj se fija en 2026-10-09 02:30 UTC con la zona America/Santiago: ahi ya
 * es 9 de octubre en UTC pero todavia 8 en Chile. Si "hoy" se calculara en UTC,
 * el 9 quedaria habilitado y las pruebas de limite lo detectarian.
 */

const AHORA_UTC = new Date('2026-10-09T02:30:00Z')
const HOY_LOCAL = 'jueves 8 de octubre de 2026'
const CAPTURAS = process.env.QA_CAPTURAS

const ETIQUETA = 'Cumpleaños (opcional)'

test.use({ timezoneId: 'America/Santiago', locale: 'es-CL' })

async function prepararRegistro(page: Page, { tema }: { tema?: 'clay' | 'olive' } = {}) {
  const registros: Request[] = []
  await page.clock.setFixedTime(AHORA_UTC)
  if (tema) {
    await page.addInitScript((t) => window.localStorage.setItem('nv-theme', t), tema)
  }
  // Cualquier lectura a la base responde vacia: la pantalla no deberia hacerlas.
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/auth/v1/signup**', (route) => {
    registros.push(route.request())
    const cuerpo = route.request().postDataJSON() as { email: string; data: object }
    return route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-0000000000aa',
        aud: 'authenticated',
        role: 'authenticated',
        email: cuerpo.email,
        user_metadata: cuerpo.data,
        app_metadata: {},
        identities: [],
        created_at: '2026-10-09T02:30:00Z',
      },
    })
  })
  await page.goto('/registro')
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible()
  // ScrollToTop repite su salto a scrollY=0 a los 80 ms de navegar. Una prueba
  // que abre el calendario antes de eso ve deshecho el desplazamiento que hace
  // el popover para caber en la ventana; una persona no hace clic tan rapido.
  await page.waitForTimeout(150)
  return registros
}

async function llenarFormulario(page: Page) {
  // Los campos de texto de Register.tsx no tienen etiqueta asociada (deuda
  // previa a esta feature), por eso se buscan por autocomplete.
  await page.locator('input[autocomplete="given-name"]').fill('Ana')
  await page.locator('input[autocomplete="family-name"]').fill('Pérez')
  await page.locator('input[autocomplete="email"]').fill('ana@correo.cl')
  await page.locator('input[autocomplete="tel"]').fill('+56911112222')
  await page.locator('input[autocomplete="new-password"]').fill('Clave1234')
  await page.getByRole('checkbox').check()
}

async function enviar(page: Page, registros: Request[]) {
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible()
  expect(registros).toHaveLength(1)
  return registros[0].postDataJSON() as { data: Record<string, unknown> }
}

const campo = (page: Page) => page.locator('button[aria-haspopup="dialog"]')
const panel = (page: Page) => page.getByRole('dialog', { name: ETIQUETA })

/** Espera a que terminen las transiciones de entrada: medir a mitad de una da cajas falsas. */
async function esperarEntrada(page: Page) {
  await panel(page).evaluate((p) => Promise.all(p.getAnimations({ subtree: true }).map((a) => a.finished)))
}

const MARGEN_VENTANA = 12

async function capturar(page: Page, nombre: string) {
  if (!CAPTURAS) return
  mkdirSync(CAPTURAS, { recursive: true })
  // Espera a que terminen las transiciones de entrada (200 ms) y los fundidos.
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: false })
}

async function elegirFecha(page: Page, anio: number, mes: string, dia: string) {
  await page.getByRole('button', { name: String(anio), exact: true }).click()
  await page.getByRole('button', { name: `${mes} ${anio}`, exact: true }).click()
  await page.getByRole('button', { name: dia, exact: true }).click()
}

test.describe('escritorio', () => {
  test('(1) sin cumpleaños el registro funciona y envia fecha_nacimiento null', async ({ page }) => {
    const registros = await prepararRegistro(page)
    await llenarFormulario(page)
    const cuerpo = await enviar(page, registros)
    expect(cuerpo.data).toEqual({ nombre: 'Ana Pérez', telefono: '+56911112222', fecha_nacimiento: null })
  })

  test('(2)(4) llega a 1985 en cuatro clics y envia exactamente la fecha elegida', async ({ page }) => {
    const registros = await prepararRegistro(page)
    await llenarFormulario(page)

    await campo(page).click()
    await expect(panel(page)).toBeVisible()
    // Sin valor abre en años, con el sugerido (hoy - 30 años) enfocado y a la vista.
    await expect(page.getByRole('button', { name: '1996', exact: true })).toBeFocused()
    await expect(page.getByRole('button', { name: '1985', exact: true })).toBeInViewport()
    await capturar(page, 'escritorio-oliva-anios')

    await page.getByRole('button', { name: '1985', exact: true }).click()
    await page.getByRole('button', { name: 'Marzo 1985', exact: true }).click()
    await capturar(page, 'escritorio-oliva-dias-sin-elegir')
    await page.getByRole('button', { name: 'jueves 14 de marzo de 1985', exact: true }).click()

    await expect(panel(page)).toBeHidden()
    await expect(campo(page)).toHaveText('14 de marzo, 1985')

    // Reabrir con valor: va directo a los dias, con el elegido marcado.
    await campo(page).click()
    await expect(page.getByRole('grid', { name: 'Marzo 1985' })).toBeVisible()
    await expect(page.getByRole('gridcell', { selected: true })).toHaveText('14')
    await capturar(page, 'escritorio-oliva-dias-elegido')
    await page.keyboard.press('Escape')

    const cuerpo = await enviar(page, registros)
    expect(cuerpo.data.fecha_nacimiento).toBe('1985-03-14')
  })

  test('(3) no se puede pasar de hoy (local) con clic, teclado, PageDown ni Shift', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).click()

    // Vista años: termina en el año actual.
    await expect(page.getByRole('button', { name: '2026', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '2027', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '2026', exact: true }).click()

    // Vista meses: noviembre y diciembre de 2026 deshabilitados.
    await expect(page.getByRole('button', { name: 'Noviembre 2026' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Diciembre 2026' })).toBeDisabled()
    await page.getByRole('button', { name: 'Octubre 2026' }).click()

    // Vista dias: el 9 (ya es 9 en UTC) esta deshabilitado; hoy marcado como fecha actual.
    await expect(page.getByRole('button', { name: 'viernes 9 de octubre de 2026' })).toBeDisabled()
    const hoy = page.getByRole('button', { name: HOY_LOCAL, exact: true })
    await expect(hoy).toHaveAttribute('aria-current', 'date')
    await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()

    await expect(hoy).toBeFocused()
    for (const tecla of ['ArrowRight', 'ArrowDown', 'End', 'PageDown', 'Shift+PageDown']) {
      await page.keyboard.press(tecla)
      await expect(page.getByRole('grid', { name: 'Octubre 2026' })).toBeVisible()
      await expect(page.locator('[role="gridcell"] button:focus')).toHaveAccessibleName(
        // End lleva al domingo de la semana, que es futuro: se queda en hoy.
        HOY_LOCAL,
      )
    }

    // Clic forzado en el dia deshabilitado: no elige nada.
    await page.getByRole('button', { name: 'viernes 9 de octubre de 2026' }).click({ force: true })
    await expect(panel(page)).toBeVisible()
    await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(0)
  })

  test('(3) no se puede bajar de 1920-01-01 con clic, teclado, PageUp ni Shift', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).click()

    await expect(page.getByRole('button', { name: '1919', exact: true })).toHaveCount(0)
    // Desde la vista años, ArrowUp repetido no puede salir de 1920.
    await page.getByRole('button', { name: '1920', exact: true }).click()
    await page.getByRole('button', { name: 'Enero 1920', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Mes anterior' })).toBeDisabled()

    // El foco llega con el dia sugerido (8); una fila arriba es el 1.
    const primero = 'jueves 1 de enero de 1920'
    await expect(page.getByRole('button', { name: 'jueves 8 de enero de 1920' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: primero })).toBeFocused()
    for (const tecla of ['ArrowLeft', 'ArrowUp', 'Home', 'PageUp', 'Shift+PageUp']) {
      await page.keyboard.press(tecla)
      await expect(page.getByRole('grid', { name: 'Enero 1920' })).toBeVisible()
      await expect(page.locator('[role="gridcell"] button:focus')).toHaveAccessibleName(primero)
    }

    // En la grilla de años, ArrowUp/ArrowLeft desde 1920 se quedan en 1920.
    await page.getByRole('button', { name: 'Cambiar año, ahora 1920' }).click()
    await expect(page.getByRole('button', { name: '1920', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('button', { name: '1920', exact: true })).toBeFocused()
  })

  test('(5) Escape y clic fuera cierran y devuelven el foco; Limpiar y X vacian', async ({ page }) => {
    await prepararRegistro(page)

    await campo(page).click()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
    await expect(campo(page)).toBeFocused()
    await expect(campo(page)).toHaveAttribute('aria-expanded', 'false')

    // Clic fuera sobre otro campo: cierra y el foco queda donde se hizo clic.
    await campo(page).click()
    await page.locator('input[autocomplete="email"]').click()
    await expect(panel(page)).toBeHidden()
    await expect(page.locator('input[autocomplete="email"]')).toBeFocused()

    // Limpiar: deshabilitado sin valor, vacia con valor.
    await campo(page).click()
    await expect(page.getByRole('button', { name: 'Limpiar' })).toBeDisabled()
    await elegirFecha(page, 1990, 'Marzo', 'domingo 4 de marzo de 1990')
    await campo(page).click()
    await page.getByRole('button', { name: 'Limpiar' }).click()
    await expect(panel(page)).toBeHidden()
    await expect(campo(page)).toHaveText('Elige una fecha')
    await expect(campo(page)).toBeFocused()

    // X: vacia sin abrir el panel y deja el foco en el campo.
    await campo(page).click()
    await elegirFecha(page, 1990, 'Marzo', 'domingo 4 de marzo de 1990')
    await page.getByRole('button', { name: 'Borrar la fecha' }).click()
    await expect(campo(page)).toHaveText('Elige una fecha')
    await expect(panel(page)).toBeHidden()
    await expect(campo(page)).toBeFocused()
  })

  test('(5) clic fuera en una zona no enfocable cierra sin devolver el foco al campo', async ({ page }) => {
    // Criterio acordado: el clic fuera deja el foco donde se hizo clic (aqui,
    // en <body>, porque el titulo no es enfocable). Solo Escape, elegir,
    // Limpiar, Cerrar, la X y el velo movil lo devuelven al campo.
    await prepararRegistro(page)
    await campo(page).click()
    await page.getByRole('heading', { name: 'Crea tu cuenta' }).click()
    await expect(panel(page)).toBeHidden()
    await expect(campo(page)).not.toBeFocused()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  })

  test('(6) solo con teclado: abrir, elegir año, mes y dia, y enviar', async ({ page }) => {
    const registros = await prepararRegistro(page)
    await llenarFormulario(page)

    await campo(page).focus()
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeVisible()
    await expect(page.getByRole('button', { name: '1996', exact: true })).toBeFocused()
    // 1996 -> 1988 (dos filas arriba) -> 1987 (uno a la izquierda).
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('button', { name: '1987', exact: true })).toBeFocused()
    await capturar(page, 'escritorio-oliva-anios-teclado')
    await page.keyboard.press('Enter')
    // Meses: el foco queda en el mes sugerido (octubre); ArrowUp sube a julio.
    await expect(page.getByRole('button', { name: 'Octubre 1987' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('grid', { name: 'Julio 1987' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'miércoles 8 de julio de 1987' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Space')

    await expect(panel(page)).toBeHidden()
    await expect(campo(page)).toBeFocused()
    const cuerpo = await enviar(page, registros)
    expect(cuerpo.data.fecha_nacimiento).toBe('1987-07-09')
  })

  test('(6) ARIA: dialog, grid con nombre, roving tabindex y estado expandido', async ({ page }) => {
    await prepararRegistro(page)
    await expect(campo(page)).toHaveAttribute('aria-expanded', 'false')
    await campo(page).click()
    await expect(campo(page)).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: '1990', exact: true }).click()
    await page.getByRole('button', { name: 'Marzo 1990', exact: true }).click()

    const grid = page.getByRole('grid', { name: 'Marzo 1990' })
    await expect(grid.getByRole('columnheader')).toHaveCount(7)
    // Exactamente una celda tabulable: roving tabindex.
    await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1)
  })

  test('(6) el nombre accesible del campo anuncia la fecha elegida', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).click()
    await elegirFecha(page, 1990, 'Marzo', 'domingo 4 de marzo de 1990')
    await expect(campo(page)).toHaveAccessibleName(/4 de marzo/)
  })

  test('(7) en escritorio el popover queda anclado al campo y dentro de la pantalla', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).click()
    const caja = await panel(page).boundingBox()
    const ancla = await campo(page).boundingBox()
    const vp = page.viewportSize()!
    expect(caja && ancla).toBeTruthy()
    expect(caja!.x).toBeCloseTo(ancla!.x, 0)
    expect(caja!.y).toBeGreaterThan(ancla!.y + ancla!.height)
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(vp.width)
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(vp.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width)
  })

  test('(8) tema Arcilla: capturas de años y dias', async ({ page }) => {
    await prepararRegistro(page, { tema: 'clay' })
    await expect(page.locator('html')).toHaveAttribute('data-nv-theme', 'clay')
    await campo(page).click()
    await capturar(page, 'escritorio-arcilla-anios')
    await page.getByRole('button', { name: '2026', exact: true }).click()
    await page.getByRole('button', { name: 'Octubre 2026', exact: true }).click()
    await page.getByRole('button', { name: 'jueves 1 de octubre de 2026' }).click()
    await campo(page).click()
    // Hoy (8) y el elegido (1) en la misma vista.
    await capturar(page, 'escritorio-arcilla-dias-hoy-y-elegido')
  })

  test('(8) tema Oliva: hoy y el elegido en la misma vista', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).click()
    await page.getByRole('button', { name: '2026', exact: true }).click()
    await page.getByRole('button', { name: 'Octubre 2026', exact: true }).click()
    await page.getByRole('button', { name: 'jueves 1 de octubre de 2026' }).click()
    await campo(page).click()
    await capturar(page, 'escritorio-oliva-dias-hoy-y-elegido')
  })
})

test.describe('zonas horarias extremas', () => {
  for (const zona of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    test.describe(zona, () => {
      test.use({ timezoneId: zona })
      test(`(2) ${zona}: envia la fecha elegida sin correrla un dia`, async ({ page }) => {
        const registros = await prepararRegistro(page)
        await llenarFormulario(page)
        await campo(page).click()
        await elegirFecha(page, 1990, 'Enero', 'lunes 1 de enero de 1990')
        await expect(campo(page)).toHaveText('1 de enero, 1990')
        const cuerpo = await enviar(page, registros)
        expect(cuerpo.data.fecha_nacimiento).toBe('1990-01-01')
      })
    })
  }
})

test.describe('movil 375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('(7) hoja inferior a todo el ancho, sin scroll horizontal; el velo cierra', async ({ page }) => {
    const registros = await prepararRegistro(page)
    await llenarFormulario(page)
    await campo(page).tap()
    await expect(panel(page)).toBeVisible()
    await page.waitForTimeout(300)

    const caja = (await panel(page).boundingBox())!
    expect(caja.x).toBe(0)
    expect(caja.width).toBe(375)
    expect(Math.round(caja.y + caja.height)).toBe(812)
    expect(caja.height).toBeLessThan(812)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await capturar(page, 'movil-oliva-anios')

    await page.getByRole('button', { name: '1985', exact: true }).tap()
    await page.getByRole('button', { name: 'Marzo 1985', exact: true }).tap()
    await capturar(page, 'movil-oliva-dias')
    // Las celdas no se salen de la hoja.
    const ultima = (await page.getByRole('button', { name: 'domingo 31 de marzo de 1985' }).boundingBox())!
    expect(ultima.x + ultima.width).toBeLessThanOrEqual(375)
    await page.getByRole('button', { name: 'jueves 14 de marzo de 1985', exact: true }).tap()
    await expect(panel(page)).toBeHidden()

    // Toque en el velo (parte superior de la pantalla) cierra sin cambiar el valor.
    await campo(page).tap()
    await expect(panel(page)).toBeVisible()
    await page.touchscreen.tap(187, 40)
    await expect(panel(page)).toBeHidden()
    await expect(campo(page)).toHaveText('14 de marzo, 1985')

    const cuerpo = await enviar(page, registros)
    expect(cuerpo.data.fecha_nacimiento).toBe('1985-03-14')
  })

  test('(5) la hoja movil es modal: bloquea el scroll y Tab no sale de ella', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).tap()
    await expect(panel(page)).toHaveAttribute('aria-modal', 'true')
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await panel(page).evaluate((p) => p.contains(document.activeElement))).toBe(true)
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await panel(page).evaluate((p) => p.contains(document.activeElement))).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    await expect(campo(page)).toBeFocused()
  })

  test('(8) movil en tema Arcilla', async ({ page }) => {
    await prepararRegistro(page, { tema: 'clay' })
    await campo(page).tap()
    await capturar(page, 'movil-arcilla-anios')
    await page.getByRole('button', { name: '2026', exact: true }).tap()
    await page.getByRole('button', { name: 'Octubre 2026', exact: true }).tap()
    await page.getByRole('button', { name: 'jueves 1 de octubre de 2026' }).tap()
    await campo(page).tap()
    await capturar(page, 'movil-arcilla-dias-hoy-y-elegido')
  })
})

test.describe('regresiones de la segunda pasada de QA', () => {
  test('(5) Tab fuera del popover de escritorio lo cierra', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).click()
    await page.getByRole('button', { name: '1990', exact: true }).click()
    await page.getByRole('button', { name: 'Marzo 1990', exact: true }).click()
    // Celda enfocada -> Limpiar esta deshabilitado -> Cerrar -> fuera del panel.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Cerrar' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel(page)).toBeHidden()
    await expect(page.locator('input[autocomplete="new-password"]')).toBeFocused()
  })

  test('(6) las flechas parten de la celda con foco real, no solo de la ultima flecha', async ({ page }) => {
    await prepararRegistro(page)
    await campo(page).click()
    await page.getByRole('button', { name: '1990', exact: true }).click()
    await page.getByRole('button', { name: 'Marzo 1990', exact: true }).click()
    // Como el cursor virtual de un lector de pantalla: enfoca otra celda sin flechas.
    await page.getByRole('button', { name: 'jueves 15 de marzo de 1990' }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('button', { name: 'miércoles 14 de marzo de 1990' })).toBeFocused()
  })

  for (const [ancho, alto] of [
    [1366, 768],
    [768, 1024],
    [1280, 720],
    [1280, 560],
  ] as const) {
    test(`(7) ${ancho}x${alto}: el popover y su pie caben en la ventana en años y en dias`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto })
      await prepararRegistro(page)
      await campo(page).click()
      await expect(panel(page)).toHaveAttribute('aria-modal', 'false')
      for (const vista of ['anios', 'dias']) {
        if (vista === 'dias') {
          await page.getByRole('button', { name: '1990', exact: true }).click()
          await page.getByRole('button', { name: 'Marzo 1990', exact: true }).click()
        }
        await esperarEntrada(page)
        const caja = (await panel(page).boundingBox())!
        expect(caja.y).toBeGreaterThanOrEqual(MARGEN_VENTANA)
        // Con margen tambien abajo: el panel no queda pegado al borde.
        expect(caja.y + caja.height).toBeLessThanOrEqual(alto - MARGEN_VENTANA)
        expect(caja.x + caja.width).toBeLessThanOrEqual(ancho)
        await expect(page.getByRole('button', { name: 'Cerrar' })).toBeInViewport({ ratio: 1 })
        await expect(campo(page)).toBeInViewport()
        await capturar(page, `popover-${ancho}x${alto}-${vista}`)
      }
    })
  }

  // Ventana baja (portatil con zoom, telefono apaisado): bajo ~500 px de alto
  // el calendario es la hoja inferior, no un popover. Se exige el pie entero a
  // la vista sin desplazar nada y una sola zona con scroll por vista.
  for (const [ancho, alto] of [
    [1280, 480],
    [844, 390],
    [740, 360],
  ] as const) {
    test(`(7) ${ancho}x${alto}: ventana baja, hoja inferior con el pie a la vista y sin scroll anidado`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto })
      await prepararRegistro(page)
      await campo(page).click()
      await expect(panel(page)).toHaveAttribute('aria-modal', 'true')
      await expect(panel(page).getByText(ETIQUETA, { exact: true })).toBeVisible()

      for (const vista of ['anios', 'dias']) {
        if (vista === 'dias') {
          await page.getByRole('button', { name: '1990', exact: true }).click()
          await page.getByRole('button', { name: 'Marzo 1990', exact: true }).click()
        }
        await esperarEntrada(page)
        const caja = (await panel(page).boundingBox())!
        expect(caja.y).toBeGreaterThanOrEqual(0)
        expect(Math.round(caja.y + caja.height)).toBeLessThanOrEqual(alto)

        const cerrar = page.getByRole('button', { name: 'Cerrar' })
        await expect(cerrar).toBeInViewport({ ratio: 1 })
        const pie = (await cerrar.boundingBox())!
        expect(pie.y + pie.height).toBeLessThanOrEqual(alto - MARGEN_VENTANA)

        // Una sola zona con scroll: ni la hoja ni dos contenedores anidados.
        const desplazables = await panel(page).evaluate((p) =>
          [p, ...p.querySelectorAll<HTMLElement>('*')].filter(
            (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1,
          ).length,
        )
        expect(desplazables).toBeLessThanOrEqual(1)
        await capturar(page, `hoja-baja-${ancho}x${alto}-${vista}`)
      }

      await page.getByRole('button', { name: 'Cerrar' }).click()
      await expect(panel(page)).toBeHidden()
    })
  }
})
