import { mkdirSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'
import { simularSesionStaff } from './fixtures/sesion'

/**
 * Cumpleaños en el panel de usuarios (openspec/changes/cumpleanos-clientas).
 *
 * `perfiles` se sirve desde memoria con page.route; el resto de la base
 * responde vacio. El reloj del navegador se fija por escenario y la zona es
 * America/Santiago, que es donde trabaja el estudio.
 */

test.use({ timezoneId: 'America/Santiago', locale: 'es-CL' })

const CAPTURAS = process.env.QA_CAPTURAS

type Perfil = {
  id: string
  nombre: string
  telefono: string | null
  email: string
  rol: 'cliente' | 'profesional' | 'admin'
  profesional_id: number | null
  creado_en: string
  fecha_nacimiento?: string | null
}

let secuencia = 0
function perfil(nombre: string, fecha: string | null, rol: Perfil['rol'] = 'cliente'): Perfil {
  secuencia += 1
  return {
    id: `00000000-0000-4000-8000-${String(100 + secuencia).padStart(12, '0')}`,
    nombre,
    telefono: null,
    email: `${nombre.toLowerCase().replace(/\s+/g, '.')}@correo.cl`,
    rol,
    profesional_id: rol === 'profesional' ? 1 : null,
    // Orden del panel: creado_en descendente. Cada perfil es un dia mas viejo.
    creado_en: new Date(Date.UTC(2026, 8, 30 - secuencia, 15)).toISOString(),
    fecha_nacimiento: fecha,
  }
}

/**
 * Sesion de staff del fixture, con el vencimiento movido a 2100: el fixture lo
 * calcula con la hora real de Node, y con el reloj del navegador en 2027 la
 * sesion estaria vencida e intentaria refrescarse contra Supabase.
 */
async function abrirPanel(page: Page, ahora: string, perfiles: Perfil[]) {
  const patches: Request[] = []
  await page.clock.setFixedTime(new Date(ahora))
  await simularSesionStaff(page)
  await page.addInitScript(() => {
    for (const clave of Object.keys(localStorage)) {
      if (!clave.endsWith('-auth-token')) continue
      const sesion = JSON.parse(localStorage.getItem(clave)!)
      sesion.expires_at = 4102444800
      localStorage.setItem(clave, JSON.stringify(sesion))
    }
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/perfiles*', (route) => {
    const req = route.request()
    if (req.method() === 'PATCH') {
      patches.push(req)
      const id = new URL(req.url()).searchParams.get('id')?.replace('eq.', '')
      const i = perfiles.findIndex((p) => p.id === id)
      perfiles[i] = { ...perfiles[i], ...(req.postDataJSON() as Partial<Perfil>) }
      return route.fulfill({ json: [perfiles[i]] })
    }
    return route.fulfill({ json: perfiles })
  })
  await page.goto('/admin/usuarios')
  await expect(page.getByRole('heading', { name: 'Usuarios y roles' })).toBeVisible()
  return { patches }
}

const filtro = (page: Page) => page.getByRole('button', { name: /^Próximos cumpleaños/ })
const celdaCumple = (page: Page, nombre: string) =>
  page.getByRole('row').filter({ hasText: nombre }).getByRole('cell').nth(1)
/** Nombres de las filas visibles, en orden. */
const nombresVisibles = (page: Page) =>
  page.locator('tbody tr td:first-child p.font-medium').allTextContents()

async function capturar(page: Page, nombre: string) {
  if (!CAPTURAS) return
  mkdirSync(CAPTURAS, { recursive: true })
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true })
}

// 2026-10-08 a mediodia en Chile (UTC-3 en octubre).
const OCT8 = '2026-10-08T15:00:00Z'

