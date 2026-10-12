import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'
import { simularSesionStaff } from './fixtures/sesion'

/**
 * Abono de los servicios de uñas (openspec/changes/abono-servicios-unas).
 *
 * TODA la API de Supabase va simulada: 0015 no esta aplicada en ningun
 * proyecto, y estas pruebas crean reservas, asi que no deben tocar una base
 * real. Lo que no se reconoce se aborta en vez de seguir a la red.
 */

const QA_DIR =
  '/private/tmp/claude-502/-Users-hyrumbustos-Documents-GitHub-duoc-NuraVision-Page/57858c4f-3d79-45fb-8963-97035ce5e12d/scratchpad/qa-abono'

/**
 * Webpay simulado: la Edge Function devuelve esta URL y el navegador le envia
 * un formulario con `token_ws`. Se atiende aqui para no salir a Transbank.
 */
const URL_WEBPAY = 'https://webpay.simulado.test/webpayserver/initTransaction'
const TOKEN_WEBPAY = 'tok-simulado-1'
const HOY = new Date('2026-10-08T12:00:00-03:00')

const servicio = (id: number, nombre: string, categoria: string | null, precio: number, abono: number, variantes: unknown = null) => ({
  id, nombre, categoria, descripcion: `${nombre}.`, imagen_url: null, descripcion_larga: null, incluye: [],
  variantes, duracion_minutos: 60, duracion_bloques: 1, precio_base: precio, activo: true, abono,
})

const SERVICIOS = [
  servicio(6, 'Manicura Completa', 'Uñas', 18000, 5000),
  servicio(1, 'Corte de Pelo', 'Estilismo', 20000, 0),
  servicio(20, 'Esmaltado con retiro', 'Uñas', 15000, 4000, {
    pregunta: '¿Necesitas retiro?',
    opciones: [
      { id: 'sin', etiqueta: 'Sin retiro', precio: 15000 },
      { id: 'con', etiqueta: 'Con retiro', precio: 20000 },
    ],
  }),
  servicio(21, 'Uñas con diseño', 'Uñas', 14000, 3000, {
    pregunta: '¿Cuántas uñas?',
    opciones: [
      { id: 'pocas', etiqueta: 'Hasta 4', precio: 10000 },
      { id: 'todas', etiqueta: 'Todas', precio: 14000 },
    ],
  }),
]
const PROFESIONAL = { id: 1, nombre: 'Berenice', especialidad: 'Manicurista', avatar_url: null, activo: true, experiencia_anios: 5, biografia: null, categoria: null }
const DISPONIBILIDAD = [1, 2, 3, 4, 5, 6].map((d) => ({
  id: d, profesional_id: 1, dia_semana: d, hora_inicio: '10:00:00', hora_fin: '18:00:00', activo: true, bloques_bloqueados: [],
}))

const CLIENTA_ID = '00000000-0000-4000-8000-0000000000c1'
const reservaBase = (id: number, servicioId: number, abono: number, extra: object = {}) => ({
  id, servicio_id: servicioId, profesional_id: 1, cliente_id: CLIENTA_ID, fecha: '2026-11-20', hora_inicio: '10:00:00',
  hora_fin: '11:00:00', cliente_nombre: 'Camila Fuentes', cliente_email: 'camila@correo.cl', cliente_telefono: '+56911112222',
  codigo: `NV-${id}`, estado: 'confirmada', detalles_extra: null, confirmacion_enviada_en: null, abono, ...extra,
})

interface OpcionesApi {
  /** Respuestas sucesivas al insert de reservas; la ultima se repite. */
  insert?: { status: number; body?: unknown; demoraMs?: number }[]
  reservas?: ReturnType<typeof reservaBase>[]
  /** Respuestas sucesivas de `webpay-crear-transaccion`; la ultima se repite. */
  webpay?: { status: number; body?: unknown }[]
}

