import { expect, test, type Page } from '@playwright/test'
import datos from '../src/test/fixtures/indicadores-sql.json' with { type: 'json' }
import { simularSesionStaff } from './fixtures/sesion'

/**
 * Regresion de la tabla de reservas extraida a `TablaReservas`, en sus dos
 * usos: el panel de reservas (todas las filas, busqueda en memoria, confirmar)
 * y «Reservas recientes» del Dashboard, que ahora tambien confirma.
 * Filas y catalogo salen del mismo fixture generado sobre SQL.
 */

const e = datos.spec
type Fila = (typeof e.reservas.todos)[number]

async function simular(page: Page, filas: Fila[]) {
  const listados: URL[] = []
  const patches: { url: URL; cuerpo: unknown }[] = []
  const indicadores: string[] = []
  const tabla = filas.map((f) => ({ ...f }))

  await simularSesionStaff(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/profesionales*', (route) => route.fulfill({ json: e.profesionales }))
  await page.route('**/rest/v1/servicios*', (route) => route.fulfill({ json: e.servicios }))
  await page.route('**/rest/v1/rpc/indicadores_panel', (route) => {
    const { p_desde, p_hasta } = route.request().postDataJSON() as { p_desde: string; p_hasta: string }
    indicadores.push(`${p_desde}|${p_hasta}`)
    return route.fulfill({ json: e.rpc['2026-10-31|2026-10-31'] })
  })
  await page.route('**/rest/v1/reservas*', (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'PATCH') {
      const id = Number(url.searchParams.get('id')!.replace('eq.', ''))
      patches.push({ url, cuerpo: req.postDataJSON() })
      const fila = tabla.find((f) => f.id === id)!
      fila.estado = 'confirmada'
      return route.fulfill({ json: [fila] })
    }
    listados.push(url)
    return route.fulfill({ json: tabla })
  })
  return { listados, patches, indicadores }
}

test.use({ timezoneId: 'America/Santiago', locale: 'es-CL' })

test('panel de reservas: sin límite, busca en memoria y avisa si no hay coincidencias', async ({ page }) => {
  // 20 filas: si alguien le pasara el límite del Dashboard al panel, se notaría.
  const veinte = Array.from({ length: 20 }, (_, i) => ({
    ...e.reservas.todos[i % 8],
    id: 9000 + i,
    codigo: `NV-9${String(i).padStart(5, '0')}`,
    cliente_nombre: i === 13 ? 'Florencia Ñúñez' : `Clienta ${i}`,
  }))
  const base = await simular(page, veinte)
  await page.goto('/admin/reservas')

  await expect(page.locator('tbody tr')).toHaveCount(20)
  for (const url of base.listados) expect(url.searchParams.get('limit')).toBeNull()
  const pedidosAntes = base.listados.length

  await page.getByLabel('Buscar reservas').fill('  florencia ')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr')).toContainText('NV-900013')

  await page.getByLabel('Buscar reservas').fill('nv-90001')
  await expect(page.locator('tbody tr')).toHaveCount(10)

  await page.getByLabel('Buscar reservas').fill('nadie así')
  await expect(page.locator('tbody tr')).toHaveCount(0)
  await expect(page.getByText('Ninguna reserva coincide con «nadie así».')).toBeVisible()

  // La búsqueda no vuelve a pedir a la base.
  expect(base.listados.length).toBe(pedidosAntes)
})

test('Dashboard: «Confirmar» en reservas recientes cambia solo esa fila y no rompe las cifras', async ({ page }) => {
  const pendiente = e.reservas.todos.find((f) => f.estado === 'pendiente')!
  const base = await simular(page, e.reservas.todos)
  await page.goto('/admin')

  const fila = page.getByRole('row', { name: new RegExp(pendiente.codigo) })
  await expect(fila).toContainText('Por confirmar')
  const porAtender = await page.getByText(/por atender$/).textContent()

  await fila.getByRole('button', { name: 'Confirmar' }).click()
  await expect(fila).toContainText('Confirmada')
  await expect(fila.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)

  expect(base.patches).toHaveLength(1)
  expect(base.patches[0].url.searchParams.get('id')).toBe(`eq.${pendiente.id}`)
  expect(base.patches[0].cuerpo).toEqual({ estado: 'confirmada' })
  // Pendiente -> confirmada sigue siendo «por atender»: la tarjeta no queda desfasada.
  await expect(page.getByText(/por atender$/)).toHaveText(porAtender!)
  // Las filas que no se tocaron siguen como estaban.
  const otras = e.reservas.todos.filter((f) => f.estado === 'pendiente' && f.id !== pendiente.id)
  for (const o of otras) {
    await expect(page.getByRole('row', { name: new RegExp(o.codigo) })).toContainText('Por confirmar')
  }
})
