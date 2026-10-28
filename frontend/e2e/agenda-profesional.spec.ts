import { expect, test, type Page } from '@playwright/test'
import { simularSesionProfesional } from './fixtures/sesion'

/**
 * Agenda del panel profesional (NURA-18) leida de la base, no de los datos de
 * ejemplo.
 *
 * La base se sirve desde memoria con page.route, imitando lo que haria
 * PostgREST con los filtros `eq` e `in` que manda la app: asi la prueba
 * comprueba que la pagina PIDE las reservas de su ficha, y no solo que pinta lo
 * que le llega.
 */

const MIA = 1
const OTRA = 2

const PROFESIONALES = [
  { id: MIA, nombre: 'Daniela Soto', especialidad: 'Manicurista', avatar_url: null, activo: true, experiencia_anios: 4, biografia: null, categoria: 'unas' },
  { id: OTRA, nombre: 'Berenice', especialidad: 'Estilista', avatar_url: null, activo: true, experiencia_anios: 2, biografia: null, categoria: 'cabello' },
]

const SERVICIOS = [
  { id: 6, nombre: 'Manicure rusa', categoria: 'unas', descripcion: null, imagen_url: null, descripcion_larga: null, incluye: [], variantes: null, duracion_minutos: 60, precio_base: 25000, activo: true, abono: 0 },
  { id: 9, nombre: 'Esmaltado permanente', categoria: 'unas', descripcion: null, imagen_url: null, descripcion_larga: null, incluye: [], variantes: null, duracion_minutos: 90, precio_base: 18000, activo: true, abono: 0 },
]

/** Lunes a sabado de 10:00 a 19:00, como el estudio. */
const disponibilidad = (profesionalId: number) =>
  [1, 2, 3, 4, 5, 6].map((dia) => ({
    id: profesionalId * 10 + dia,
    profesional_id: profesionalId,
    dia_semana: dia,
    hora_inicio: '10:00:00',
    hora_fin: '19:00:00',
    activo: true,
    bloques_bloqueados: [],
  }))

let id = 100
function reserva(profesionalId: number, fecha: string, hora: [string, string], cliente: string, servicioId: number, estado: string) {
  id += 1
  return {
    id,
    servicio_id: servicioId,
    profesional_id: profesionalId,
    cliente_id: null,
    fecha,
    hora_inicio: `${hora[0]}:00`,
    hora_fin: `${hora[1]}:00`,
    cliente_nombre: cliente,
    cliente_email: 'clienta@correo.cl',
    cliente_telefono: null,
    codigo: `NV-${id}`,
    estado,
    detalles_extra: null,
    abono: 0,
  }
}

/** Las de hoy de esta ficha, una de otra profesional, una cancelada y una de mañana. */
function reservasDePrueba(hoy: string, manana: string) {
  return [
    // Desordenadas a proposito: la base las entrega de la mas reciente a la mas antigua.
    reserva(MIA, hoy, ['15:30', '17:00'], 'Josefa Muñoz', 9, 'pendiente'),
    reserva(MIA, hoy, ['10:00', '11:00'], 'Valentina Rojas', 6, 'confirmada'),
    reserva(OTRA, hoy, ['12:00', '13:00'], 'Camila Fuentes', 6, 'confirmada'),
    reserva(MIA, hoy, ['13:00', '14:00'], 'Antonia Pérez', 6, 'cancelada'),
    reserva(MIA, manana, ['10:00', '11:00'], 'Martina Lagos', 6, 'confirmada'),
  ]
}

/** Valor de un filtro de PostgREST: `profesional_id=eq.1` -> '1'. */
function filtro(url: URL, columna: string, operador: 'eq' | 'in'): string | null {
  const valor = url.searchParams.get(columna)
  if (!valor?.startsWith(`${operador}.`)) return null
  return valor.slice(operador.length + 1)
}

async function simularBase(page: Page, reservas: ReturnType<typeof reservasDePrueba>) {
  const pedidasReservas: URL[] = []
  let fallarReservas = false

  await simularSesionProfesional(page, MIA)
  // El vencimiento se calcula con la hora real de Node; con el reloj del
  // navegador fijado, la sesion podria verse vencida e intentar refrescarse.
  await page.addInitScript(() => {
    for (const clave of Object.keys(localStorage)) {
      if (!clave.endsWith('-auth-token')) continue
      const sesion = JSON.parse(localStorage.getItem(clave)!)
      sesion.expires_at = 4102444800
      localStorage.setItem(clave, JSON.stringify(sesion))
    }
  })

  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/profesionales*', (route) => route.fulfill({ json: PROFESIONALES }))
  await page.route('**/rest/v1/disponibilidad*', (route) => {
    const url = new URL(route.request().url())
    return route.fulfill({ json: disponibilidad(Number(filtro(url, 'profesional_id', 'eq'))) })
  })
  await page.route('**/rest/v1/servicios*', (route) => {
    const ids = (filtro(new URL(route.request().url()), 'id', 'in') ?? '()')
      .replace(/[()]/g, '')
      .split(',')
    return route.fulfill({ json: SERVICIOS.filter((s) => ids.includes(String(s.id))) })
  })
  await page.route('**/rest/v1/reservas*', (route) => {
    const url = new URL(route.request().url())
    pedidasReservas.push(url)
    if (fallarReservas) {
      return route.fulfill({ status: 500, json: { code: 'XX000', message: 'la base no responde' } })
    }
    const profesional = filtro(url, 'profesional_id', 'eq')
    return route.fulfill({
      json: reservas.filter((r) => profesional === null || String(r.profesional_id) === profesional),
    })
  })

  return {
    pedidasReservas,
    fallar: (valor: boolean) => {
      fallarReservas = valor
    },
  }
}

