import { expect, test, type Page } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

/** PNG de 1x1: lo unico que importa es que se pueda subir como "foto". */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const RECORTE = `data:image/png;base64,${PNG_1X1.toString('base64')}`

const FOTO = { name: 'mano.png', mimeType: 'image/png', buffer: PNG_1X1 }

const una = (dedo: string) => ({
  dedo,
  mano: 1,
  esquinas: [
    [0.2, 0.2],
    [0.4, 0.2],
    [0.4, 0.4],
    [0.2, 0.4],
  ],
  recorte: RECORTE,
  forma: null,
  aspecto: null,
  punta: null,
  forma_fiable: false,
  contorno: [],
  calidad: { brillo: 128, lado_origen: 400 },
})

const conForma = (dedo: string, forma: string, fiable = true) => ({
  ...una(dedo),
  forma,
  aspecto: 1.4,
  punta: 0.9,
  forma_fiable: fiable,
  contorno: [
    [0.3, 0.2],
    [0.7, 0.2],
    [0.7, 0.8],
    [0.3, 0.8],
  ],
})

const MODELO = { nombre: 'mediapipe-hand-landmarker', version: '0.2.0' }
const AVISO = 'Observacion estetica orientativa. No es un diagnostico medico.'

/** Lleva la pantalla hasta el paso de subir la foto. */
async function irASubirFoto(page: Page) {
  await simularTienda(page)
  await page.goto('/analisis-ia')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Sube tu fotografía' })).toBeVisible()
}

async function subirYAnalizar(page: Page) {
  await page.locator('input[type=file]').setInputFiles(FOTO)
  await page.getByRole('button', { name: 'Analizar fotografía' }).click()
}

test.describe('Analisis de unas', () => {
  test('muestra las unas detectadas con su recorte y el aviso', async ({ page }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({
        json: {
          estado: 'ok',
          motivo: null,
          manos: 1,
          unas: [una('pulgar'), una('indice')],
          forma_predominante: null,
          aviso: AVISO,
          modelo: MODELO,
        },
      }),
    )
    await irASubirFoto(page)
    await subirYAnalizar(page)

    await expect(page.getByRole('heading', { name: 'Tu orientación está lista' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Encontramos 2 uñas en 1 mano/ })).toBeVisible()
    await expect(page.getByAltText('Uña del dedo pulgar')).toBeVisible()
    await expect(page.getByAltText('Uña del dedo índice')).toBeVisible()
    await expect(
      page.getByText(/El reporte clínico es una señal para consultar con un profesional, no un diagnóstico médico/),
    ).toBeVisible()
  })

  test('dice la forma predominante y la de cada una, marcando la poco fiable', async ({ page }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({
        json: {
          estado: 'ok',
          motivo: null,
          manos: 1,
          unas: [
            conForma('pulgar', 'cuadrada'),
            conForma('indice', 'cuadrada'),
            conForma('medio', 'almendra', false),
          ],
          forma_predominante: 'cuadrada',
          aviso: AVISO,
          modelo: MODELO,
        },
      }),
    )
    await irASubirFoto(page)
    await subirYAnalizar(page)

    const resumen = page.getByTestId('forma-resumen')
    await expect(resumen).toContainText('Cuadrada')
    await expect(resumen).toContainText('Medimos 3 de 3 uñas')
    await expect(resumen).toContainText('orientativa')
    const porUna = page.getByTestId('forma-una')
    await expect(porUna.nth(0)).toHaveText('Cuadrada')
    await expect(porUna.nth(2)).toContainText('poco fiable')
  })

  test('si no se pudo medir la forma lo dice en vez de inventar una', async ({ page }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({
        json: { estado: 'ok', motivo: null, manos: 1, unas: [una('indice')], forma_predominante: null, aviso: AVISO, modelo: MODELO },
      }),
    )
    await irASubirFoto(page)
    await subirYAnalizar(page)

    await expect(page.getByTestId('forma-resumen')).toContainText('No pudimos medir la forma')
    await expect(page.getByTestId('forma-una')).toHaveText('Forma no medida')
  })

  test('sin mano en la foto se queda en la subida y dice que hacer, sin pasar a resultados', async ({
    page,
  }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({
        json: { estado: 'no_concluyente', motivo: 'sin_mano', manos: 0, unas: [], forma_predominante: null, aviso: AVISO, modelo: MODELO },
      }),
    )
    await irASubirFoto(page)
    await subirYAnalizar(page)

    await expect(page.getByRole('alert')).toContainText('No encontramos una mano')
    await expect(page.getByRole('heading', { name: 'Sube tu fotografía' })).toBeVisible()
    // Puede volver a intentarlo sin recargar.
    await expect(page.getByRole('button', { name: 'Analizar fotografía' })).toBeEnabled()
  })

  test('con el servicio caido avisa y permite reintentar', async ({ page }) => {
    await page.route('**/vision/analizar', (route) => route.abort('connectionrefused'))
    await irASubirFoto(page)
    await subirYAnalizar(page)

    await expect(page.getByRole('alert')).toContainText('no está disponible')
    await expect(page.getByRole('button', { name: 'Analizar fotografía' })).toBeEnabled()
  })

  test('un archivo que el servicio rechaza muestra el mensaje de imagen invalida', async ({ page }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({ status: 400, json: { codigo: 'imagen_invalida', detalle: 'no es JPEG' } }),
    )
    await irASubirFoto(page)
    await subirYAnalizar(page)

    await expect(page.getByRole('alert')).toContainText('No pudimos leer esta imagen')
  })

  test('sin foto elegida el boton de analizar esta deshabilitado', async ({ page }) => {
    await irASubirFoto(page)
    await expect(page.getByRole('button', { name: 'Analizar fotografía' })).toBeDisabled()
  })
})

/**
 * Contra el servicio real (services/api en el puerto 8000), con una foto tuya:
 *   E2E_FOTO_MANO=/ruta/a/mano.jpg npm run test:e2e -- analisis-unas
 * La foto nunca se versiona: son fotos de manos de personas reales.
 */
test.describe('Analisis de unas, servicio real', () => {
  const foto = process.env.E2E_FOTO_MANO
  test.skip(!foto, 'define E2E_FOTO_MANO con la ruta de una foto de una mano')

  test('detecta las unas de una foto real', async ({ page }) => {
    await irASubirFoto(page)
    await page.locator('input[type=file]').setInputFiles(foto as string)
    await page.getByRole('button', { name: 'Analizar fotografía' }).click()

    await expect(page.getByRole('heading', { name: 'Tu orientación está lista' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('heading', { name: /Encontramos \d+ uñas?/ })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('resultado.png'), fullPage: true })
  })
})
