import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { simularPanelStaff } from './fixtures/panel'

type Guardado = { carruseles: { estudio: string[]; tienda: string[] } }

const cabecera = (page: Page, n: 1 | 2) => page.getByRole('button', { name: new RegExp(`^Carrusel ${n} ·`) })
const fotosDe = (page: Page, n: 1 | 2) => page.locator(`#carrusel-${n === 1 ? 'estudio' : 'tienda'}-fotos li img`)

test.describe('panel de contenido · indice de secciones', () => {
  for (const { ancho, alto, tope } of [
    { ancho: 1280, alto: 800, tope: 32 },
    { ancho: 1024, alto: 768, tope: 32 },
    { ancho: 768, alto: 1024, tope: 58 },
    { ancho: 375, alto: 740, tope: 58 },
  ]) {
    test(`queda fijo hasta el final y no tapa el titulo a ${ancho}px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto })
      await simularPanelStaff(page)
      await page.goto('/admin/contenido')
      const indice = page.getByRole('navigation', { name: 'Secciones del contenido' })
      await expect(indice).toBeVisible()

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect.poll(async () => Math.round((await indice.boundingBox())!.y)).toBe(tope)

      for (const nombre of ['Carruseles de la portada', 'Fotos', 'Barra de anuncios']) {
        await indice.getByRole('link', { name: nombre, exact: true }).click()
        const titulo = page.getByRole('heading', { level: 2, name: nombre, exact: true })
        await expect.poll(async () => {
          const t = (await titulo.boundingBox())!
          const i = (await indice.boundingBox())!
          // En escritorio el indice es una columna al lado: solo cuenta en movil.
          const solapa = ancho < 1024 ? t.y < i.y + i.height : false
          return !solapa && t.y >= 0 && t.y < alto
        }).toBe(true)
      }
    })
  }
})

test.describe('panel de contenido · ancho en movil', () => {
  for (const ancho of [375, 768, 1023]) {
    test(`las secciones caben en ${ancho}px y el indice llega a la ultima`, async ({ page }) => {
      // Regresion (2026-10-07): sin columnas declaradas bajo `lg`, la columna
      // implicita tomaba el ancho minimo del indice (~1400 px) y recortaba todo.
      await page.setViewportSize({ width: ancho, height: 800 })
      await simularPanelStaff(page)
      await page.goto('/admin/contenido')
      const seccion = (await page.locator('section#fotos').boundingBox())!
      expect(seccion.x + seccion.width).toBeLessThanOrEqual(ancho)

      const ultima = page
        .getByRole('navigation', { name: 'Secciones del contenido' })
        .getByRole('link', { name: 'Consejos del análisis' })
      await ultima.scrollIntoViewIfNeeded()
      const caja = (await ultima.boundingBox())!
      expect(caja.x + caja.width).toBeLessThanOrEqual(ancho)
    })
  }
})

test.describe('panel de contenido · carruseles', () => {
  test('acordeon: abrir el 2 cierra el 1 y repulsar cierra', async ({ page }) => {
    await simularPanelStaff(page)
    await page.goto('/admin/contenido')
    await expect(cabecera(page, 1)).toHaveAttribute('aria-expanded', 'false')
    await cabecera(page, 1).click()
    await expect(fotosDe(page, 1)).toHaveCount(6)
    await cabecera(page, 2).click()
    await expect(cabecera(page, 1)).toHaveAttribute('aria-expanded', 'false')
    await expect(fotosDe(page, 1)).toHaveCount(0)
    await expect(fotosDe(page, 2)).toHaveCount(22)
    await cabecera(page, 2).click()
    await expect(cabecera(page, 2)).toHaveAttribute('aria-expanded', 'false')
    await expect(fotosDe(page, 2)).toHaveCount(0)
  })

  test('reordena, quita, restaura y publica en la portada', async ({ page }) => {
    const { guardados } = await simularPanelStaff(page)
    await page.goto('/admin/contenido')
    await cabecera(page, 1).click()
    const panel = page.locator('#carrusel-estudio-fotos')

    await panel.getByRole('button', { name: 'Mover la foto 1 después' }).click()
    await expect(fotosDe(page, 1).first()).toHaveAttribute('src', '/carrusel/inicio/inicio-02.jpg')
    await expect(panel.getByRole('button', { name: 'Mover la foto 1 antes' })).toBeDisabled()
    await expect(panel.getByRole('button', { name: 'Mover la foto 6 después' })).toBeDisabled()

    await panel.getByRole('button', { name: 'Quitar la foto 6' }).click()
    await expect(fotosDe(page, 1)).toHaveCount(5)
    await expect(cabecera(page, 1)).toContainText('5 fotos')

    await panel.getByRole('button', { name: 'Restaurar originales' }).click()
    await expect(fotosDe(page, 1)).toHaveCount(6)
    await expect(panel.getByRole('button', { name: 'Restaurar originales' })).toHaveCount(0)
    await expect(page.getByText('Tienes cambios sin guardar.')).toHaveCount(0)

    // Cambio real que se publica: la foto 3 pasa a ser la primera y se quita la ultima.
    await panel.getByRole('button', { name: 'Mover la foto 3 antes' }).click()
    await panel.getByRole('button', { name: 'Mover la foto 2 antes' }).click()
    await panel.getByRole('button', { name: 'Quitar la foto 6' }).click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Contenido publicado')).toBeVisible()
    expect((guardados.at(-1) as Guardado).carruseles.estudio).toEqual([
      '/carrusel/inicio/inicio-03.jpg',
      '/carrusel/inicio/inicio-01.jpg',
      '/carrusel/inicio/inicio-02.jpg',
      '/carrusel/inicio/inicio-04.jpg',
      '/carrusel/inicio/inicio-05.jpg',
    ])

    await page.goto('/')
    const estudio = page.getByRole('region', { name: /estudio/i }).first()
    await expect(estudio.locator('span.tabular-nums')).toHaveText('01/05')
    await expect(estudio.locator('img:not([aria-hidden="true"])')).toHaveAttribute('src', '/carrusel/inicio/inicio-03.jpg')
  })

  test('vaciar un carrusel se publica y la portada queda a rayas', async ({ page }) => {
    const { guardados } = await simularPanelStaff(page)
    await page.goto('/admin/contenido')
    await cabecera(page, 1).click()
    const panel = page.locator('#carrusel-estudio-fotos')
    for (let i = 6; i >= 1; i--) await panel.getByRole('button', { name: `Quitar la foto ${i}` }).click()
    await expect(panel.getByText(/Sin fotos/)).toBeVisible()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Contenido publicado')).toBeVisible()
    expect((guardados.at(-1) as Guardado).carruseles.estudio).toEqual([])

    await page.goto('/')
    await expect(page.getByRole('region', { name: /estudio/i }).first().locator('.placeholder-stripes')).toBeVisible()
  })

  test('descartar durante una subida no resucita la lista vieja', async ({ page }) => {
    await simularPanelStaff(page)
    // La subida queda colgada hasta que el test la suelta.
    let soltar = () => {}
    const suelta = new Promise<void>((r) => (soltar = r))
    await page.route('**/storage/v1/object/contenido/**', async (route) => {
      await suelta
      await route.fulfill({ json: { Key: 'contenido/foto.jpg', Id: 'x' } })
    })
    await page.goto('/admin/contenido')
    await cabecera(page, 1).click()
    const panel = page.locator('#carrusel-estudio-fotos')

    await panel.getByRole('button', { name: 'Quitar la foto 6' }).click()
    await expect(fotosDe(page, 1)).toHaveCount(5)
    const jpg = readFileSync('public/carrusel/inicio/inicio-01.jpg')
    await panel.locator('input[type="file"]').setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: jpg })
    await expect(panel.getByRole('status')).toBeVisible()

    await page.getByRole('button', { name: 'Descartar' }).click()
    await expect(fotosDe(page, 1)).toHaveCount(6)
    soltar()
    await expect(panel.getByRole('status')).toHaveCount(0)

    // Las 6 originales (incluida la quitada antes de descartar) + la nueva.
    await expect(fotosDe(page, 1)).toHaveCount(7)
    await expect(fotosDe(page, 1).nth(5)).toHaveAttribute('src', '/carrusel/inicio/inicio-06.jpg')
    await expect(fotosDe(page, 1).nth(6)).toHaveAttribute('src', /\/storage\/v1\/object\/public\/contenido\/carrusel-estudio-/)
  })

  test('no pasa de 30 fotos al subir de mas', async ({ page }) => {
    test.setTimeout(120_000)
    const { guardados } = await simularPanelStaff(page)
    await page.goto('/admin/contenido')
    await cabecera(page, 1).click()
    const panel = page.locator('#carrusel-estudio-fotos')
    const jpg = readFileSync('public/carrusel/inicio/inicio-01.jpg')
    const archivos = Array.from({ length: 26 }, (_, i) => ({ name: `f${i}.jpg`, mimeType: 'image/jpeg', buffer: jpg }))

    await panel.locator('input[type="file"]').setInputFiles(archivos)
    await expect(panel.getByRole('alert')).toContainText('Solo se agregaron 24')
    await expect(panel.getByRole('status')).toHaveCount(0, { timeout: 90_000 })
    await expect(fotosDe(page, 1)).toHaveCount(30)
    await expect(panel.getByText('30 / 30')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Agregar fotos' })).toBeDisabled()

    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Contenido publicado')).toBeVisible()
    const estudio = (guardados.at(-1) as Guardado).carruseles.estudio
    expect(estudio).toHaveLength(30)
    // Cada subida tiene un nombre distinto: si dos coinciden, la segunda pisa a la primera en el bucket.
    expect(new Set(estudio).size).toBe(30)
  })
})
