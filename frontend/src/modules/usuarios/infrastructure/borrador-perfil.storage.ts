import type { BorradorPendiente, BorradorPerfilAlmacen } from '../domain/usuario.repository'

/**
 * Lo escrito en «Mi perfil» cuando la sesion expiro al guardar.
 *
 * Al cerrarse la sesion, `/perfil` manda al login y el formulario se desmonta:
 * sin esto, la clienta vuelve y encuentra sus datos viejos.
 *
 * sessionStorage y no localStorage, igual que `pago-pendiente.storage`: vale
 * para esta pestaña y este viaje de ida y vuelta al login, no para la proxima
 * visita. Todo va en try/catch: sin almacenamiento solo se pierde el borrador.
 * Lo que se lee se valida campo por campo: cualquiera puede editarlo.
 */
const CLAVE = 'nuravision:borrador-perfil'

function leer(): BorradorPendiente | null {
  try {
    const crudo: unknown = JSON.parse(window.sessionStorage.getItem(CLAVE) ?? 'null')
    if (crudo === null || typeof crudo !== 'object' || !('usuarioId' in crudo) || !('borrador' in crudo)) {
      return null
    }
    const { usuarioId, borrador } = crudo
    if (typeof usuarioId !== 'string' || usuarioId === '' || borrador === null || typeof borrador !== 'object') {
      return null
    }
    if (!('nombre' in borrador) || !('telefono' in borrador) || !('fechaNacimiento' in borrador)) return null
    const { nombre, telefono, fechaNacimiento } = borrador
    if (
      typeof nombre !== 'string' ||
      typeof telefono !== 'string' ||
      (fechaNacimiento !== null && typeof fechaNacimiento !== 'string')
    ) {
      return null
    }
    return { usuarioId, borrador: { nombre, telefono, fechaNacimiento } }
  } catch {
    return null
  }
}

function recordar(pendiente: BorradorPendiente): void {
  try {
    window.sessionStorage.setItem(CLAVE, JSON.stringify(pendiente))
  } catch {
    // Sin almacenamiento: al volver del login se vera lo guardado en la base.
  }
}

function olvidar(): void {
  try {
    window.sessionStorage.removeItem(CLAVE)
  } catch {
    // Nada que limpiar.
  }
}

export const borradorPerfilAlmacen: BorradorPerfilAlmacen = { leer, recordar, olvidar }
