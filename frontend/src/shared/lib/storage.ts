import type { AppData } from '@/shared/types'

// v2: los datos semilla incorporaron usuarios registrados, el estado activo de
// los servicios y el historial de atenciones que alimenta la analítica. Subir
// la versión descarta lo guardado con el modelo anterior en vez de mezclarlo.
const STORAGE_KEY = 'nuravision:data:v2'

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }

/** Lee los datos guardados en el navegador; si no hay o están corruptos, devuelve el fallback. */
export function loadStoredData(fallback: AppData): AppData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as Partial<AppData>
    if (!parsed || typeof parsed !== 'object') return fallback

    return {
      users: Array.isArray(parsed.users) ? parsed.users : fallback.users,
      // `active` se agregó después: lo guardado antes no lo trae y se asume activo.
      services: Array.isArray(parsed.services)
        ? parsed.services.map((service) => ({ ...service, active: service.active !== false }))
        : fallback.services,
      professionals: Array.isArray(parsed.professionals)
        ? parsed.professionals
        : fallback.professionals,
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : fallback.bookings,
    }
  } catch {
    return fallback
  }
}

export function saveStoredData(data: AppData): SaveResult {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return { ok: true }
  } catch (error) {
    const isQuota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return { ok: false, reason: isQuota ? 'quota' : 'unavailable' }
  }
}

export function clearStoredData() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sin almacenamiento disponible: no hay nada que limpiar.
  }
}
