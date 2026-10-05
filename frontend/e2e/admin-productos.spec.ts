import { expect, test, type Page, type Request } from '@playwright/test'
import productos from './fixtures/productos.json' with { type: 'json' }
import { simularSesionStaff } from './fixtures/sesion'

type Fila = (typeof productos)[number]

/** PostgREST de `productos` en memoria: lee, crea y actualiza por `id=eq.N`. */
async function simularProductos(page: Page) {
  const filas: Fila[] = structuredClone(productos)
  const escrituras: Request[] = []

  await page.route('**/rest/v1/productos*', (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: filas })

    escrituras.push(req)
    if (req.method() === 'POST') {
      const nueva = { ...filas[0], ...req.postDataJSON(), id: 99 } as Fila
      filas.push(nueva)
      return route.fulfill({ status: 201, json: [nueva] })
    }
    if (req.method() === 'PATCH') {
      const id = Number(new URL(req.url()).searchParams.get('id')?.replace('eq.', ''))
      const i = filas.findIndex((f) => f.id === id)
      filas[i] = { ...filas[i], ...req.postDataJSON() }
      return route.fulfill({ json: [filas[i]] })
    }
    return route.fulfill({ status: 405 })
  })

  return { escrituras }
}

test.describe('panel de productos', () => {
  test.beforeEach(async ({ page }) => {
    await simularSesionStaff(page)
  })

  test('cambia el precio de un producto', async ({ page }) => {
    const { escrituras } = await simularProductos(page)
    await page.goto('/admin/productos')

    await page.getByRole('button', { name: 'Editar Aceite de cutícula Nura' }).click()
    const modal = page.getByRole('dialog', { name: 'Editar producto' })
    await modal.getByLabel('Precio', { exact: true }).fill('11900')
    await modal.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('row', { name: /Aceite de cutícula Nura/ })).toContainText('$11.900')
    expect(escrituras[0].method()).toBe('PATCH')
    expect(escrituras[0].postDataJSON()).toMatchObject({ precio: 11900, slug: 'aceite-de-cuticula-nura' })
    // Nunca se reescribe el id: va solo en el filtro.
    expect(escrituras[0].postDataJSON()).not.toHaveProperty('id')
  })

  test('crea un producto con la URL derivada del nombre', async ({ page }) => {
    const { escrituras } = await simularProductos(page)
    await page.goto('/admin/productos')

    await page.getByRole('button', { name: 'Nuevo producto' }).click()
    const modal = page.getByRole('dialog', { name: 'Nuevo producto' })
    await modal.getByLabel('Nombre', { exact: true }).fill('Bálsamo de Labios Nº 1')
    await expect(modal.getByLabel('URL')).toHaveValue('balsamo-de-labios-n-1')
    await modal.getByLabel('Precio', { exact: true }).fill('7900')
    await modal.getByRole('button', { name: 'Crear producto' }).click()

    await expect(page.getByRole('row', { name: /Bálsamo de Labios/ })).toBeVisible()
    expect(escrituras[0].postDataJSON()).toMatchObject({
      nombre: 'Bálsamo de Labios Nº 1',
      slug: 'balsamo-de-labios-n-1',
      precio: 7900,
      activo: true,
    })
  })

  test('no envía un precio anterior menor que el precio', async ({ page }) => {
    const { escrituras } = await simularProductos(page)
    await page.goto('/admin/productos')

    await page.getByRole('button', { name: 'Editar Aceite de cutícula Nura' }).click()
    const modal = page.getByRole('dialog', { name: 'Editar producto' })
    await modal.getByLabel('Precio anterior').fill('5000')
    await modal.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(modal.getByRole('alert')).toContainText('mayor que el precio actual')
    expect(escrituras).toHaveLength(0)
  })
})
