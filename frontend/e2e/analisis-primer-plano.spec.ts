import { expect, test, type Page } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

/**
 * Modo primer_plano de punta a punta en un navegador real, con cada estado y motivo
 * del bloque clinico (QA 2026-11-17). El JSON tiene la forma exacta que emite
 * services/api con el modelo 0.1.0 para una imagen sintetica aceptada por la puerta:
 * 0 manos, 1 una, dedo/mano/forma null, esquinas de la foto entera. Ninguna foto real.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const FOTO = { name: 'una.png', mimeType: 'image/png', buffer: PNG_1X1 }

const BEAU = {
  nombre: 'Surco transversal',
  descripcion: 'Se ve un surco o hendidura que cruza la uña de lado a lado.',
  asociaciones: ['Puede aparecer después de un golpe en la base de la uña.'],
  recomendacion: 'Conviene consultar con un profesional de la salud.',
}
const GENERICO = {
  nombre: 'Señal sin identificar',
  descripcion: 'En esta uña se ve alguna de las señales que el sistema conoce, pero no puede decir con seguridad cuál.',
  asociaciones: [],
  recomendacion: 'Conviene mostrar la uña a un profesional de la salud para que la valore en persona.',
}
// Nombres reales de textos_clinicos.toml de las dos clases que nunca se muestran.
const OCULTOS = ['Línea blanca transversal', 'Uña curvada y punta del dedo ensanchada']

const ALTERNATIVAS = [
  { clase: 'onicolisis', nombre: 'Uña separada de su lecho', confianza: 0.05 },
  { clase: 'una_terry', nombre: 'Uña blanquecina con franja oscura en el extremo', confianza: 0.02 },
]
const nc = (motivo: string) => ({
  estado: 'no_concluyente',
  motivo,
  clase: null,
  confianza: null,
  alternativas: [],
  reporte: null,
  p_alguna_senal: null,
})
const ok = (clase: string, reporte = BEAU) => ({
  estado: 'ok',
  motivo: null,
  clase,
  confianza: 0.81,
  alternativas: ALTERNATIVAS,
  reporte: { ...reporte, nombre: clase === 'linea_mees' ? OCULTOS[0] : clase === 'acropaquia' ? OCULTOS[1] : reporte.nombre },
  p_alguna_senal: null,
})

function respuesta(clinico: unknown, calidad: unknown = { brillo: 184.56107740752554, lado_origen: 800 }) {
  return {
    estado: 'ok',
    motivo: null,
    modo: 'primer_plano',
    manos: 0,
    unas: [
      {
        dedo: null,
        mano: null,
        esquinas: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
        recorte: `data:image/png;base64,${PNG_1X1.toString('base64')}`,
        forma: null,
        aspecto: null,
        punta: null,
        forma_fiable: false,
        contorno: [],
        calidad,
        clinico,
      },
    ],
    forma_predominante: null,
    aviso: 'Observacion estetica orientativa. No es un diagnostico medico.',
    modelo: { nombre: 'mediapipe-hand-landmarker', version: '0.2.0' },
    aviso_clinico:
      'Señal orientativa para consultar con un profesional de la salud. No es un diagnóstico médico ni reemplaza una evaluación clínica.',
    modelo_clinico: { nombre: 'nuravision-estado_clinico-MobileNetV3Small', version: '0.1.0' },
  }
}

async function analizar(page: Page, cuerpo: unknown) {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.route('**/vision/analizar', (route) => route.fulfill({ json: cuerpo }))
  await simularTienda(page)
  await page.goto('/analisis-ia')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.locator('input[type=file]').setInputFiles(FOTO)
  await page.getByRole('button', { name: 'Analizar fotografía' }).click()
  return errores
}

const SENAL = 'De 1 uña, 1 muestra una señal para consultar, 0 no muestran señales reconocidas y 0 no fueron concluyentes.'
const NC = 'De 1 uña, 0 muestran una señal para consultar, 0 no muestran señales reconocidas y 1 no fue concluyente.'