/** Simula PostgREST y las Edge Functions. Devuelve lo que se escribio. */
async function simularApi(page: Page, opciones: OpcionesApi = {}) {
  const inserts: Request[] = []
  const patches: Request[] = []
  /** Llamadas a `webpay-crear-transaccion`: lo que se pidio cobrar. */
  const cobros: Request[] = []
  /** Formularios que llegaron a Webpay. */
  const formularios: Request[] = []
  const respuestasInsert = opciones.insert ?? [{ status: 201 }]
  const respuestasWebpay = opciones.webpay ?? [
    { status: 200, body: { token: TOKEN_WEBPAY, url: URL_WEBPAY, buyOrder: 'RS1-abc', monto: 5000 } },
  ]
  const reservas = opciones.reservas ?? []

  await page.route('**/functions/v1/**', (r) => r.fulfill({ json: { enviada: true } }))
  // Registrada despues: Playwright prueba primero la ultima ruta que coincide.
  await page.route('**/functions/v1/webpay-crear-transaccion', (r) => {
    const resp = respuestasWebpay[Math.min(cobros.length, respuestasWebpay.length - 1)]
    cobros.push(r.request())
    return r.fulfill({ status: resp.status, json: resp.body ?? {} })
  })
  await page.route(`${URL_WEBPAY}**`, (r) => {
    formularios.push(r.request())
    return r.fulfill({ contentType: 'text/html', body: '<h1>Webpay simulado</h1>' })
  })
  await page.route('**/storage/v1/**', (r) => r.abort())
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const tabla = url.pathname.split('/rest/v1/')[1]
    const p = url.searchParams
    const eqNum = (k: string) => (p.get(k)?.startsWith('eq.') ? Number(p.get(k)!.slice(3)) : null)
    const inNums = (k: string) => (p.get(k)?.startsWith('in.(') ? p.get(k)!.slice(4, -1).split(',').map(Number) : null)

    if (tabla === 'reservas' && req.method() === 'POST') {
      const r = respuestasInsert[Math.min(inserts.length, respuestasInsert.length - 1)]
      inserts.push(req)
      if (r.demoraMs) await new Promise((ok) => setTimeout(ok, r.demoraMs))
      return route.fulfill({ status: r.status, json: r.body ?? '' })
    }
    if (tabla === 'reservas' && req.method() === 'PATCH') {
      patches.push(req)
      const id = eqNum('id')
      const fila = reservas.find((x) => x.id === id)
      if (!fila) return route.fulfill({ json: [] })
      Object.assign(fila, req.postDataJSON())
      return route.fulfill({ json: [fila] })
    }
    if (tabla === 'servicios' && req.method() === 'PATCH') {
      patches.push(req)
      const fila = SERVICIOS.find((s) => s.id === eqNum('id'))
      return route.fulfill({ json: fila ? [{ ...fila, ...req.postDataJSON() }] : [] })
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 405, json: { message: 'no simulado' } })

    if (tabla === 'servicios') {
      const id = eqNum('id')
      const ids = inNums('id')
      return route.fulfill({ json: SERVICIOS.filter((s) => (id === null || s.id === id) && (ids === null || ids.includes(s.id))) })
    }
    if (tabla === 'profesionales') return route.fulfill({ json: [PROFESIONAL] })
    if (tabla === 'profesional_servicios') {
      const sid = eqNum('servicio_id')
      return route.fulfill({
        json: SERVICIOS.filter((s) => sid === null || s.id === sid).map((s) => ({ profesional_id: 1, servicio_id: s.id })),
      })
    }
    if (tabla === 'disponibilidad') return route.fulfill({ json: DISPONIBILIDAD })
    if (tabla === 'reservas') {
      const id = eqNum('id')
      return route.fulfill({ json: reservas.filter((x) => id === null || x.id === id) })
    }
    return route.fulfill({ json: [] })
  })
  return { inserts, patches, cobros, formularios }
}

/** Servicio -> profesional -> 16 nov 2026 (lunes) -> primera hora libre -> Confirmar. */
async function llegarAConfirmar(page: Page, nombreServicio: string, opcion?: string) {
  await page.goto('/reservar')
  await page.getByRole('button', { name: new RegExp(nombreServicio) }).first().click()
  if (opcion) await page.getByRole('button', { name: new RegExp(opcion) }).click()
  await page.getByRole('button', { name: /Berenice/ }).click()
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await page.getByRole('button', { name: '16', exact: true }).click()
  // La primera hora libre: los datos de demostracion del navegador ocupan
  // algunas, y cuales depende de la semilla local.
  const hora = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()
  const elegida = (await hora.textContent())!.trim()
  await hora.click()
  await expect(page.getByRole('heading', { name: 'Revisa y confirma' })).toBeVisible()
  return elegida
}

