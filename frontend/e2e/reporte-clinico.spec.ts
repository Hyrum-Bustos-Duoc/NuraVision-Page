import { expect, test, type Locator, type Page } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

/**
 * Reporte clinico por una (openspec/changes/reporte-clinico-unas, requisito
 * "Reporte tras un boton"). El servicio se simula con page.route: no hay modelo
 * clinico entrenado y las fotos de manos son datos biometricos, asi que aqui no
 * se usa ninguna foto real. Lo que se prueba es la pantalla, no el clasificador.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const FOTO_A = { name: 'mano-a.png', mimeType: 'image/png', buffer: PNG_1X1 }
const FOTO_B = { name: 'mano-b.png', mimeType: 'image/png', buffer: PNG_1X1 }
const MODELO = { nombre: 'mediapipe-hand-landmarker', version: '0.2.0' }
const MODELO_CLINICO = { nombre: 'nuravision-estado_clinico-x', version: '1' }
const AVISO = 'Observacion estetica orientativa. No es un diagnostico medico.'
const AVISO_CLINICO =
  'Señal orientativa para consultar con un profesional de la salud. ' +
  'No es un diagnóstico médico ni reemplaza una evaluación clínica.'

// Mismos textos que services/api/app/vision/textos_clinicos.toml, abreviados.
const BEAU = {
  nombre: 'Surco transversal',
  descripcion: 'Se ve un surco o hendidura que cruza la uña de lado a lado.',
  asociaciones: ['Puede aparecer después de un golpe en la base de la uña.'],
  recomendacion: 'Si aparece en varias uñas a la vez, conviene consultar con un profesional de la salud.',
}
const SIN_SENALES = {
  nombre: 'Sin señales reconocidas',
  descripcion: 'En esta uña no se reconoce ninguna de las señales que el sistema sabe identificar.',
  asociaciones: [],
  recomendacion: 'Ante cualquier cambio en las uñas, conviene consultar con un profesional de la salud.',
}
const NOMBRE_ONICOLISIS = 'Uña despegada del lecho'
const NOMBRE_OSCURA = 'Banda oscura longitudinal'
// Todo lo que no puede estar en el DOM antes de pulsar el boton.
const TEXTOS_CLINICOS = [
  BEAU.nombre,
  BEAU.descripcion,
  BEAU.recomendacion,
  SIN_SENALES.nombre,
  NOMBRE_ONICOLISIS,
  NOMBRE_OSCURA,
  AVISO_CLINICO,
  'linea_beau',
  'sin_senales',
]

const ok = (clase: string, reporte: typeof BEAU) => ({
  estado: 'ok',
  motivo: null,
  clase,
  confianza: 0.873,
  alternativas: [
    { clase: 'onicolisis', nombre: NOMBRE_ONICOLISIS, confianza: 0.051 },
    { clase: 'linea_oscura', nombre: NOMBRE_OSCURA, confianza: 0.032 },
  ],
  reporte,
})
const noConcluyente = (motivo: string) => ({
  estado: 'no_concluyente',
  motivo,
  clase: null,
  confianza: null,
  alternativas: [],
  reporte: null,
})

/** `clinico === undefined` simula el servicio anterior, que no envia el campo. */
const una = (dedo: string, clinico?: object) => ({
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
  ...(clinico ? { clinico } : {}),
})

/** `modeloClinico === undefined` simula el servicio anterior: sin aviso_clinico ni modelo_clinico. */
const resultado = (unas: object[], modeloClinico?: typeof MODELO_CLINICO | null) => ({
  estado: 'ok',
  motivo: null,
  manos: 1,
  unas,
  forma_predominante: 'ovalada',
  aviso: AVISO,
  modelo: MODELO,
  ...(modeloClinico === undefined ? {} : { aviso_clinico: AVISO_CLINICO, modelo_clinico: modeloClinico }),
})

const CON_SENALES = resultado([
  una('indice', ok('linea_beau', BEAU)),
  una('medio', ok('sin_senales', SIN_SENALES)),
  una('anular', noConcluyente('confianza_baja')),
  // Un motivo que este frontend no conoce: llega por red, la union de TS no lo impide.
  una('menique', noConcluyente('motivo_de_una_version_futura')),
], MODELO_CLINICO)

async function irASubirFoto(page: Page) {
  await simularTienda(page)
  await page.goto('/analisis-ia')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Sube tu fotografía' })).toBeVisible()
}

async function analizar(page: Page, foto = FOTO_A) {
  await page.locator('input[type=file]').setInputFiles(foto)
  await page.getByRole('button', { name: 'Analizar fotografía' }).click()
  await expect(page.getByRole('heading', { name: 'Tu orientación está lista' })).toBeVisible()
}

