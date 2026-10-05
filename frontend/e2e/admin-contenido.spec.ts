import { expect, test } from '@playwright/test'
import { simularPanelStaff } from './fixtures/panel'

test.describe('panel de contenido', () => {
  test('edita un anuncio, lo publica y se ve en la portada', async ({ page }) => {
    const { guardados } = await simularPanelStaff(page)
    await page.goto('/admin/contenido')

    await page.getByRole('textbox', { name: 'Anuncios (máximo 10) 1' }).fill('Nuevo anuncio de prueba')
    await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByText('Contenido publicado')).toBeVisible()
    expect((guardados[0] as { anuncios: string[] }).anuncios[0]).toBe('Nuevo anuncio de prueba')

    await page.goto('/')
    await expect(page.getByText('Nuevo anuncio de prueba').first()).toBeVisible()
  })

  test('descartar vuelve al contenido publicado sin guardar nada', async ({ page }) => {
    const { guardados } = await simularPanelStaff(page)
    await page.goto('/admin/contenido')

    const titulo = page.getByRole('textbox', { name: 'Título', exact: true }).first()
    await titulo.fill('Otro título')
    await page.getByRole('button', { name: 'Descartar' }).click()

    await expect(titulo).toHaveValue('Belleza en el estudio, *cuidado* en casa')
    await expect(page.getByText('Tienes cambios sin guardar.')).toHaveCount(0)
    expect(guardados).toHaveLength(0)
  })
})

test.describe('cerrar sesión', () => {
  test('pide confirmación antes de salir del panel', async ({ page }) => {
    await simularPanelStaff(page)
    await page.goto('/admin/reservas')

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    const dialogo = page.getByRole('dialog', { name: '¿Cerrar sesión?' })
    await expect(dialogo).toBeVisible()
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()

    await expect(dialogo).toHaveCount(0)
    await expect(page).toHaveURL(/\/admin\/reservas/)
  })
})