test.describe('columna Cumpleaños', () => {
  test('muestra dia y mes sin desplazarse en Chile, y «—» sin fecha', async ({ page }) => {
    await abrirPanel(page, OCT8, [
      perfil('Ana Marzo', '1990-03-04'),
      perfil('Sin Fecha', null),
      perfil('Nacio Bisiesto', '2000-02-29'),
      perfil('Primero Enero', '1990-01-01'),
    ])
    await expect(page.getByRole('columnheader', { name: 'Cumpleaños' })).toBeVisible()
    await expect(celdaCumple(page, 'Ana Marzo')).toHaveText('4 de marzo')
    await expect(celdaCumple(page, 'Sin Fecha')).toHaveText('—')
    await expect(celdaCumple(page, 'Nacio Bisiesto')).toHaveText('29 de febrero')
    // El 1 de enero es el caso donde un parseo UTC daria «31 de diciembre».
    await expect(celdaCumple(page, 'Primero Enero')).toHaveText('1 de enero')
    // Sin año ni edad.
    await expect(page.locator('tbody')).not.toContainText('1990')
    await expect(page.locator('tbody')).not.toContainText('años')
  })

  test('base sin 0016 (columna ausente): la lista carga y todo es «—»', async ({ page }) => {
    const sinColumna = [perfil('Ana Marzo', null), perfil('Bea Octubre', null)].map(
      ({ fecha_nacimiento: _omitida, ...resto }) => resto as Perfil,
    )
    await abrirPanel(page, OCT8, sinColumna)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(celdaCumple(page, 'Ana Marzo')).toHaveText('—')
    await expect(celdaCumple(page, 'Bea Octubre')).toHaveText('—')
    await filtro(page).click()
    await expect(page.getByText('Nadie cumple años en los próximos 30 días.')).toBeVisible()
  })

  test('editar el nombre no envia ni cambia el cumpleaños', async ({ page }) => {
    const { patches } = await abrirPanel(page, OCT8, [perfil('Ana Marzo', '1990-03-04')])
    await page.getByRole('button', { name: 'Editar a Ana Marzo' }).click()
    const modal = page.getByRole('dialog')
    await modal.getByLabel('Nombre').fill('Ana Corregida')
    await modal.getByRole('button', { name: 'Guardar' }).click()
    await expect(celdaCumple(page, 'Ana Corregida')).toHaveText('4 de marzo')
    expect(patches).toHaveLength(1)
    expect(Object.keys(patches[0].postDataJSON() as object).sort()).toEqual(['nombre', 'rol', 'telefono'])
    await page.reload()
    await expect(celdaCumple(page, 'Ana Corregida')).toHaveText('4 de marzo')
  })
})