/** Fecha 'YYYY-MM-DD' de un instante en Chile, calculada aparte de la app. */
function fechaEnChile(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(instante)
}

async function comprobarSoloLasDeHoyDeMiFicha(page: Page) {
  const main = page.locator('body')
  await expect(main.getByText('Valentina Rojas')).toBeVisible()
  await expect(main.getByText('Josefa Muñoz')).toBeVisible()
  await expect(main.getByText('Manicure rusa')).toBeVisible()
  await expect(main.getByText('Esmaltado permanente')).toBeVisible()
  // De otra profesional, cancelada y de mañana: ninguna en la vista de hoy.
  await expect(main.getByText('Camila Fuentes')).toHaveCount(0)
  await expect(main.getByText('Antonia Pérez')).toHaveCount(0)
  await expect(main.getByText('Martina Lagos')).toHaveCount(0)
  // En orden de hora, no en el de la base.
  const texto = await page.locator('body').innerText()
  expect(texto.indexOf('Valentina Rojas')).toBeLessThan(texto.indexOf('Josefa Muñoz'))
}

test.describe('agenda con el reloj real', () => {
  test.use({ timezoneId: 'America/Santiago', locale: 'es-CL' })

  test('vista día: las reservas de hoy de la ficha en sesión, con su servicio', async ({ page }) => {
    const hoy = fechaEnChile(new Date())
    const manana = fechaEnChile(new Date(Date.now() + 86_400_000))
    const base = await simularBase(page, reservasDePrueba(hoy, manana))

    await page.goto('/profesional/agenda')
    await expect(page.getByRole('heading', { name: 'Mi agenda' })).toBeVisible()
    await comprobarSoloLasDeHoyDeMiFicha(page)

    // La app pidio a la base solo las de su ficha.
    expect(base.pedidasReservas.length).toBeGreaterThan(0)
    for (const url of base.pedidasReservas) {
      expect(url.searchParams.get('profesional_id')).toBe(`eq.${MIA}`)
    }
  })

  test('inicio del panel: mismas reservas de hoy y el recuento sin canceladas', async ({ page }) => {
    const hoy = fechaEnChile(new Date())
    const manana = fechaEnChile(new Date(Date.now() + 86_400_000))
    await simularBase(page, reservasDePrueba(hoy, manana))

    await page.goto('/profesional')
    await expect(page.getByRole('heading', { name: 'Buenos días, Daniela Soto' })).toBeVisible()
    await expect(page.getByText('2 atenciones programadas')).toBeVisible()
    await comprobarSoloLasDeHoyDeMiFicha(page)
  })

  test('error al leer reservas: mensaje y reintentar recupera la agenda', async ({ page }) => {
    const hoy = fechaEnChile(new Date())
    const manana = fechaEnChile(new Date(Date.now() + 86_400_000))
    const base = await simularBase(page, reservasDePrueba(hoy, manana))
    base.fallar(true)

    await page.goto('/profesional/agenda')
    await expect(page.getByText(/No se pudieron cargar las reservas/)).toBeVisible()
    await expect(page.getByText('Valentina Rojas')).toHaveCount(0)

    base.fallar(false)
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(page.getByText('Valentina Rojas')).toBeVisible()
  })

  test('sin reservas: aviso de vacío y día sin atenciones', async ({ page }) => {
    await simularBase(page, [])

    await page.goto('/profesional/agenda')
    await expect(page.getByText(/No hay reservas que mostrar/)).toBeVisible()
    await expect(page.getByText('Sin atenciones hoy.')).toBeVisible()
  })
})

test.describe('hoy es el día de Chile, no el del dispositivo', () => {
  // Dispositivo en UTC a las 01:30 del 29 de octubre: en Chile (UTC-3) siguen
  // siendo las 22:30 del 28. Con `toISODate(new Date())` la agenda mostraria el 29.
  test.use({ timezoneId: 'UTC', locale: 'es-CL' })

  test('vista día, semana y mes usan el 28 de octubre de 2026', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-29T01:30:00Z'))
    await simularBase(page, reservasDePrueba('2026-10-28', '2026-10-29'))

    await page.goto('/profesional/agenda')
    await expect(page.getByText('miércoles 28 de octubre de 2026')).toBeVisible()
    await comprobarSoloLasDeHoyDeMiFicha(page)

    // Semana: las de esta ficha ocupan su hora; la de otra profesional no aparece.
    await page.getByRole('button', { name: 'Semana' }).click()
    await expect(page.getByTitle('10:00–11:00 · Valentina Rojas')).toBeVisible()
    await expect(page.getByTitle('15:30–17:00 · Josefa Muñoz').first()).toBeVisible()
    await expect(page.getByTitle('10:00–11:00 · Martina Lagos')).toBeVisible()
    await expect(page.getByTitle(/Camila Fuentes|Antonia Pérez/)).toHaveCount(0)

    // Mes: el 28 cuenta 2 (la cancelada no), el 29 cuenta 1.
    await page.getByRole('button', { name: 'Mes' }).click()
    await expect(page.getByText('2 reservas', { exact: true })).toBeVisible()
    await expect(page.getByText('1 reserva', { exact: true })).toBeVisible()
  })
})