const CASOS: { nombre: string; clinico: unknown; espera: string; resumen: string }[] = [
  { nombre: 'ok con senal', clinico: ok('linea_beau'), espera: BEAU.nombre, resumen: SENAL },
  {
    nombre: 'senal_inespecifica',
    clinico: { ...nc('x'), estado: 'senal_inespecifica', motivo: null, reporte: GENERICO, p_alguna_senal: 0.874 },
    espera: GENERICO.nombre,
    resumen: SENAL,
  },
  {
    nombre: 'foto_insuficiente',
    clinico: nc('foto_insuficiente'),
    espera: 'muy oscura o se ve muy pequeña',
    resumen: NC,
  },
  {
    nombre: 'clase_no_fiable',
    clinico: nc('clase_no_fiable'),
    espera: 'no podemos afirmar nada sobre esta uña',
    resumen: NC,
  },
  {
    nombre: 'ok linea_mees de un servicio anterior',
    clinico: ok('linea_mees'),
    espera: 'No pudimos obtener un resultado concluyente para esta uña.',
    resumen: NC,
  },
  {
    nombre: 'ok acropaquia de un servicio anterior',
    clinico: ok('acropaquia'),
    espera: 'No pudimos obtener un resultado concluyente para esta uña.',
    resumen: NC,
  },
]

test.describe('Análisis de uñas: primer plano', () => {
  for (const caso of CASOS) {
    test(`${caso.nombre}: una sola uña sin dedo, mano ni forma, y nada vacío ni oculto en pantalla`, async ({
      page,
    }) => {
      const errores = await analizar(page, respuesta(caso.clinico))

      await expect(page.getByRole('heading', { name: 'Tu orientación está lista' })).toBeVisible()
      // Sin "en 0 manos": manos es 0 en primer_plano.
      await expect(page.getByRole('heading', { name: /^Encontramos 1 uña$/ })).toBeVisible()
      await expect(page.getByTestId('forma-resumen')).toContainText('no medimos la forma')
      await expect(page.getByTestId('forma-una')).toHaveText('Forma no medida')

      await page.getByRole('button', { name: 'Ver reporte clínico' }).click()
      const panel = page.getByTestId('reporte-clinico')
      await expect(page.getByTestId('clinico-una')).toHaveCount(1)
      await expect(page.getByTestId('clinico-una')).toContainText(caso.espera)
      await expect(page.getByTestId('resumen-clinico')).toHaveText(caso.resumen)
      await expect(page.getByTestId('resumen-clinico')).not.toContainText('Mano')

      const texto = await page.locator('main').innerText()
      for (const prohibido of ['undefined', 'null', 'NaN', '[object Object]', '%', '0.874', '0.81', ...OCULTOS]) {
        expect(texto, `la pantalla contiene "${prohibido}"`).not.toContain(prohibido)
      }
      // Ni rotulo de dedo vacio ni la palabra "mano" de un rotulo de varias manos.
      await expect(panel.locator('p.uppercase')).toHaveCount(0)
      expect(errores).toEqual([])
    })
  }

  test('calidad fuera de contrato: el servicio se trata como caído y no pasa a resultados', async ({ page }) => {
    const errores = await analizar(page, respuesta(ok('linea_beau'), { brillo: 255.5, lado_origen: 800 }))
    await expect(page.getByText('El servicio de análisis no está disponible en este momento.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tu orientación está lista' })).toHaveCount(0)
    expect(errores).toEqual([])
  })

  test('sin calidad: igual que un servicio que no habla este contrato', async ({ page }) => {
    const cuerpo = respuesta(ok('linea_beau'))
    delete (cuerpo.unas[0] as { calidad?: unknown }).calidad
    const errores = await analizar(page, cuerpo)
    await expect(page.getByText('El servicio de análisis no está disponible en este momento.')).toBeVisible()
    expect(errores).toEqual([])
  })
})
