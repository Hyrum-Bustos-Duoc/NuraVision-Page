import { expect, test } from '@playwright/test'
import { simularTienda } from './fixtures/tienda'

test.describe('tienda', () => {
  test('compra con retiro en el estudio', async ({ page }) => {
    const { pedidos } = await simularTienda(page)
    await page.goto('/tienda')

    await page.getByRole('button', { name: 'Agregar Aceite de cutícula Nura al carrito' }).click()
    const carrito = page.getByRole('dialog', { name: 'Tu carrito' })
    await expect(carrito).toContainText('Te faltan $30.100 para despacho gratis.')
    await carrito.getByRole('button', { name: 'Ir a pagar' }).click()

    await expect(page.getByRole('heading', { name: '¿Cómo quieres recibirlo?' })).toBeVisible()
    await page.getByText('Retiro en Estudio Nura').click()
    await page.getByLabel('Nombre', { exact: true }).fill('Ana Pérez')
    await page.getByLabel('Correo', { exact: true }).fill('ana@correo.cl')
    await page.getByRole('button', { name: 'Continuar al pago' }).click()

    await page.getByRole('button', { name: /^Pagar \$9\.900$/ }).click()
    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible()
    await expect(page.getByText('Pedido NV-P-000123 · $9.900')).toBeVisible()
    await expect(page.getByRole('button', { name: /Abrir carrito, 0 productos/ })).toBeVisible()

    // El navegador manda productos y cantidades, nunca precios: los fija la base.
    const cuerpo = pedidos[0].postDataJSON()
    expect(cuerpo.p_items).toEqual([{ slug: 'aceite-de-cuticula-nura', cantidad: 1 }])
    expect(JSON.stringify(cuerpo)).not.toContain('9900')
    expect(cuerpo).toMatchObject({ p_entrega: 'retiro', p_metodo_pago: 'webpay', p_direccion: null })
  })

  test('el despacho exige una comuna con cobertura', async ({ page }) => {
    await simularTienda(page)
    await page.goto('/tienda/kit-ritual-manos')
    await page.getByRole('button', { name: 'Comprar ahora' }).click()

    await page.getByLabel('Nombre', { exact: true }).fill('Ana')
    await page.getByLabel('Correo', { exact: true }).fill('ana@correo.cl')
    await page.getByLabel('Calle y número').fill('Av. Uno 123')
    await page.getByLabel('Comuna').fill('Santiago')
    await page.getByRole('button', { name: 'Continuar al pago' }).click()

    await expect(page.getByText('Por ahora despachamos solo en Viña del Mar y Valparaíso.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pago' })).toHaveCount(0)
  })

  test('el filtro viaja en la URL', async ({ page }) => {
    await simularTienda(page)
    await page.goto('/tienda?categoria=cabello')
    await expect(page.getByText('3 productos')).toBeVisible()
    await page.getByRole('button', { name: 'Piel' }).click()
    await expect(page).toHaveURL(/categoria=piel/)
    await expect(page.getByText('2 productos')).toBeVisible()
  })

  test('el carrito sobrevive a una recarga', async ({ page }) => {
    await simularTienda(page)
    await page.goto('/tienda')
    await page.getByRole('button', { name: 'Agregar Kit Ritual Manos en casa al carrito' }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: /Abrir carrito, 1 producto/ })).toBeVisible()
  })
})

test.describe('nuria', () => {
  test('recomienda y agrega todo al carrito', async ({ page }) => {
    await simularTienda(page)
    await page.goto('/')
    await page.getByRole('button', { name: '“Mis uñas se quiebran, ¿qué uso?”' }).first().click()

    const panel = page.getByRole('dialog', { name: /Nuria/ })
    await expect(panel.getByText('Aceite de cutícula Nura')).toBeVisible()
    await panel.getByRole('button', { name: 'Agregar todo al carrito' }).click()
    await expect(panel.getByText(/Listo, agregué 3 productos/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Abrir carrito, 3 productos/ })).toBeVisible()
  })
})
