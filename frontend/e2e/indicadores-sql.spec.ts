import { expect, test, type Page } from '@playwright/test'
import datos from '../src/test/fixtures/indicadores-sql.json' with { type: 'json' }
import { simularSesionStaff } from './fixtures/sesion'

/**
 * Dashboard y Analitica de punta a punta con cifras salidas del SQL de 0022.
 *
 * `src/test/fixtures/indicadores-sql.json` se genera ejecutando la migracion
 * real 0022 en Postgres (PGlite) sobre un conjunto sembrado, con sesion de
 * staff y la RLS activa:
 *   · `rpc[rango]` es la respuesta literal de `indicadores_panel`, y es lo que
 *     recibe el navegador por page.route.
 *   · `sql[rango]` son las mismas cifras sacadas con consultas directas sobre
 *     `reservas`, `servicios`, `profesionales` y `perfiles`, sin pasar por la
 *     funcion. La pantalla se compara contra ESTO.
 * Asi la cadena SQL -> mapper -> pantalla queda probada con datos que nadie
 * escribio a mano. Un rango que la pagina pida y no este en el fixture se
 * responde 500 y queda anotado: la pagina pidio fechas que no debia.
 */

type Cifras = (typeof datos.spec.sql)['2026-04-01|2026-10-31']
/** Los dos escenarios del fixture piden rangos distintos: se indexan por texto. */
type Escenario = {
  rpc: Record<string, unknown>
  sql: Record<string, Cifras>
  reservas: Record<string, unknown[]>
  servicios: unknown[]
  profesionales: unknown[]
}
type Fallo = 'red' | '42501' | 'PGRST202' | null

/** 22:30 del 31-10-2026 en Chile (UTC-3): en UTC ya es 1 de noviembre. */
const NOCHE_31_OCT = new Date('2026-11-01T01:30:00Z')
/** 20:00 del 29-10-2026 en Chile: en Madrid ya es 30 de octubre. */
const NOCHE_29_OCT = new Date('2026-10-29T23:00:00Z')
/** 15-01-2027 a las 12:00 en Chile. */
const ENERO_2027 = new Date('2027-01-15T15:00:00Z')

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const tasa = (canceladas: number, total: number) => `${(total ? (canceladas / total) * 100 : 0).toFixed(1)}%`

async function simular(page: Page, escenario: Escenario, ahora: Date) {
  const pedidos: string[] = []
  const inesperados: string[] = []
  const listados: URL[] = []
  const demoras = new Map<string, number>()
  let fallo: Fallo = null

  await simularSesionStaff(page)
  await page.addInitScript(() => {
    for (const clave of Object.keys(localStorage)) {
      if (!clave.endsWith('-auth-token')) continue
      const sesion = JSON.parse(localStorage.getItem(clave)!)
      sesion.expires_at = 4102444800
      localStorage.setItem(clave, JSON.stringify(sesion))
    }
  })
  await page.clock.setFixedTime(ahora)

  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/profesionales*', (route) => route.fulfill({ json: escenario.profesionales }))
  await page.route('**/rest/v1/servicios*', (route) => route.fulfill({ json: escenario.servicios }))
  await page.route('**/rest/v1/reservas*', (route) => {
    const url = new URL(route.request().url())
    listados.push(url)
    const estado = url.searchParams.get('estado')?.replace('eq.', '') ?? 'todos'
    return route.fulfill({ json: escenario.reservas[estado] })
  })
  await page.route('**/rest/v1/rpc/indicadores_panel', async (route) => {
    const { p_desde, p_hasta } = route.request().postDataJSON() as { p_desde: string; p_hasta: string }
    const clave = `${p_desde}|${p_hasta}`
    pedidos.push(clave)
    const demora = demoras.get(clave)
    if (demora) await new Promise((r) => setTimeout(r, demora))
    if (fallo === 'red') return route.abort('internetdisconnected')
    if (fallo === '42501') {
      return route.fulfill({ status: 403, json: { code: '42501', message: 'Solo el personal del estudio puede ver los indicadores.', details: null, hint: null } })
    }
    if (fallo === 'PGRST202') {
      return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.indicadores_panel(p_desde, p_hasta) in the schema cache', details: null, hint: null } })
    }
    const respuesta = escenario.rpc[clave]
    if (!respuesta) {
      inesperados.push(clave)
      return route.fulfill({ status: 500, json: { code: 'XX000', message: `rango no sembrado ${clave}`, details: null, hint: null } })
    }
    return route.fulfill({ json: respuesta })
  })

  return {
    pedidos,
    inesperados,
    listados,
    demorar: (clave: string, ms: number) => demoras.set(clave, ms),
    fallar: (f: Fallo) => {
      fallo = f
    },
  }
}