/** Responde con cada cuerpo en orden; el ultimo se repite. */
async function simularServicio(page: Page, ...cuerpos: object[]) {
  let n = 0
  await page.route('**/vision/analizar', (route) =>
    route.fulfill({ json: cuerpos[Math.min(n++, cuerpos.length - 1)] }),
  )
}

const boton = (page: Page) => page.getByRole('button', { name: 'Ver reporte clínico' })
const panel = (page: Page) => page.getByTestId('reporte-clinico')

/** Comprueba en el HTML entero, no solo en lo visible: "oculto por CSS" no basta. */
async function esperarSinTextosClinicos(page: Page) {
  const html = await page.content()
  expect(TEXTOS_CLINICOS.filter((t) => html.includes(t))).toEqual([])
}

/** Posicion de cada texto dentro del texto del locator; -1 si falta. */
async function posiciones(l: Locator, textos: string[]) {
  const todo = await l.innerText()
  return textos.map((t) => todo.indexOf(t))
}

test.describe('Reporte clínico: servicio sin modelo clínico', () => {
  for (const [caso, cuerpo] of [
    ['servicio anterior, sin `clinico`', resultado([una('indice'), una('medio'), una('anular')])],
    [
      'todas modelo_no_entrenado',
      resultado([
        una('indice', noConcluyente('modelo_no_entrenado')),
        una('medio', noConcluyente('modelo_no_entrenado')),
        una('anular', noConcluyente('modelo_no_entrenado')),
      ], null),
    ],
  ] as const) {
    test(`${caso}: un solo botón, nada clínico antes del clic y "aún no disponible" después`, async ({ page }) => {
      await simularServicio(page, cuerpo)
      await irASubirFoto(page)
      await analizar(page)

      // La forma se ve igual que sin el reporte clinico.
      await expect(page.getByTestId('forma-resumen')).toContainText('Ovalada')
      await expect(page.getByTestId('forma-una')).toHaveText(['Ovalada', 'Ovalada', 'Ovalada'])

      await expect(boton(page)).toHaveCount(1)
      await expect(boton(page)).toHaveAttribute('aria-expanded', 'false')
      await expect(panel(page)).toHaveCount(0)
      await esperarSinTextosClinicos(page)

      await boton(page).click()
      await expect(panel(page)).toHaveText('El reporte clínico aún no está disponible.')
      await expect(page.getByTestId('clinico-una')).toHaveCount(0)
      await expect(page.getByTestId('forma-resumen')).toContainText('Ovalada')
    })
  }
})