async function llenarContacto(page: Page) {
  await page.getByLabel('Nombre y apellido').fill('Ana Pérez')
  await page.getByLabel('Correo electrónico').fill('ana@correo.cl')
  await page.getByLabel('Teléfono').fill('+56912345678')
}

const pagar = (page: Page) => page.getByRole('button', { name: 'Pagar abono con Webpay' })

/** El navegador llego a Webpay con el token, por POST como exige Transbank. */
async function esperarWebpay(page: Page, formularios: Request[]) {
  await expect(page.getByRole('heading', { name: 'Webpay simulado' })).toBeVisible()
  expect(formularios).toHaveLength(1)
  expect(formularios[0].method()).toBe('POST')
  expect(formularios[0].postData()).toBe(`token_ws=${TOKEN_WEBPAY}`)
}

/** Lo que se le pidio cobrar a la Edge Function: solo el codigo, nunca un monto. */
function cuerpoCobro(cobro: Request) {
  return cobro.postDataJSON() as Record<string, unknown>
}

test.describe('abono en el flujo de reserva', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(HOY)
  })

  test('uñas: paso Abono sin alternativa; pagar crea la reserva y va a Webpay con solo el codigo', async ({ page }) => {
    const { inserts, cobros, formularios } = await simularApi(page)
    const hora = await llegarAConfirmar(page, 'Manicura Completa')
    await expect(page.getByText('Abono hoy con Webpay')).toBeVisible()
    // Con abono no se elige: el pago en linea es obligatorio.
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.getByText('Pagar en el estudio')).toHaveCount(0)
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()

    await expect(page.getByRole('heading', { name: 'Abono', exact: true })).toBeVisible()
    const stepper = page.getByRole('group', { name: 'Pasos' })
    await expect(stepper).toContainText('Abono')
    const resumen = page.locator('aside')
    await expect(resumen).toContainText('Total del servicio$18.000')
    await expect(resumen).toContainText('Abono hoy con Webpay$5.000')
    await expect(resumen).toContainText('Saldo a pagar en el local$13.000')
    await expect(resumen).toContainText('El abono se descuenta del total el día de tu cita.')
    // La tarjeta se escribe en Webpay, no aqui.
    await expect(page.getByLabel('Número de tarjeta')).toHaveCount(0)
    await page.screenshot({ path: `${QA_DIR}/abono-escritorio.png`, fullPage: true })
    expect(inserts).toHaveLength(0)
    expect(cobros).toHaveLength(0)

    await pagar(page).click()
    await esperarWebpay(page, formularios)

    expect(inserts).toHaveLength(1)
    const cuerpo = inserts[0].postDataJSON()
    const fila = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo
    expect(fila).not.toHaveProperty('abono')
    expect(fila).toMatchObject({ servicio_id: 6, profesional_id: 1, fecha: '2026-11-16', hora_inicio: hora, cliente_email: 'ana@correo.cl' })
    // El monto lo decide el servidor: el navegador solo identifica la reserva.
    expect(cobros).toHaveLength(1)
    expect(cuerpoCobro(cobros[0])).toEqual({ reservaCodigo: fila.codigo })
  })

  test('doble clic en Pagar crea una sola reserva', async ({ page }) => {
    const { inserts, cobros, formularios } = await simularApi(page, { insert: [{ status: 201, demoraMs: 800 }] })
    await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await pagar(page).dblclick()
    await esperarWebpay(page, formularios)
    expect(inserts).toHaveLength(1)
    expect(cobros).toHaveLength(1)
  })

  for (const caso of [
    { nombre: '500', status: 500, body: { message: 'boom', code: 'XX000' } },
    { nombre: '23503', status: 409, body: { message: 'servicio 6 no existe', code: '23503', details: null, hint: null } },
    // El trigger de la base rechaza una opcion de variante invalida: su texto
    // es para la clienta y se muestra tal cual.
    { nombre: 'P0001', status: 400, body: { message: 'Elige una opción válida para este servicio.', code: 'P0001', details: null, hint: null } },
  ]) {
    test(`insert que falla (${caso.nombre}): sigue en Abono, avisa que no hubo cobro y permite reintentar`, async ({ page }) => {
      const { inserts, cobros, formularios } = await simularApi(page, { insert: [{ status: caso.status, body: caso.body }, { status: 201 }] })
      await llegarAConfirmar(page, 'Manicura Completa')
      await llenarContacto(page)
      await page.getByRole('button', { name: 'Continuar al abono' }).click()
      await pagar(page).click()

      const alerta = page.getByRole('alert')
      await expect(alerta).toContainText('No se realizó ningún cobro.')
      if (caso.nombre === '23503') await expect(alerta).toContainText('ya no está disponible')
      if (caso.nombre === 'P0001') await expect(alerta).toContainText('Elige una opción válida para este servicio.')
      await expect(alerta).not.toContainText('servicio 6 no existe')
      await expect(page.getByRole('heading', { name: 'Abono', exact: true })).toBeVisible()
      // Sin reserva no se abre ningun cobro.
      expect(cobros).toHaveLength(0)

      await pagar(page).click()
      await esperarWebpay(page, formularios)
      expect(inserts).toHaveLength(2)
      // Codigo nuevo en el reintento: el anterior no llego a existir.
      expect(inserts[0].postDataJSON().codigo).not.toBe(inserts[1].postDataJSON().codigo)
    })
  }

  test('tras un fallo, volver y reentrar al Abono no muestra el error viejo', async ({ page }) => {
    await simularApi(page, { insert: [{ status: 500, body: { message: 'boom' } }] })
    await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await pagar(page).click()
    await expect(page.getByRole('alert')).toContainText('No se realizó ningún cobro.')
    await page.getByRole('button', { name: '← Volver a la confirmación' }).click()
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await expect(pagar(page)).toBeVisible()
    await expect(page.getByText('No se realizó ningún cobro.')).toHaveCount(0)
  })

  test('servicio sin abono: ni paso ni linea, Confirmar crea la reserva', async ({ page }) => {
    const { inserts } = await simularApi(page)
    await llegarAConfirmar(page, 'Corte de Pelo')
    await expect(page.getByRole('group', { name: 'Pasos' })).not.toContainText('Abono')
    await expect(page.getByText('Total a pagar en el salón')).toBeVisible()
    await expect(page.getByText(/Abono/)).toHaveCount(0)
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(page.getByRole('heading', { name: 'Tu reserva está confirmada' })).toBeVisible()
    await expect(page.getByText(/Abono/)).toHaveCount(0)
    expect(inserts).toHaveLength(1)
  })

  test('servicio sin abono: se puede pagar el total con Webpay', async ({ page }) => {
    const { inserts, cobros, formularios } = await simularApi(page)
    await llegarAConfirmar(page, 'Corte de Pelo')
    await expect(page.getByRole('radio', { name: /Pagar en el estudio/ })).toBeChecked()
    await llenarContacto(page)
    await page.getByRole('radio', { name: /Pagar ahora con Webpay/ }).check()
    await expect(page.getByText('Total a pagar ahora')).toBeVisible()
    await page.getByRole('button', { name: 'Pagar $20.000 con Webpay' }).click()
    await esperarWebpay(page, formularios)
    expect(inserts).toHaveLength(1)
    const fila = inserts[0].postDataJSON()
    expect(cuerpoCobro(cobros[0])).toEqual({ reservaCodigo: (Array.isArray(fila) ? fila[0] : fila).codigo })
  })

  test('si Webpay no abre, la hora queda guardada y reintentar no crea otra reserva', async ({ page }) => {
    const { inserts, cobros, formularios } = await simularApi(page, {
      webpay: [
        { status: 502, body: { error: 'La pasarela no respondió.' } },
        { status: 200, body: { token: TOKEN_WEBPAY, url: URL_WEBPAY, buyOrder: 'RS1-abc', monto: 5000 } },
      ],
    })
    await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await pagar(page).click()

    const alerta = page.getByRole('alert')
    await expect(alerta).toContainText('La pasarela no respondió.')
    await expect(alerta).toContainText('Tu hora quedó registrada')
    await expect(alerta).not.toContainText('No se realizó ningún cobro.')

    await page.getByRole('button', { name: 'Reintentar el pago del abono' }).click()
    await esperarWebpay(page, formularios)
    expect(inserts).toHaveLength(1)
    expect(cobros).toHaveLength(2)
    expect(cuerpoCobro(cobros[1])).toEqual(cuerpoCobro(cobros[0]))
  })

  test('variante de 20.000 con abono 4.000: saldo 16.000', async ({ page }) => {
    await simularApi(page)
    await llegarAConfirmar(page, 'Esmaltado con retiro', 'Con retiro')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await expect(page.locator('aside')).toContainText('Saldo a pagar en el local$16.000')
    await expect(page.locator('aside')).toContainText('Abono hoy con Webpay$4.000')
  })

  test('volver desde Abono conserva servicio, hora y contacto, sin crear reserva', async ({ page }) => {
    const { inserts } = await simularApi(page)
    const hora = await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await page.getByRole('button', { name: '← Volver a la confirmación' }).click()

    await expect(page.getByRole('heading', { name: 'Revisa y confirma' })).toBeVisible()
    await expect(page.getByLabel('Nombre y apellido')).toHaveValue('Ana Pérez')
    await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@correo.cl')
    await expect(page.getByLabel('Teléfono')).toHaveValue('+56912345678')
    await expect(page.getByText('Manicura Completa').first()).toBeVisible()
    await expect(page.getByText(new RegExp(hora)).first()).toBeVisible()
    expect(inserts).toHaveLength(0)
  })

  test('tras un fallo en Abono, Nuria cambia el borrador y Confirmar no arrastra el error', async ({ page }) => {
    const { inserts } = await simularApi(page, { insert: [{ status: 500, body: { message: 'boom' } }, { status: 201 }] })
    await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await pagar(page).click()
    await expect(page.getByRole('alert')).toContainText('No se realizó ningún cobro.')

    // Sin pasar por «Volver»: Nuria reemplaza el borrador con la pagina montada.
    await page.getByRole('button', { name: 'Pregúntale a Nuria, asistente de compras y reservas' }).click()
    await page.getByLabel('Mensaje para Nuria').fill('quiero reservar un corte de pelo')
    await page.getByLabel('Mensaje para Nuria').press('Enter')
    const panel = page.getByRole('dialog', { name: /Nuria/ }).or(page.getByLabel('Nuria, asistente de compras y reservas'))
    await panel.getByRole('button', { name: /(Hoy|Mañana|\d)/ }).filter({ hasText: /\d{1,2}:\d{2}/ }).first().click()
    await panel.getByRole('button', { name: 'Confirmar reserva →' }).click()

    await expect(page.getByRole('heading', { name: 'Revisa y confirma' })).toBeVisible()
    await expect(page.getByText('Corte de Pelo').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirmar reserva' })).toBeVisible()
    await expect(page.getByText(/boom/)).toHaveCount(0)
    expect(inserts).toHaveLength(1)
  })

  test('flujo iniciado desde Nuria pasa por el paso Abono', async ({ page }) => {
    const { inserts, formularios } = await simularApi(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Pregúntale a Nuria, asistente de compras y reservas' }).click()
    await page.getByLabel('Mensaje para Nuria').fill('quiero reservar una manicure')
    await page.getByLabel('Mensaje para Nuria').press('Enter')
    const panel = page.getByRole('dialog', { name: /Nuria/ }).or(page.getByLabel('Nuria, asistente de compras y reservas'))
    const hora = panel.getByRole('button', { name: /(Hoy|Mañana|\d)/ }).filter({ hasText: /\d{1,2}:\d{2}/ }).first()
    await hora.click()
    await panel.getByRole('button', { name: 'Confirmar reserva →' }).click()

    await expect(page.getByRole('heading', { name: 'Revisa y confirma' })).toBeVisible()
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await expect(page.getByRole('heading', { name: 'Abono', exact: true })).toBeVisible()
    expect(inserts).toHaveLength(0)
    await pagar(page).click()
    await esperarWebpay(page, formularios)
    expect(inserts).toHaveLength(1)
  })

  test('móvil 375px: el paso Abono no tiene scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await simularApi(page)
    await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    // El indicador compacto dice en que paso se esta; la fila completa no cabe.
    await expect(page.getByText(/Paso 6 de 6/)).toBeVisible()
    await expect(page.getByText(/Paso 6 de 6/)).toContainText('Abono')
    const anchos = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vista: window.innerWidth }))
    await page.screenshot({ path: `${QA_DIR}/abono-movil.png`, fullPage: true })
    expect(anchos.doc).toBeLessThanOrEqual(anchos.vista)
    expect(anchos.body).toBeLessThanOrEqual(anchos.vista)
  })

  test('reserva local antigua sin abono: el detalle no falla ni muestra abono', async ({ page }) => {
    await simularApi(page)
    await page.addInitScript(() => {
      localStorage.setItem('nuravision:data:v2', JSON.stringify({
        bookings: [{ id: 'b-vieja', code: 'NV-1611-1234', serviceId: '6', professionalId: '1', clientName: 'Ana', clientEmail: 'a@x.cl', clientPhone: '1', guest: true, dateISO: '2026-11-16', time: '10:00', durationMin: 60, price: 18000, status: 'confirmada' }],
      }))
    })
    await page.goto('/mis-reservas/b-vieja')
    await expect(page.getByText('NV-1611-1234')).toBeVisible()
    await expect(page.getByText(/Abono/)).toHaveCount(0)
    await expect(page.getByText(/no es reembolsable/)).toHaveCount(0)
  })

  test('escritorio 1280px: el boton de Nuria no tapa la politica del resumen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await simularApi(page)
    await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    // Sin desplazar, y otra vez con la politica centrada y al fondo de la
    // pagina: el boton es fijo, asi que un solo encuadre no prueba nada.
    const texto = page.locator('aside').getByText(/no es reembolsable/)
    for (const encuadre of ['inicio', 'centrada', 'fondo'] as const) {
      if (encuadre === 'centrada') await texto.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      if (encuadre === 'fondo') await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await expect(texto).toBeInViewport({ ratio: encuadre === 'inicio' ? 0 : 1 })
      await cruzaConNuria(page, texto, encuadre)
    }
  })

  async function cruzaConNuria(page: Page, texto: ReturnType<Page['locator']>, encuadre: string) {
    const politica = await texto.boundingBox()
    const nuria = await page
      .getByRole('button', { name: 'Pregúntale a Nuria, asistente de compras y reservas' })
      .boundingBox()
    expect(politica).not.toBeNull()
    expect(nuria).not.toBeNull()
    if (!politica || !nuria) return
    const seCruzan =
      politica.x < nuria.x + nuria.width &&
      nuria.x < politica.x + politica.width &&
      politica.y < nuria.y + nuria.height &&
      nuria.y < politica.y + politica.height
    expect(seCruzan, `se cruzan con la politica en encuadre ${encuadre}`).toBe(false)
  }

  for (const ancho of [375, 768, 1280]) {
    test(`indicador de pasos a ${ancho}px: el paso actual se ve en todos los pasos`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 })
      await simularApi(page)
      // Con variante y abono: los 7 pasos posibles.
      const pasos = ['Servicio', 'Opción', 'Profesional', 'Fecha', 'Hora', 'Confirmación', 'Abono']
      const comprobar = async (i: number) => {
        if (ancho < 640) {
          await expect(page.getByText(`Paso ${i + 1} de ${pasos.length} · ${pasos[i]}`)).toBeVisible()
        } else {
          const actual = page.locator('[aria-current="step"]')
          await expect(actual).toHaveCount(1)
          await expect(actual).toContainText(pasos[i])
          await expect(actual).toBeInViewport({ ratio: 1 })
        }
        const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(sobra, `scroll horizontal en ${pasos[i]}`).toBeLessThanOrEqual(0)
      }
      await page.goto('/reservar')
      // El paso Servicio todavia no sabe si habra variante ni abono: 5 pasos.
      if (ancho < 640) await expect(page.getByText(/^Paso 1 de \d · Servicio$/)).toBeVisible()
      await page.getByRole('button', { name: /Esmaltado con retiro/ }).first().click()
      await comprobar(1)
      await page.getByRole('button', { name: /Con retiro/ }).click()
      await comprobar(2)
      await page.getByRole('button', { name: /Berenice/ }).click()
      await comprobar(3)
      await page.getByRole('button', { name: 'Mes siguiente' }).click()
      await page.getByRole('button', { name: 'Mes siguiente' }).click()
      await page.getByRole('button', { name: '16', exact: true }).click()
      await comprobar(4)
      await page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first().click()
      await comprobar(5)
      await llenarContacto(page)
      await page.getByRole('button', { name: 'Continuar al abono' }).click()
      await comprobar(6)
      await page.screenshot({ path: `${QA_DIR}/abono-${ancho}.png`, fullPage: true })
      await page.getByRole('button', { name: '← Volver a la confirmación' }).click()
      await comprobar(5)
    })
  }
})