/** Esperado de un rango, sacado de las consultas directas. */
function sql(escenario: Escenario, clave: string) {
  const s = escenario.sql[clave]
  if (!s) throw new Error(`El fixture no tiene ${clave}`)
  return s
}

/** Cifra grande de la tarjeta o metrica cuyo rotulo es `rotulo`. */
function valor(page: Page, rotulo: string) {
  // Solo rotulos en <p>: el enlace «Reservas» del menu lateral tambien coincide.
  return page
    .locator('p')
    .getByText(rotulo, { exact: true })
    .locator('xpath=ancestor::div[.//p[contains(@class,"font-serif-display")]][1]//p[contains(@class,"font-serif-display")]')
}

/** Filas [nombre, cifra] de la tarjeta con ese titulo. */
async function filas(page: Page, titulo: string): Promise<[string, number][]> {
  const tarjeta = page.getByRole('heading', { name: titulo }).locator('xpath=..')
  const pares = await tarjeta.locator('div.flex.items-center.justify-between').evaluateAll((divs) =>
    divs.map((d) => Array.from(d.querySelectorAll('span')).map((s) => s.textContent ?? '')),
  )
  return pares.map(([nombre, n]) => [nombre, Number(n)])
}

const comoFilas = (xs: { nombre: string; reservas: number }[]) => xs.map((x) => [x.nombre, x.reservas])

