import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

/** La URL del proyecto: del entorno (CI) o de los .env que lee Vite (local). */
function urlSupabase(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  for (const archivo of ['.env.local', '.env']) {
    try {
      const linea = readFileSync(archivo, 'utf8')
        .split('\n')
        .find((l) => l.startsWith('VITE_SUPABASE_URL='))
      if (linea) return linea.slice('VITE_SUPABASE_URL='.length).trim()
    } catch {
      // El archivo no existe: se prueba el siguiente.
    }
  }
  throw new Error('Falta VITE_SUPABASE_URL para simular la sesión.')
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Lo que cambia de una cuenta simulada a otra. */
interface CuentaSimulada {
  id: string
  email: string
  app_metadata: Record<string, unknown>
  user_metadata: Record<string, unknown>
}

/**
 * Deja la sesion de `cuenta` en el almacenamiento de supabase-js antes de
 * cargar la app, y responde `/auth/v1/user` con ese mismo usuario. El token no
 * esta firmado: sirve solo porque las consultas a la base que usa la prueba
 * tambien estan simuladas. Devuelve el usuario, por si la prueba necesita
 * responder con el (por ejemplo, al refrescar la sesion).
 */
export async function simularSesion(page: Page, cuenta: CuentaSimulada) {
  const ref = new URL(urlSupabase()).hostname.split('.')[0]
  const expira = Math.floor(Date.now() / 1000) + 3600
  const usuario = {
    ...cuenta,
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
  }
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', exp: expira, app_metadata: usuario.app_metadata })}.firma`
  const sesion = {
    access_token: token,
    refresh_token: 'refresh-e2e',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expira,
    user: usuario,
  }

  await page.addInitScript(
    ([clave, valor]) => window.localStorage.setItem(clave, valor),
    [`sb-${ref}-auth-token`, JSON.stringify(sesion)] as const,
  )
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: usuario }))
  return usuario
}

/** Sesion de personal (`app_metadata.es_staff`). */
export async function simularSesionStaff(page: Page) {
  await simularSesion(page, {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'staff@nura.test',
    app_metadata: { es_staff: true },
    user_metadata: { nombre: 'Staff', apellido: 'Nura' },
  })
}
