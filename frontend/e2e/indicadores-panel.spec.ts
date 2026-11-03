import { expect, test, type Page } from '@playwright/test'
import { simularSesionStaff } from './fixtures/sesion'

/**
 * Dashboard y Analitica del panel sobre `indicadores_panel` (0022), con la
 * base servida desde memoria por page.route.
 *
 * El doble de la funcion responde segun el rango que recibe, asi la prueba
 * comprueba que la pagina PIDE las fechas de Chile y no solo que pinta lo que
 * le llega. El reloj se fija a las 22:30 del 31 de octubre de 2026 en Chile
 * con el dispositivo en UTC, donde ya es 1 de noviembre.
 */

const AHORA = new Date('2026-11-01T01:30:00Z')

type Rango = { p_desde: string; p_hasta: string }

/** Meses 'YYYY-MM' que toca el rango, como los devuelve la funcion. */
function mesesDe({ p_desde, p_hasta }: Rango): string[] {
  const meses: string[] = []
  let [anio, mes] = p_desde.split('-').map(Number)
  for (;;) {
    const clave = `${anio}-${String(mes).padStart(2, '0')}`
    meses.push(clave)
    if (clave === p_hasta.slice(0, 7)) return meses
    mes += 1
    if (mes === 13) {
      mes = 1
      anio += 1
    }
  }
}

/** Octubre con 40 reservas (4 canceladas) y el 31 con 5 (1 cancelada, 3 por atender). */
function indicadores(rango: Rango) {
  const unDia = rango.p_desde === rango.p_hasta
  return {
    desde: rango.p_desde,
    hasta: rango.p_hasta,
    reservas: unDia ? 5 : 52,
    por_estado: unDia
      ? { pendiente: 2, confirmada: 1, completada: 1, cancelada: 1 }
      : { pendiente: 10, confirmada: 20, completada: 16, cancelada: 6 },
    ingresos_estimados: 920000,
    clientas_distintas: 31,
    clientas_registradas: 96,
    por_mes: mesesDe(rango).map((mes) =>
      mes === '2026-10' ? { mes, reservas: 40, canceladas: 4 } : { mes, reservas: 2, canceladas: 1 },
    ),
    por_servicio: [{ servicio_id: 6, nombre: 'Manicure rusa', reservas: 30 }],
    por_profesional: [{ profesional_id: 1, nombre: 'Daniela Soto', reservas: 30 }],
  }
}

const RESERVA = {
  id: 101,
  servicio_id: 6,
  profesional_id: 1,
  cliente_id: null,
  fecha: '2026-10-31',
  hora_inicio: '10:00:00',
  hora_fin: '11:00:00',
  cliente_nombre: 'Valentina Rojas',
  cliente_email: 'vale.rojas@correo.cl',
  cliente_telefono: null,
  codigo: 'NV-482913',
  estado: 'pendiente',
  detalles_extra: null,
  abono: 0,
}

async function simularBase(page: Page) {
  const rangos: Rango[] = []
  const listados: URL[] = []
  let fallar = false

  await simularSesionStaff(page)
  // El vencimiento de la sesion se calcula con la hora real de Node; con el
  // reloj del navegador fijado podria verse vencida e intentar refrescarse.
  await page.addInitScript(() => {
    for (const clave of Object.keys(localStorage)) {
      if (!clave.endsWith('-auth-token')) continue
      const sesion = JSON.parse(localStorage.getItem(clave)!)
      sesion.expires_at = 4102444800
      localStorage.setItem(clave, JSON.stringify(sesion))
    }
  })
  await page.clock.setFixedTime(AHORA)

  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/profesionales*', (route) =>
    route.fulfill({ json: [{ id: 1, nombre: 'Daniela Soto', especialidad: 'Manicurista', avatar_url: null, activo: true, experiencia_anios: 4, biografia: null, categoria: 'unas' }] }),
  )
  await page.route('**/rest/v1/servicios*', (route) =>
    route.fulfill({ json: [{ id: 6, nombre: 'Manicure rusa', categoria: 'unas', descripcion: null, imagen_url: null, descripcion_larga: null, incluye: [], variantes: null, duracion_minutos: 60, precio_base: 25000, activo: true, abono: 0 }] }),
  )
  await page.route('**/rest/v1/reservas*', (route) => {
    listados.push(new URL(route.request().url()))
    return route.fulfill({ json: [RESERVA] })
  })
  await page.route('**/rest/v1/rpc/indicadores_panel', (route) => {
    const rango = route.request().postDataJSON() as Rango
    rangos.push(rango)
    if (fallar) {
      return route.fulfill({
        status: 403,
        json: { code: '42501', message: 'Solo el personal del estudio puede ver los indicadores.', details: null, hint: null },
      })
    }
    return route.fulfill({ json: indicadores(rango) })
  })

  return {
    rangos,
    listados,
    fallar: (valor: boolean) => {
      fallar = valor
    },
  }
}

test.describe('indicadores del panel con el día de Chile', () => {
  test.use({ timezoneId: 'UTC', locale: 'es-CL' })

  test('Dashboard: octubre y el 31, cifras de la base y 8 reservas recientes', async ({ page }) => {
    const base = await simularBase(page)

    await page.goto('/admin')

    await expect(page.getByText('Estudio Nura · 31 de octubre, 2026')).toBeVisible()
    await expect(page.getByText('Octubre 2026', { exact: true })).toBeVisible()
    await expect(page.getByText('3 por atender')).toBeVisible()
    await expect(page.getByText('10.0%')).toBeVisible()
    await expect(page.getByText('Abril 2026 – Octubre 2026')).toBeVisible()
    await expect(page.getByText('Valentina Rojas')).toBeVisible()

    expect(base.rangos).toContainEqual({ p_desde: '2026-04-01', p_hasta: '2026-10-31' })
    expect(base.rangos).toContainEqual({ p_desde: '2026-10-31', p_hasta: '2026-10-31' })
    // El listado se limita en la base, no en el navegador.
    expect(base.listados.length).toBeGreaterThan(0)
    for (const url of base.listados) expect(url.searchParams.get('limit')).toBe('8')
  })

  test('Dashboard: sin permiso muestra el motivo, y reintentar recupera las cifras', async ({ page }) => {
    const base = await simularBase(page)
    base.fallar(true)

    await page.goto('/admin')

    await expect(page.getByText(/Solo el personal del estudio puede ver los indicadores/)).toBeVisible()
    await expect(page.getByText('Reservas del mes')).toHaveCount(0)

    base.fallar(false)
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(page.getByText('3 por atender')).toBeVisible()
  })

  test('Analítica: «Este año» pide de enero a hoy y el rango invertido no llama', async ({ page }) => {
    const base = await simularBase(page)

    await page.goto('/admin/analitica')
    await expect(page.getByText('Ingresos estimados', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Este año' }).click()
    await expect(page.getByText('Oct 26')).toBeVisible()
    expect(base.rangos).toContainEqual({ p_desde: '2026-01-01', p_hasta: '2026-10-31' })
    await expect(page.getByTitle(/reservas$/)).toHaveCount(10)

    await page.getByRole('button', { name: 'Personalizado' }).click()
    const antes = base.rangos.length
    await page.getByLabel('Hasta').fill('2026-01-10')
    await page.getByLabel('Desde').fill('2026-01-20')
    await expect(page.getByText('La fecha inicial debe ser anterior a la final.')).toBeVisible()
    expect(base.rangos.slice(antes).filter((r) => r.p_desde > r.p_hasta)).toEqual([])
  })
})