test.describe('Reporte clínico: con resultado', () => {
  test('colapsado al cargar: el HTML no tiene nombres, textos ni el aviso clínico', async ({ page }) => {
    await simularServicio(page, CON_SENALES)
    await irASubirFoto(page)
    await analizar(page)

    await expect(boton(page)).toHaveCount(1)
    await expect(boton(page)).toHaveAttribute('aria-expanded', 'false')
    await esperarSinTextosClinicos(page)
  })

  test('al expandir: aviso primero, luego nombre, descripción, asociaciones y recomendación, sin porcentajes', async ({
    page,
  }) => {
    await simularServicio(page, CON_SENALES)
    await irASubirFoto(page)
    await analizar(page)
    await boton(page).click()

    await expect(boton(page)).toHaveAttribute('aria-expanded', 'true')
    const bloque = panel(page)
    await expect(bloque).toBeVisible()
    // El aviso es lo primero del bloque, antes del resumen y de las unas.
    expect((await bloque.innerText()).trimStart().startsWith(AVISO_CLINICO)).toBe(true)
    await expect(page.getByTestId('resumen-clinico')).toHaveText(
      'De 4 uñas, 1 muestra una señal para consultar, 1 no muestra señales reconocidas y 2 no fueron concluyentes.',
    )

    const unas = page.getByTestId('clinico-una')
    await expect(unas).toHaveCount(4)
    // Mismo orden que las tarjetas de la forma.
    await expect(unas.nth(0)).toContainText('Índice')
    await expect(unas.nth(3)).toContainText('Meñique')

    const beau = unas.nth(0)
    const orden = await posiciones(beau, [BEAU.nombre, BEAU.descripcion, BEAU.asociaciones[0], BEAU.recomendacion])
    expect(orden.every((p) => p >= 0)).toBe(true)
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
    // Alternativas solo como nombres.
    await expect(beau).toContainText(`Otras señales parecidas: ${NOMBRE_ONICOLISIS} y ${NOMBRE_OSCURA}.`)

    // sin_senales no sugiere alternativas justo despues de decir que no ve nada.
    await expect(unas.nth(1)).toContainText(SIN_SENALES.nombre)
    await expect(unas.nth(1)).not.toContainText('Otras señales parecidas')
    await expect(unas.nth(1)).not.toContainText(NOMBRE_OSCURA)

    // No concluyentes: mensaje por motivo, sin clase ni alternativas.
    await expect(unas.nth(2)).toContainText('No pudimos sacar una conclusión')
    await expect(unas.nth(3)).toHaveText(/Meñique\s*No pudimos obtener un resultado concluyente para esta uña\./)

    // Ningun numero de confianza en ningun formato.
    const texto = await bloque.innerText()
    for (const prohibido of ['%', '87', '0,87', '0.87', '0.051', '0.032', '5,1', '3,2']) {
      expect(texto, `el bloque contiene "${prohibido}"`).not.toContain(prohibido)
    }
  })

  test('nada clínico queda en localStorage ni sessionStorage tras abrir el reporte', async ({ page }) => {
    await simularServicio(page, CON_SENALES)
    await irASubirFoto(page)
    await analizar(page)
    await boton(page).click()
    await expect(panel(page)).toBeVisible()

    const guardado = await page.evaluate(() =>
      [localStorage, sessionStorage].flatMap((s) =>
        Object.keys(s).map((k) => `${k}=${s.getItem(k) ?? ''}`),
      ),
    )
    const fugas = guardado.filter((kv) =>
      ['linea_beau', 'sin_senales', 'linea_mees', BEAU.nombre, BEAU.descripcion, SIN_SENALES.nombre, AVISO_CLINICO].some(
        (t) => kv.includes(t),
      ),
    )
    expect(fugas).toEqual([])
  })

  test('analizar otra foto con el reporte abierto: el nuevo resultado empieza colapsado', async ({ page }) => {
    const OTRO = resultado(
      [una('indice', ok('linea_beau', BEAU)), una('medio', noConcluyente('clase_otra'))],
      MODELO_CLINICO,
    )
    await simularServicio(page, CON_SENALES, OTRO)
    await irASubirFoto(page)
    await analizar(page, FOTO_A)
    await boton(page).click()
    await expect(panel(page)).toBeVisible()

    await page.getByRole('button', { name: 'Analizar otra foto' }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await analizar(page, FOTO_B)

    await expect(page.getByTestId('forma-una')).toHaveCount(2)
    await expect(boton(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(panel(page)).toHaveCount(0)
    await esperarSinTextosClinicos(page)
  })

  test('sin uñas en la foto no aparece el botón', async ({ page }) => {
    await page.route('**/vision/analizar', (route) =>
      route.fulfill({
        json: {
          estado: 'no_concluyente',
          motivo: 'sin_mano',
          manos: 0,
          unas: [],
          aviso: AVISO,
          modelo: MODELO,
          aviso_clinico: AVISO_CLINICO,
          modelo_clinico: null,
        },
      }),
    )
    await irASubirFoto(page)
    await page.locator('input[type=file]').setInputFiles(FOTO_A)
    await page.getByRole('button', { name: 'Analizar fotografía' }).click()
    await expect(page.getByRole('alert')).toContainText('No encontramos una mano')
    await expect(boton(page)).toHaveCount(0)
  })
})

test.describe('Reporte clínico: teclado', () => {
  test('Enter y Espacio abren y cierran, aria-expanded y aria-controls acompañan, y el foco se ve', async ({
    page,
  }) => {
    await simularServicio(page, CON_SENALES)
    await irASubirFoto(page)
    await analizar(page)

    // Se llega al boton con el teclado (Shift+Tab y Tab), no con focus(): asi
    // Chromium aplica :focus-visible como lo veria quien navega con teclado.
    const b = boton(page)
    await b.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(b).toBeFocused()
    const foco = await b.evaluate((el) => {
      const s = getComputedStyle(el)
      return { visible: el.matches(':focus-visible'), estilo: s.outlineStyle, ancho: s.outlineWidth }
    })
    expect(foco.visible).toBe(true)
    expect(foco.estilo).not.toBe('none')
    expect(foco.ancho).not.toBe('0px')

    await page.keyboard.press('Enter')
    await expect(b).toHaveAttribute('aria-expanded', 'true')
    const controla = await b.getAttribute('aria-controls')
    expect(controla).toBeTruthy()
    await expect(panel(page)).toHaveAttribute('id', controla as string)
    await expect(b).toBeFocused()

    await page.keyboard.press('Space')
    await expect(b).toHaveAttribute('aria-expanded', 'false')
    await expect(panel(page)).toHaveCount(0)

    await page.keyboard.press('Space')
    await expect(b).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Enter')
    await expect(b).toHaveAttribute('aria-expanded', 'false')
  })
})
