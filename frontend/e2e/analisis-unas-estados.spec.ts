import { expect, test, type Page, type Route } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

/**
 * Estado de la pantalla de analisis cuando la clienta hace algo mientras el
 * servicio responde: cambiar de foto, salir, volver atras, pedir otra foto.
 * El servicio se simula; lo que se prueba es que no quede nada pegado.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const FOTO_A = { name: 'mano-a.png', mimeType: 'image/png', buffer: PNG_1X1 }
const FOTO_B = { name: 'mano-b.png', mimeType: 'image/png', buffer: PNG_1X1 }
const MODELO = { nombre: 'mediapipe-hand-landmarker', version: '0.1.0' }
const AVISO = 'Observacion estetica orientativa. No es un diagnostico medico.'
const OK = {
  estado: 'ok',
  motivo: null,
  manos: 1,
  unas: [
    {
      dedo: 'indice',
      mano: 1,
      esquinas: [
        [0.2, 0.2],
        [0.4, 0.2],
        [0.4, 0.4],
        [0.2, 0.4],
      ],
      recorte: `data:image/png;base64,${PNG_1X1.toString('base64')}`,
      forma: null,
      aspecto: null,
      punta: null,
      forma_fiable: false,
      contorno: [],
      calidad: { brillo: 128, lado_origen: 400 },
    },
  ],
  forma_predominante: null,
  aviso: AVISO,
  modelo: MODELO,
}

/** Retiene la peticion al servicio hasta que el test llame a soltar(). */
async function servicioRetenido(page: Page) {
  let pendiente: Route | null = null
  let llamadas = 0
  let llego: () => void = () => {}
  const enCurso = new Promise<void>((r) => (llego = r))
  await page.route('**/vision/analizar', (route) => {
    llamadas++
    pendiente = route
    llego()
  })
  return {
    enCurso,
    llamadas: () => llamadas,
    // Si el navegador ya aborto la peticion, fulfill falla: es lo esperado.
    soltar: (json: unknown) => (pendiente as Route | null)?.fulfill({ json }).catch(() => {}),
  }
}

async function irASubirFoto(page: Page) {
  await simularTienda(page)
  await page.goto('/analisis-ia')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Sube tu fotografía' })).toBeVisible()
}

const entrada = (page: Page) => page.locator('input[type=file]')
const botonAnalizar = (page: Page) => page.getByRole('button', { name: /Analizar fotografía|Analizando/ })

test.describe('Analisis de unas: estado entre acciones', () => {
  test('cambiar de foto mientras analiza cancela, libera el boton y no salta a resultados', async ({ page }) => {
    const servicio = await servicioRetenido(page)
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await botonAnalizar(page).click()
    await servicio.enCurso
    await expect(page.getByText('Analizando tu fotografía…')).toBeVisible()

    await entrada(page).setInputFiles(FOTO_B)
    await expect(page.getByText('Analizando tu fotografía…')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Analizar fotografía' })).toBeEnabled()

    await servicio.soltar(OK)
    await page.waitForTimeout(300)
    await expect(page.getByRole('heading', { name: 'Sube tu fotografía' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('volver a "Cambiar enfoque" mientras analiza no debe llevar a resultados por sorpresa', async ({ page }) => {
    const servicio = await servicioRetenido(page)
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await botonAnalizar(page).click()
    await servicio.enCurso

    await page.getByRole('button', { name: '← Cambiar enfoque' }).click()
    await expect(page.getByRole('heading', { name: 'Prepara tu fotografía' })).toBeVisible()

    await servicio.soltar(OK)
    await page.waitForTimeout(300)
    // La clienta esta eligiendo enfoque: la respuesta vieja no la saca de ahi.
    await expect(page.getByRole('heading', { name: 'Prepara tu fotografía' })).toBeVisible()
  })

  test('un error anterior no queda pegado al elegir otra foto', async ({ page }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({ status: 400, json: { codigo: 'imagen_invalida', detalle: 'x' } }),
    )
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await botonAnalizar(page).click()
    await expect(page.getByRole('alert')).toContainText('No pudimos leer esta imagen')

    await entrada(page).setInputFiles(FOTO_B)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('un no concluyente anterior no queda pegado al elegir otra foto', async ({ page }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({
        json: { estado: 'no_concluyente', motivo: 'imagen_pequena', manos: 0, unas: [], aviso: AVISO, modelo: MODELO },
      }),
    )
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await botonAnalizar(page).click()
    await expect(page.getByRole('alert')).toContainText('muy pequeña')

    await entrada(page).setInputFiles(FOTO_B)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('doble clic en Analizar manda una sola peticion', async ({ page }) => {
    const servicio = await servicioRetenido(page)
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await botonAnalizar(page).dblclick()
    await servicio.enCurso
    await page.waitForTimeout(300)
    expect(servicio.llamadas()).toBe(1)
  })

  test('salir de la pagina mientras analiza y volver no deja "Analizando" colgado', async ({ page }) => {
    const servicio = await servicioRetenido(page)
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await botonAnalizar(page).click()
    await servicio.enCurso

    await page.getByRole('link', { name: 'Servicios' }).first().click()
    await servicio.soltar(OK)
    await page.getByRole('link', { name: 'Análisis IA' }).first().click()
    await page.getByRole('button', { name: 'Continuar' }).click()

    await expect(page.getByText('Analizando tu fotografía…')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Analizar fotografía' })).toBeDisabled()
  })

  test('"Analizar otra foto" tras un resultado empieza limpio', async ({ page }) => {
    await page.route('**/vision/analizar', (route) => route.fulfill({ json: OK }))
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await botonAnalizar(page).click()
    await expect(page.getByRole('heading', { name: 'Tu orientación está lista' })).toBeVisible()

    await page.getByRole('button', { name: 'Analizar otra foto' }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByAltText('Vista previa de tu fotografía')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Analizar fotografía' })).toBeDisabled()
  })

  test('cada URL de vista previa se libera al cambiar de foto y al salir', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __urls: { creadas: string[]; liberadas: string[] } }
      w.__urls = { creadas: [], liberadas: [] }
      const crear = URL.createObjectURL.bind(URL)
      const liberar = URL.revokeObjectURL.bind(URL)
      URL.createObjectURL = (o: Blob | MediaSource) => {
        const u = crear(o)
        w.__urls.creadas.push(u)
        return u
      }
      URL.revokeObjectURL = (u: string) => {
        w.__urls.liberadas.push(u)
        liberar(u)
      }
    })
    await irASubirFoto(page)
    await entrada(page).setInputFiles(FOTO_A)
    await entrada(page).setInputFiles(FOTO_B)
    await page.getByRole('link', { name: 'Servicios' }).first().click()
    // La ruta nueva puede cargar perezosa: hasta que se monte, la pagina vieja sigue viva.
    await expect(page.getByRole('heading', { name: 'Sube tu fotografía' })).toHaveCount(0)

    const urls = await page.evaluate(
      () => (window as unknown as { __urls: { creadas: string[]; liberadas: string[] } }).__urls,
    )
    expect(urls.creadas).toHaveLength(2)
    expect([...urls.liberadas].sort()).toEqual([...urls.creadas].sort())
  })
})
