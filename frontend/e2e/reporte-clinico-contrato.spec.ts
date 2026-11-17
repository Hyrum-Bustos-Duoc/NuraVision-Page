import { expect, test } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

/**
 * QA 2026-11-12 (reverificacion 6.1): un `ok` con el reporte roto por dentro
 * (aqui, `reporte: {}`) debe caer a clasificacion_fallida en clinicoDe. La ruta
 * /analisis-ia no tiene ErrorBoundary: si ese dato llegara al render, React
 * desmontaria todo y la pagina quedaria en blanco.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const una = (dedo: string, clinico: object) => ({
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

const okConReporte = (reporte: object) => ({
  estado: 'ok',
  motivo: null,
  clase: 'linea_beau',
  confianza: 0.9,
  alternativas: [
    { clase: 'linea_mees', nombre: 'Línea blanca transversal', confianza: 0.05 },
    { clase: 'onicolisis', nombre: 'Despegamiento', confianza: 0.03 },
  ],
  reporte,
})

test('un ok con reporte vacío no deja la página en blanco al abrir el reporte', async ({ page }) => {
  await page.route('**/vision/analizar', (route) =>
    route.fulfill({
      json: {
        estado: 'ok',
        motivo: null,
        modo: 'mano_completa',
        manos: 1,
        unas: [una('indice', okConReporte({}))],
        forma_predominante: 'ovalada',
        aviso: 'Observacion estetica orientativa. No es un diagnostico medico.',
        modelo: { nombre: 'mediapipe-hand-landmarker', version: '0.2.0' },
        aviso_clinico: 'Señal orientativa para consultar con un profesional de la salud.',
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

  // Lo esperado: la una sale como clasificacion_fallida y la forma sigue a la vista.
  await expect(page.getByText('No pudimos revisar esta uña. Intenta analizar la foto de nuevo.')).toBeVisible()
  await expect(page.getByTestId('forma-resumen')).toContainText('Ovalada')
})