test.describe('Dashboard: cada cifra contra el SQL directo', () => {
  test.use({ timezoneId: 'UTC', locale: 'es-CL' })

  test('31-10-2026 22:30 en Chile con el dispositivo en UTC', async ({ page }) => {
    const e = datos.spec
    const base = await simular(page, e, NOCHE_31_OCT)
    const siete = sql(e, '2026-04-01|2026-10-31')
    const hoy = sql(e, '2026-10-31|2026-10-31')
    const octubre = siete.por_mes.at(-1)!

    await page.goto('/admin')

    await expect(page.getByText('Estudio Nura · 31 de octubre, 2026')).toBeVisible()
    await expect(valor(page, 'Reservas del mes')).toHaveText(String(octubre.reservas))
    expect(octubre).toEqual({ mes: '2026-10', reservas: 40, canceladas: 4 }) // escenario de la spec
    await expect(valor(page, 'Reservas hoy')).toHaveText(String(hoy.reservas - hoy.por_estado.cancelada))
    await expect(page.getByText(`${hoy.por_estado.pendiente + hoy.por_estado.confirmada} por atender`)).toBeVisible()
    await expect(page.getByText('3 por atender')).toBeVisible()
    await expect(valor(page, 'Clientas registradas')).toHaveText(String(siete.clientas_registradas))
    await expect(valor(page, 'Tasa de cancelación')).toHaveText(tasa(octubre.canceladas, octubre.reservas))
    // 10.0% exacto no supera 10: sin resaltar.
    await expect(page.getByText('Sobre las reservas del mes')).not.toHaveClass(/text-danger/)

    for (const m of siete.por_mes) {
      await expect(page.getByTitle(`${MESES[Number(m.mes.slice(5)) - 1]}: ${m.reservas} reservas`, { exact: true })).toHaveCount(1)
    }
    await expect(page.getByText('Abril 2026 – Octubre 2026')).toBeVisible()
    expect(await filas(page, 'Servicios más solicitados')).toEqual(comoFilas(siete.por_servicio.slice(0, 5)))

    // Reservas recientes: las 8 que entrega la base, en su orden (incluye las
    // del 1 de noviembre, que son futuras en Chile).
    const codigos = e.reservas.todos.map((r) => r.codigo)
    await expect(page.locator('tbody tr td:first-child')).toHaveText(codigos)
    for (const url of base.listados) expect(url.searchParams.get('limit')).toBe('8')

    expect(base.inesperados).toEqual([])
    expect(new Set(base.pedidos)).toEqual(new Set(['2026-04-01|2026-10-31', '2026-10-31|2026-10-31']))
  })

  test('15-01-2027 en Chile con el dispositivo en Madrid: cambio de año', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'Europe/Madrid', locale: 'es-CL' })
    const page = await ctx.newPage()
    const e = datos.spec
    const base = await simular(page, e, ENERO_2027)
    const siete = sql(e, '2026-07-01|2027-01-31')
    const hoy = sql(e, '2027-01-15|2027-01-15')

    await page.goto('/admin')

    await expect(page.getByText('Estudio Nura · 15 de enero, 2027')).toBeVisible()
    await expect(page.getByText('Enero 2027', { exact: true })).toBeVisible()
    await expect(page.getByText('Julio 2026 – Enero 2027')).toBeVisible()
    await expect(valor(page, 'Reservas del mes')).toHaveText(String(siete.por_mes.at(-1)!.reservas))
    await expect(valor(page, 'Reservas hoy')).toHaveText(String(hoy.reservas - hoy.por_estado.cancelada))
    await expect(page.getByTitle(/reservas$/)).toHaveCount(7)
    expect(base.inesperados).toEqual([])
    await ctx.close()
  })

  test('filtro «Por confirmar» muestra solo pendientes y a lo más 8', async ({ page }) => {
    const e = datos.spec
    const base = await simular(page, e, NOCHE_31_OCT)
    await page.goto('/admin')
    await expect(page.locator('tbody tr')).toHaveCount(8)

    await page.getByLabel('Filtrar por estado').selectOption('pendiente')
    await expect(page.locator('tbody tr td:first-child')).toHaveText(e.reservas.pendiente.map((r) => r.codigo))
    await expect(page.locator('tbody tr').filter({ hasNotText: 'Por confirmar' })).toHaveCount(0)
    expect(base.listados.at(-1)!.searchParams.get('estado')).toBe('eq.pendiente')
    expect(base.listados.at(-1)!.searchParams.get('limit')).toBe('8')
  })

  test('volumen grande: miles de reservas e ingresos de cientos de millones', async ({ page }) => {
    const e = datos.grande
    await simular(page, e, NOCHE_31_OCT)
    const siete = sql(e, '2026-04-01|2026-10-31')
    const octubre = siete.por_mes.at(-1)!
    await page.goto('/admin')

    // Sin separador de miles en el valor: se compara la cifra, el formato se reporta aparte.
    await expect(valor(page, 'Reservas del mes')).toHaveText(new RegExp(`^${octubre.reservas.toLocaleString('es-CL').replace('.', '\\.?')}$`))
    await expect(valor(page, 'Clientas registradas')).toHaveText(siete.clientas_registradas.toLocaleString('es-CL'))
    await expect(valor(page, 'Tasa de cancelación')).toHaveText(tasa(octubre.canceladas, octubre.reservas))
  })
})

