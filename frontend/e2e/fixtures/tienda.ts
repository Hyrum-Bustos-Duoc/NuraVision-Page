import type { Page, Request } from '@playwright/test'
import productos from './productos.json' with { type: 'json' }

/**
 * Simula la parte de la base que agrega 0013: el catalogo y crear_pedido().
 *
 * Asi los e2e de la tienda no dependen de que la migracion este aplicada en el
 * proyecto contra el que se corren. El resto (servicios, equipo) sigue yendo a
 * Supabase de verdad.
 */
export async function simularTienda(page: Page) {
  const pedidos: Request[] = []

  await page.route('**/rest/v1/productos*', (route) => route.fulfill({ json: productos }))
  await page.route('**/rest/v1/rpc/crear_pedido', (route) => {
    pedidos.push(route.request())
    return route.fulfill({
      json: [{ pedido_id: 1, codigo: 'NV-P-000123', subtotal: 9900, costo_envio: 0, descuento: 0, total: 9900 }],
    })
  })
  await page.route('**/rest/v1/rpc/suscribir_newsletter', (route) => route.fulfill({ status: 204, body: '' }))

  return { pedidos }
}