test.describe('filtro «Próximos cumpleaños»', () => {
  test('orden, etiquetas y bordes de la ventana (hoy 2026-10-08)', async ({ page }) => {
    // Orden de entrada deliberadamente distinto del esperado.
    await abrirPanel(page, OCT8, [
      perfil('Cuatro Treinta', '1991-11-07'),
      perfil('Fuera Treintayuno', '1992-11-08'),
      perfil('Dos Manana', '1993-10-09'),
      perfil('Fuera Ayer', '1994-10-07'),
      perfil('Uno Hoy', '1995-10-08'),
      perfil('Sin Fecha', null),
      perfil('Tres Doce', '1996-10-20'),
    ])
    const ordenInicial = await nombresVisibles(page)
    await capturar(page, 'escritorio-filtro-apagado')

    await expect(filtro(page)).toHaveAttribute('aria-pressed', 'false')
    await filtro(page).click()
    await expect(filtro(page)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => nombresVisibles(page)).toEqual(['Uno Hoy', 'Dos Manana', 'Tres Doce', 'Cuatro Treinta'])
    await expect(celdaCumple(page, 'Uno Hoy')).toHaveText('8 de octubreHoy')
    await expect(celdaCumple(page, 'Dos Manana')).toHaveText('9 de octubreMañana')
    await expect(celdaCumple(page, 'Tres Doce')).toHaveText('20 de octubreen 12 días')
    await expect(celdaCumple(page, 'Cuatro Treinta')).toHaveText('7 de noviembreen 30 días')
    await capturar(page, 'escritorio-filtro-activo')

    // Inactivo: vuelve el orden de la lista, con todas las cuentas.
    await filtro(page).click()
    await expect.poll(() => nombresVisibles(page)).toEqual(ordenInicial)
  })

  test('cambio de año: hoy 2026-12-20, cumple 01-05 -> «en 16 días»', async ({ page }) => {
    await abrirPanel(page, '2026-12-20T15:00:00Z', [perfil('Enero Cinco', '1990-01-05'), perfil('Dic Diecinueve', '1990-12-19')])
    await filtro(page).click()
    await expect.poll(() => nombresVisibles(page)).toEqual(['Enero Cinco'])
    await expect(celdaCumple(page, 'Enero Cinco')).toContainText('en 16 días')
  })

  for (const [ahora, esperado] of [
    ['2027-02-27T15:00:00Z', 'Mañana'],
    ['2027-02-28T15:00:00Z', 'Hoy'],
    ['2028-02-28T15:00:00Z', 'Mañana'],
    ['2027-03-01T15:00:00Z', null],
  ] as const) {
    test(`29 de febrero con hoy = ${ahora.slice(0, 10)} -> ${esperado ?? 'no aparece'}`, async ({ page }) => {
      await abrirPanel(page, ahora, [perfil('Bisiesta', '2000-02-29'), perfil('Otra', '1990-06-01')])
      await expect(celdaCumple(page, 'Bisiesta')).toContainText('29 de febrero')
      await filtro(page).click()
      if (esperado) {
        await expect.poll(() => nombresVisibles(page)).toEqual(['Bisiesta'])
        await expect(celdaCumple(page, 'Bisiesta')).toHaveText(`29 de febrero${esperado}`)
      } else {
        await expect(page.getByText('Nadie cumple años en los próximos 30 días.')).toBeVisible()
      }
    })
  }

  test('22:30 del 2026-10-08 en Chile (ya 2026-10-09 en UTC): 10-08 es «Hoy»', async ({ page }) => {
    await abrirPanel(page, '2026-10-09T01:30:00Z', [perfil('Cumple Hoy', '1990-10-08'), perfil('Cumple Manana', '1990-10-09')])
    await filtro(page).click()
    await expect.poll(() => nombresVisibles(page)).toEqual(['Cumple Hoy', 'Cumple Manana'])
    await expect(celdaCumple(page, 'Cumple Hoy')).toContainText('Hoy')
    await expect(celdaCumple(page, 'Cumple Manana')).toContainText('Mañana')
  })

  test('cambio de horario de septiembre: hoy 2026-09-01, cumple 09-15 -> «en 14 días»', async ({ page }) => {
    await abrirPanel(page, '2026-09-01T15:00:00Z', [perfil('Septiembre', '1990-09-15')])
    await filtro(page).click()
    await expect(celdaCumple(page, 'Septiembre')).toContainText('en 14 días')
  })

  test('se combina con el rol y con la búsqueda (las tres condiciones a la vez)', async ({ page }) => {
    await abrirPanel(page, OCT8, [
      perfil('Clienta Pronto', '1990-10-10'),
      perfil('Clienta Lejos', '1990-05-01'),
      perfil('Profe Pronto', '1990-10-11', 'profesional'),
      perfil('Admin Pronto', '1990-10-12', 'admin'),
      perfil('Clienta Otra Pronto', '1990-10-13'),
    ])
    await filtro(page).click()
    await page.getByRole('button', { name: /^Clienta \(/ }).click()
    await expect.poll(() => nombresVisibles(page)).toEqual(['Clienta Pronto', 'Clienta Otra Pronto'])
    await capturar(page, 'escritorio-filtro-con-rol')

    await page.getByRole('searchbox', { name: 'Buscar usuarios' }).fill('otra')
    await expect.poll(() => nombresVisibles(page)).toEqual(['Clienta Otra Pronto'])

    // Rol sin nadie que cumpla: mensaje vacio del filtro.
    await page.getByRole('searchbox', { name: 'Buscar usuarios' }).fill('')
    await page.getByRole('button', { name: /^Profesional \(/ }).click()
    await expect.poll(() => nombresVisibles(page)).toEqual(['Profe Pronto'])
    await page.getByRole('button', { name: /^Administración \(/ }).click()
    await expect.poll(() => nombresVisibles(page)).toEqual(['Admin Pronto'])
  })

  test('vacío: nadie cumple en 30 días', async ({ page }) => {
    await abrirPanel(page, OCT8, [perfil('Lejos', '1990-05-01'), perfil('Sin Fecha', null)])
    await filtro(page).click()
    await expect(page.getByText('Nadie cumple años en los próximos 30 días.')).toBeVisible()
    await expect.poll(() => nombresVisibles(page)).toEqual([])
    await capturar(page, 'escritorio-filtro-vacio')
  })

  test('etiqueta con filtro apagado; el contador aplica rol y búsqueda', async ({ page }) => {
    await abrirPanel(page, OCT8, [
      perfil('Clienta Pronto', '1990-10-10'),
      perfil('Profe Pronto', '1990-10-11', 'profesional'),
      perfil('Profe Dos', '1990-10-12', 'profesional'),
    ])
    // La etiqueta aparece aunque el filtro este apagado.
    await expect(celdaCumple(page, 'Clienta Pronto')).toHaveText('10 de octubreen 2 días')
    await expect(filtro(page)).toHaveText(/\(3\)/)
    // Decisión del coordinador (2026-10-08): el contador cuenta lo filtrado.
    await page.getByRole('button', { name: /^Clienta \(/ }).click()
    await expect(filtro(page)).toHaveText(/\(1\)/)
    await filtro(page).click()
    await expect.poll(() => nombresVisibles(page)).toEqual(['Clienta Pronto'])
    await page.getByRole('searchbox', { name: 'Buscar usuarios' }).fill('nadie')
    await expect(page.getByText('Nadie cumple años en los próximos 30 días.')).toBeVisible()
    await expect(filtro(page)).toHaveText(/\(0\)/)
    await capturar(page, 'escritorio-contador-vs-vacio')
  })
})

test.describe('escritorio: la columna nueva no esconde las acciones', () => {
  for (const ancho of [1280, 1366, 1440]) {
    test(`${ancho}px: Editar y Eliminar visibles sin desplazar la tabla`, async ({ page }) => {
      // Hallazgo de QA (2026-10-08): con la columna Cumpleaños la tabla medía
      // 1099 px y a 1280/1366 recortaba las acciones. Arreglado: ancho mínimo
      // menor, correo truncado con title y la etiqueta bajo la fecha.
      await page.setViewportSize({ width: ancho, height: 800 })
      const larga = perfil('Camila Fuentes Aravena', '1990-10-10')
      larga.email = 'camila.fuentes.aravena@correo.cl'
      larga.telefono = '+56 9 1234 5678'
      await abrirPanel(page, OCT8, [larga])
      // El ancho depende de la fuente web: sin esperarla, a 1440 px el margen es
      // de unos 13 px y el resultado variaba entre ejecuciones.
      await page.evaluate(() => document.fonts.ready)
      const caja = page.locator('table').locator('xpath=..')
      const borde = (await caja.boundingBox())!
      const eliminar = (await page.getByRole('button', { name: 'Eliminar a Camila Fuentes Aravena' }).boundingBox())!
      expect(eliminar.x + eliminar.width).toBeLessThanOrEqual(borde.x + borde.width)
      // Y la tabla no necesita scroll dentro de su caja.
      expect(await caja.evaluate((c) => c.scrollWidth <= c.clientWidth)).toBe(true)
      // El correo truncado conserva el texto completo en su title.
      await expect(page.getByTitle('camila.fuentes.aravena@correo.cl')).toBeVisible()
    })
  }
})

test.describe('móvil 375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('sin scroll horizontal de página; la tabla se desplaza dentro de su caja', async ({ page }) => {
    await abrirPanel(page, OCT8, [perfil('Uno Hoy', '1995-10-08'), perfil('Dos Manana', '1993-10-09'), perfil('Sin Fecha', null)])
    await filtro(page).tap()
    await expect.poll(() => nombresVisibles(page)).toEqual(['Uno Hoy', 'Dos Manana'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    const caja = page.locator('table').locator('xpath=..')
    expect(await caja.evaluate((c) => c.scrollWidth > c.clientWidth && getComputedStyle(c).overflowX)).toBe('auto')
    // Con el filtro activo, la fecha y su etiqueta se ven sin desplazar la tabla.
    await expect(celdaCumple(page, 'Uno Hoy')).toBeInViewport({ ratio: 1 })
    await expect(celdaCumple(page, 'Dos Manana')).toBeInViewport({ ratio: 1 })
    await capturar(page, 'movil-filtro-activo')
    await caja.evaluate((c) => (c.scrollLeft = 300))
    await capturar(page, 'movil-tabla-desplazada')
  })
})