test.describe('Analítica: cada preset contra el SQL directo', () => {
  test.use({ timezoneId: 'UTC', locale: 'es-CL' })

  const PRESETS: [string, string][] = [
    ['Últimos 6 meses', '2026-04-30|2026-10-31'],
    ['Últimos 30 días', '2026-10-01|2026-10-31'],
    ['Últimos 3 meses', '2026-07-31|2026-10-31'],
    ['Este año', '2026-01-01|2026-10-31'],
  ]

  test('31-10-2026 22:30 en Chile: los cuatro presets', async ({ page }) => {
    const e = datos.spec
    const base = await simular(page, e, NOCHE_31_OCT)
    await page.goto('/admin/analitica')

    for (const [boton, clave] of PRESETS) {
      await page.getByRole('button', { name: boton }).click()
      const s = sql(e, clave)
      await expect(valor(page, 'Reservas')).toHaveText(String(s.reservas))
      await expect(valor(page, 'Ingresos estimados')).toHaveText(CLP.format(s.ingresos_estimados))
      await expect(valor(page, 'Clientas distintas')).toHaveText(String(s.clientas_distintas))
      await expect(valor(page, 'Tasa de cancelación')).toHaveText(tasa(s.por_estado.cancelada, s.reservas))
      await expect(page.getByTitle(/reservas$/)).toHaveCount(s.por_mes.length)
      for (const m of s.por_mes) {
        const etiqueta = `${MESES[Number(m.mes.slice(5)) - 1]} ${m.mes.slice(2, 4)}`
        await expect(page.getByTitle(`${etiqueta}: ${m.reservas} reservas`, { exact: true })).toHaveCount(1)
      }
      expect(await filas(page, 'Servicios más solicitados')).toEqual(comoFilas(s.por_servicio.slice(0, 6)))
      expect(await filas(page, 'Atenciones por profesional')).toEqual(comoFilas(s.por_profesional))
    }
    // «Este año» = 10 meses, de enero a octubre (spec).
    expect(sql(e, '2026-01-01|2026-10-31').por_mes).toHaveLength(10)
    expect(base.inesperados).toEqual([])
  })

  test('catálogo por categoría: activos e inactivos, categoría nula a «Uñas»', async ({ page }) => {
    const e = datos.spec
    await simular(page, e, NOCHE_31_OCT)
    await page.goto('/admin/analitica')
    const cuenta = (cat: string) => e.servicios.filter((s) => (s.categoria ?? 'unas') === cat).length
    const tarjeta = page.getByRole('heading', { name: 'Catálogo por categoría' }).locator('xpath=..')
    for (const [cat, rotulo] of [['unas', 'Uñas'], ['cabello', 'Cabello'], ['piel', 'Piel'], ['diagnostico', 'Diagnóstico']]) {
      await expect(tarjeta.locator('div', { hasText: rotulo }).last()).toContainText(`${cuenta(cat)} servicios`)
    }
  })

  test('dispositivo en Madrid a las 20:00 del 29-10 en Chile: 30 días va del 29-09 al 29-10', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'Europe/Madrid', locale: 'es-CL' })
    const page = await ctx.newPage()
    const e = datos.spec
    const base = await simular(page, e, NOCHE_29_OCT)
    await page.goto('/admin/analitica')
    await expect(valor(page, 'Reservas')).toHaveText(String(sql(e, '2026-04-29|2026-10-29').reservas))

    await page.getByRole('button', { name: 'Últimos 30 días' }).click()
    const s = sql(e, '2026-09-29|2026-10-29')
    await expect(valor(page, 'Reservas')).toHaveText(String(s.reservas))
    await expect(valor(page, 'Ingresos estimados')).toHaveText(CLP.format(s.ingresos_estimados))
    expect(base.pedidos).toContain('2026-09-29|2026-10-29')
    expect(base.inesperados).toEqual([])
    await ctx.close()
  })

  test('personalizado: un día sin reservas y un rango que cruza dos cambios de año', async ({ page }) => {
    const e = datos.spec
    await simular(page, e, NOCHE_31_OCT)
    await page.goto('/admin/analitica')
    await page.getByRole('button', { name: 'Personalizado' }).click()

    await page.getByLabel('Hasta').fill('2026-05-10')
    await page.getByLabel('Desde').fill('2026-05-10')
    expect(sql(e, '2026-05-10|2026-05-10').reservas).toBe(0)
    await expect(page.getByText('Sin datos en este período')).toBeVisible()
    await expect(valor(page, 'Reservas')).toHaveCount(0)

    await page.getByLabel('Desde').fill('2025-12-15')
    await page.getByLabel('Hasta').fill('2027-01-20')
    const s = sql(e, '2025-12-15|2027-01-20')
    await expect(valor(page, 'Reservas')).toHaveText(String(s.reservas))
    await expect(page.getByTitle(/reservas$/)).toHaveCount(14)
    await expect(page.getByTitle(`Dic 25: ${s.por_mes[0].reservas} reservas`, { exact: true })).toHaveCount(1)
    await expect(page.getByTitle(`Ene 27: ${s.por_mes[13].reservas} reservas`, { exact: true })).toHaveCount(1)
  })

  test('volumen grande: ingresos con separador de miles CLP', async ({ page }) => {
    const e = datos.grande
    await simular(page, e, NOCHE_31_OCT)
    await page.goto('/admin/analitica')
    const s = sql(e, '2026-04-30|2026-10-31')
    expect(s.ingresos_estimados).toBeGreaterThan(100_000_000)
    await expect(valor(page, 'Ingresos estimados')).toHaveText(CLP.format(s.ingresos_estimados))
    await expect(valor(page, 'Ingresos estimados')).toHaveText(/^\$\d{1,3}(\.\d{3})+$/)
  })
})

