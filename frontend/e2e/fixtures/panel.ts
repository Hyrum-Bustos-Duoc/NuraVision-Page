import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import productos from './productos.json' with { type: 'json' }
import { simularSesionStaff } from './sesion'

/** La anon key: del entorno (CI) o de los .env que lee Vite (local). */
function anonKey(): string {
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY
  for (const archivo of ['.env.local', '.env']) {
    try {
      const linea = readFileSync(archivo, 'utf8')
        .split('\n')
        .find((l) => l.startsWith('VITE_SUPABASE_ANON_KEY='))
      if (linea) return linea.slice('VITE_SUPABASE_ANON_KEY='.length).trim()
    } catch {
      // El archivo no existe: se prueba el siguiente.
    }
  }
  throw new Error('Falta VITE_SUPABASE_ANON_KEY.')
}

const hoy = new Date()
const dia = (n: number) => new Date(hoy.getTime() + n * 86400000).toISOString().slice(0, 10)

export const RESERVAS = [
  { id: 101, servicio_id: 6, profesional_id: 1, cliente_id: null, fecha: dia(1), hora_inicio: '10:00', hora_fin: '11:00', cliente_nombre: 'Valentina Rojas', cliente_email: 'vale.rojas@correo.cl', cliente_telefono: '+56911112222', codigo: 'NV-482913', estado: 'pendiente', detalles_extra: null },
  { id: 102, servicio_id: 5, profesional_id: 2, cliente_id: '00000000-0000-4000-8000-000000000009', fecha: dia(2), hora_inicio: '15:30', hora_fin: '17:00', cliente_nombre: 'Camila Fuentes Aravena', cliente_email: 'camila.fuentes@correo.cl', cliente_telefono: null, codigo: 'NV-118204', estado: 'confirmada', detalles_extra: null },
  { id: 103, servicio_id: 9, profesional_id: 1, cliente_id: null, fecha: dia(-3), hora_inicio: '12:00', hora_fin: '14:00', cliente_nombre: 'Josefa Muñoz', cliente_email: 'josefa.m@correo.cl', cliente_telefono: null, codigo: 'NV-993410', estado: 'completada', detalles_extra: null },
  { id: 104, servicio_id: 6, profesional_id: 3, cliente_id: null, fecha: dia(4), hora_inicio: '09:00', hora_fin: '10:00', cliente_nombre: 'Antonia Pérez', cliente_email: 'antonia.perez@correo.cl', cliente_telefono: null, codigo: 'NV-301775', estado: 'cancelada', detalles_extra: null },
]

export const PERFILES = [
  { id: '00000000-0000-4000-8000-000000000001', nombre: 'Paulina Nura', telefono: '+56 9 1234 5678', email: 'paulina@estudionura.cl', rol: 'admin', profesional_id: null, creado_en: '2026-08-01T12:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000002', nombre: 'Daniela Soto', telefono: '+56 9 8765 4321', email: 'daniela@estudionura.cl', rol: 'profesional', profesional_id: 1, creado_en: '2026-08-15T12:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000009', nombre: 'Camila Fuentes Aravena', telefono: null, email: 'camila.fuentes@correo.cl', rol: 'cliente', profesional_id: null, creado_en: '2026-09-20T12:00:00Z' },
]

/**
 * Panel de personal con datos: sesion de staff simulada, tablas privadas con
 * datos de prueba y el resto (servicios, equipo, horarios) leido de la base real
 * con la anon key, porque el token simulado no lo aceptaria.
 */
export async function simularPanelStaff(page: Page) {
  await simularSesionStaff(page)
  const anon = anonKey()
  // Contenido del sitio (0014) en memoria: lo que se guarda se vuelve a leer.
  const contenido = { datos: {} as unknown, actualizado_en: '2026-10-01T12:00:00Z' }
  const guardados: unknown[] = []

  await page.route('**/storage/v1/object/contenido/**', (route) =>
    route.fulfill({ json: { Key: 'contenido/foto.jpg', Id: 'x' } }),
  )

  await page.route('**/rest/v1/**', (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const tabla = url.pathname.split('/rest/v1/')[1]
    if (tabla === 'contenido_sitio') {
      if (req.method() === 'PATCH') {
        contenido.datos = (req.postDataJSON() as { datos: unknown }).datos
        contenido.actualizado_en = new Date().toISOString()
        guardados.push(contenido.datos)
      }
      return route.fulfill({ json: [contenido] })
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ json: [] })
    if (tabla === 'reservas') return route.fulfill({ json: RESERVAS })
    if (tabla === 'perfiles') return route.fulfill({ json: PERFILES })
    if (tabla === 'pedidos') return route.fulfill({ json: [] })
    if (tabla === 'productos') return route.fulfill({ json: productos })
    return route.continue({ headers: { ...req.headers(), authorization: `Bearer ${anon}`, apikey: anon } })
  })

  return { guardados }
}
