import { expect, test, type Page } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

/**
 * QA 2026-11-12 (tercera pasada, tarea 6.1): respuestas simuladas de /vision/analizar
 * con varias unas mezcladas ok / rotas por dentro, HTML en los textos, textos enormes
 * y un aviso_clinico que no es texto. En un navegador real: sin pageerror, sin pagina
 * en blanco, sin HTML inyectado y con las vecinas sanas a la vista.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const FALLIDA = 'No pudimos revisar esta uña. Intenta analizar la foto de nuevo.'
const HTML = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b>negrita</b>'

const una = (dedo: string, clinico: unknown) => ({
  dedo,
  mano: 1,
  esquinas: [
    [0.2, 0.2],
    [0.4, 0.2],
    [0.4, 0.4],
    [0.2, 0.4],
  ],
  recorte: `data:image/png;base64,${PNG_1X1.toString('base64')}`,
  forma: 'ovalada',
  aspecto: 1.4,
  punta: 0.9,
  forma_fiable: true,
  contorno: [],
  calidad: { brillo: 128, lado_origen: 400 },
  clinico,
})

const ok = (cambios: Record<string, unknown> = {}) => ({
  estado: 'ok',
  motivo: null,
  clase: 'linea_beau',
  confianza: 0.9,
  alternativas: [
    { clase: 'linea_mees', nombre: 'Línea de Mees', confianza: 0.05 },
    { clase: 'onicolisis', nombre: 'Onicólisis', confianza: 0.03 },
  ],
  reporte: { nombre: 'Línea de Beau', descripcion: 'd', asociaciones: ['a'], recomendacion: 'Consulta' },
  ...cambios,
})

async function analizar(page: Page, unas: unknown[], aviso_clinico: unknown) {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.route('**/vision/analizar', (route) =>
    route.fulfill({
      json: {
        estado: 'ok',
        motivo: null,
        manos: 1,
        unas,
        forma_predominante: 'ovalada',
        aviso: 'Observacion estetica orientativa. No es un diagnostico medico.',
        modelo: { nombre: 'mediapipe-hand-landmarker', version: '0.2.0' },
        aviso_clinico,
        modelo_clinico: { nombre: 'x', version: '1' },
      },
    }),
  )
  await simularTienda(page)
  await page.goto('/analisis-ia')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'mano.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await page.getByRole('button', { name: 'Analizar fotografía' }).click()
  await expect(page.getByRole('heading', { name: 'Tu orientación está lista' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver reporte clínico' }).click()
  return errores
}

test('unas mezcladas ok y rotas: las rotas fallan solas y la página sigue entera', async ({ page }) => {
  const errores = await analizar(
    page,
    [
      una('pulgar', ok()),
      una('indice', ok({ reporte: null })),
      una('medio', ok({ reporte: { nombre: { a: 1 }, descripcion: 'd', asociaciones: 'x', recomendacion: 'r' } })),
      una('anular', ok({ alternativas: [null, { clase: 'sin_senales', nombre: 'Sin señales reconocidas', confianza: 0.1 }] })),
      una('menique', ok({ clase: 'linea_oscura', confianza: 'alta' })),
    ],
    42,
  )
  const unas = page.getByTestId('clinico-una')
  await expect(unas).toHaveCount(5)
  await expect(unas.nth(0)).toContainText('Línea de Beau')
  // Desde 681e7a8 clinicoDe exige confianza 0..1 como Pydantic: 'alta' es un ok roto,
  // aunque la UI nunca pinte el numero.
  for (const i of [1, 2, 3, 4]) await expect(unas.nth(i)).toContainText(FALLIDA)
  await expect(unas.nth(4)).not.toContainText('Línea de Beau')
  await expect(page.getByRole('note')).toContainText('No es un diagnóstico médico')
  await expect(page.getByTestId('reporte-clinico')).not.toContainText('Sin señales reconocidas')
  await expect(page.getByTestId('forma-resumen')).toContainText('Ovalada')
  expect(errores).toEqual([])
})

test('HTML en los textos y textos enormes se pintan como texto, sin inyectar nada', async ({ page }) => {
  const largo = 'x'.repeat(100_000)
  const errores = await analizar(
    page,
    [
      una('indice', ok({ reporte: { nombre: HTML, descripcion: largo, asociaciones: [HTML], recomendacion: HTML } })),
      una('medio', ok({ alternativas: [{ clase: 'linea_mees', nombre: HTML, confianza: 0.1 }] })),
    ],
    HTML,
  )
  const panel = page.getByTestId('reporte-clinico')
  await expect(panel.getByRole('note')).toHaveText(HTML)
  await expect(panel.locator('img, script, b')).toHaveCount(0)
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
  expect(errores).toEqual([])
})