// ---------------------------------------------------------------------------
// Clienta con sesion: Mis reservas, detalle, cancelar y reprogramar
// ---------------------------------------------------------------------------

function urlSupabase(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  for (const archivo of ['.env.local', '.env']) {
    try {
      const linea = readFileSync(archivo, 'utf8').split('\n').find((l) => l.startsWith('VITE_SUPABASE_URL='))
      if (linea) return linea.slice('VITE_SUPABASE_URL='.length).trim()
    } catch {
      // siguiente
    }
  }
  throw new Error('Falta VITE_SUPABASE_URL')
}

async function simularSesionClienta(page: Page) {
  const ref = new URL(urlSupabase()).hostname.split('.')[0]
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const expira = Math.floor(HOY.getTime() / 1000) + 3600
  const usuario = {
    id: CLIENTA_ID, aud: 'authenticated', role: 'authenticated', email: 'camila@correo.cl',
    app_metadata: {}, user_metadata: { nombre: 'Camila', apellido: 'Fuentes' }, created_at: '2026-01-01T00:00:00Z',
  }
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: CLIENTA_ID, role: 'authenticated', exp: expira })}.firma`
  const sesion = { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: expira, user: usuario }
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(sesion)] as const)
  await page.route('**/auth/v1/user', (r) => r.fulfill({ json: usuario }))
}

test.describe('abono visible tras reservar', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(HOY)
  })

  test('Mis reservas y detalle muestran abono y politica; cancelar no lo cambia', async ({ page }) => {
    await simularSesionClienta(page)
    const { patches } = await simularApi(page, {
      reservas: [reservaBase(501, 6, 5000), reservaBase(502, 1, 0, { fecha: '2026-11-21' })],
    })
    await page.goto('/mis-reservas')
    await expect(page.getByText('Abono $5.000', { exact: false })).toHaveCount(1)
    await expect(page.getByText(/con menos de 24 horas, no es reembolsable/)).toHaveCount(1)

    await page.goto('/mis-reservas/501')
    await expect(page.getByText('Abono', { exact: true })).toBeVisible()
    await expect(page.getByText(/con menos de 24 horas, no es reembolsable/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar reserva' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar reserva' }).click()
    await expect(page.getByText(/Cancelada/i).first()).toBeVisible()
    await expect(page.getByText('Abono', { exact: true })).toBeVisible()
    await expect(page.getByText(/con menos de 24 horas, no es reembolsable/)).toBeVisible()
    expect(patches).toHaveLength(1)
    expect(patches[0].postDataJSON()).toEqual({ estado: 'cancelada' })

    await page.goto('/mis-reservas')
    await page.getByRole('button', { name: /Canceladas/ }).click()
    await expect(page.getByText(/Abono \$5\.000/)).toBeVisible()
    await expect(page.getByText(/con menos de 24 horas, no es reembolsable/)).toBeVisible()
  })

  test('reprogramar no pide pago ni envia abono', async ({ page }) => {
    await simularSesionClienta(page)
    const { patches, inserts } = await simularApi(page, { reservas: [reservaBase(501, 6, 5000)] })
    await page.goto('/mis-reservas/501')
    await page.getByRole('button', { name: 'Reprogramar' }).click()
    await page.getByRole('button', { name: 'Mes siguiente' }).click()
    await page.getByRole('button', { name: 'Mes siguiente' }).click()
    await page.getByRole('button', { name: '23', exact: true }).click()
    await page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first().click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText(/Pagar abono/)).toHaveCount(0)
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0].postDataJSON()).not.toHaveProperty('abono')
    await expect(page.getByText('Abono', { exact: true })).toBeVisible()
    expect(inserts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Panel del estudio
// ---------------------------------------------------------------------------

test.describe('abono en el panel', () => {
  test('panel de reservas: abono 5.000 se muestra, abono 0 no', async ({ page }) => {
    await simularSesionStaff(page)
    await simularApi(page, {
      reservas: [reservaBase(601, 6, 5000, { cliente_nombre: 'Clienta Uno' }), reservaBase(602, 1, 0, { cliente_nombre: 'Clienta Dos' })],
    })
    await page.goto('/admin/reservas')
    await expect(page.getByRole('row', { name: /Clienta Uno/ })).toContainText('Abono $5.000')
    await expect(page.getByRole('row', { name: /Clienta Dos/ })).not.toContainText('Abono')
  })

  async function editar(page: Page, nombre: string, abono: string) {
    await page.getByRole('button', { name: `Editar ${nombre}` }).click()
    await page.getByLabel('Abono (CLP)').fill(abono)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
  }

  test('uñas con abono 0 no guarda y muestra el mensaje', async ({ page }) => {
    await simularSesionStaff(page)
    const { patches } = await simularApi(page)
    await page.goto('/admin/servicios')
    await editar(page, 'Manicura Completa', '0')
    await expect(page.getByText('Los servicios de uñas requieren un abono mayor que $0.')).toBeVisible()
    await page.waitForTimeout(300)
    expect(patches).toHaveLength(0)
  })

  test('abono mayor que el precio desde (variantes) no guarda', async ({ page }) => {
    await simularSesionStaff(page)
    const { patches } = await simularApi(page)
    await page.goto('/admin/servicios')
    await editar(page, 'Uñas con diseño', '12000')
    await expect(page.getByText(/no puede superar.*\$10\.000/)).toBeVisible()
    await page.waitForTimeout(300)
    expect(patches).toHaveLength(0)
  })

  test('cabello con abono 0 guarda', async ({ page }) => {
    await simularSesionStaff(page)
    const { patches } = await simularApi(page)
    await page.goto('/admin/servicios')
    await editar(page, 'Corte de Pelo', '0')
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0].postDataJSON()).toMatchObject({ abono: 0, categoria: 'cabello' })
  })

  test('editar abono de 5.000 a 6.000 envia 6000', async ({ page }) => {
    await simularSesionStaff(page)
    const { patches } = await simularApi(page)
    await page.goto('/admin/servicios')
    await editar(page, 'Manicura Completa', '6000')
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0].postDataJSON()).toMatchObject({ abono: 6000 })
  })
})

// --- QA (nv-qa, 2026-10-11) ----------------------------------------------------
// Tras salir a Webpay, la pagina del flujo pierde el estado (`reservaGuardada`).
// Si la clienta vuelve sin pagar y reintenta, se crea OTRA reserva por la misma
// hora: la primera queda 'pendiente' y huerfana. La pantalla de resultado no
// ofrece reintentar el pago de la reserva ya creada (spec pagos-webpay).
test.describe('QA: reintento despues de salir a Webpay', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(HOY)
  })

  test('QA: volver de Webpay sin pagar y reintentar no crea una segunda reserva', async ({ page }) => {
    const { inserts, cobros, formularios } = await simularApi(page)
    const hora = await llegarAConfirmar(page, 'Manicura Completa')
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await pagar(page).click()
    await esperarWebpay(page, formularios)

    // «Atras» en Webpay: Chromium recarga el flujo desde cero.
    await page.goBack()
    const otra = await llegarAConfirmar(page, 'Manicura Completa')
    expect(otra).toBe(hora)
    await llenarContacto(page)
    await page.getByRole('button', { name: 'Continuar al abono' }).click()
    await pagar(page).click()
    await expect.poll(() => cobros.length).toBe(2)

    const codigos = cobros.map((c) => (c.postDataJSON() as { reservaCodigo: string }).reservaCodigo)
    console.log('QA inserts:', inserts.length, 'codigos cobrados:', codigos)
    expect(inserts).toHaveLength(1)
  })
})