test.describe('carreras, red y permisos', () => {
  test.use({ timezoneId: 'UTC', locale: 'es-CL' })

  test('una respuesta vieja y lenta no pisa a la del preset elegido después', async ({ page }) => {
    const e = datos.spec
    const base = await simular(page, e, NOCHE_31_OCT)
    // 6 meses (el inicial) y «Este año» tardan; 30 días responde al tiro.
    base.demorar('2026-04-30|2026-10-31', 2500)
    base.demorar('2026-01-01|2026-10-31', 2500)
    await page.goto('/admin/analitica')

    await page.getByRole('button', { name: 'Este año' }).click()
    await page.getByRole('button', { name: 'Últimos 30 días' }).click()
    const s = sql(e, '2026-10-01|2026-10-31')
    await expect(valor(page, 'Reservas')).toHaveText(String(s.reservas))

    // Que lleguen las lentas, y que no cambien nada.
    await page.waitForTimeout(3000)
    await expect(valor(page, 'Reservas')).toHaveText(String(s.reservas))
    await expect(page.getByTitle(/reservas$/)).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Últimos 30 días' })).toHaveClass(/bg-ink/)
  })

  test('doble clic en un preset no repite la consulta', async ({ page }) => {
    const base = await simular(page, datos.spec, NOCHE_31_OCT)
    await page.goto('/admin/analitica')
    await expect(valor(page, 'Reservas')).toBeVisible()

    await page.getByRole('button', { name: 'Últimos 3 meses' }).dblclick()
    await expect(valor(page, 'Reservas')).toHaveText(String(sql(datos.spec, '2026-07-31|2026-10-31').reservas))
    expect(base.pedidos.filter((p) => p === '2026-07-31|2026-10-31')).toHaveLength(1)
  })

  test('red caída: error sin cifras, y «Reintentar» repite el mismo rango y recupera', async ({ page }) => {
    const base = await simular(page, datos.spec, NOCHE_31_OCT)
    base.fallar('red')
    await page.goto('/admin/analitica')

    await expect(page.getByText('No se pudieron cargar los indicadores', { exact: true })).toBeVisible()
    await expect(valor(page, 'Reservas')).toHaveCount(0)
    const antes = base.pedidos.length

    base.fallar(null)
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(valor(page, 'Reservas')).toHaveText(String(sql(datos.spec, '2026-04-30|2026-10-31').reservas))
    expect(base.pedidos.slice(antes)).toEqual(['2026-04-30|2026-10-31'])
  })

  test('Dashboard con red caída no pinta ceros y recupera al reintentar', async ({ page }) => {
    const base = await simular(page, datos.spec, NOCHE_31_OCT)
    base.fallar('red')
    await page.goto('/admin')

    await expect(page.getByText('No se pudieron cargar los indicadores', { exact: true })).toBeVisible()
    await expect(page.getByText('Reservas del mes')).toHaveCount(0)
    base.fallar(null)
    await page.getByRole('button', { name: 'Reintentar' }).first().click()
    await expect(valor(page, 'Reservas del mes')).toHaveText('40')
  })

  test('función no aplicada (PGRST202): lo dice en vez de mostrar ceros', async ({ page }) => {
    const base = await simular(page, datos.spec, NOCHE_31_OCT)
    base.fallar('PGRST202')
    await page.goto('/admin/analitica')
    await expect(page.getByText(/falta aplicar 0022_indicadores_panel\.sql/)).toBeVisible()
    await expect(valor(page, 'Reservas')).toHaveCount(0)
  })

  test('42501 en la Analítica: motivo de permisos, sin cifras', async ({ page }) => {
    const base = await simular(page, datos.spec, NOCHE_31_OCT)
    base.fallar('42501')
    await page.goto('/admin/analitica')
    await expect(page.getByText(/Solo el personal del estudio puede ver los indicadores/)).toBeVisible()
    await expect(page.getByText(/cierra sesión y vuelve a entrar/)).toBeVisible()
    await expect(valor(page, 'Reservas')).toHaveCount(0)
  })
})
