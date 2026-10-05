import type { UsuarioAuth } from '../domain/auth.types'

/**
 * Administracion entra al listado de reservas y no a `/admin`, porque es la
 * unica pantalla del panel que lee datos reales; el resto sigue con los de
 * ejemplo. Es el mismo destino al que llevan los atajos del prototipo.
 */
export const RUTA_STAFF = '/admin/reservas'
export const RUTA_PROFESIONAL = '/profesional'
export const RUTA_CLIENTA = '/mis-reservas'

/**
 * Panel interno que le corresponde a una sesion, o `null` si no le corresponde
 * ninguno.
 *
 * El orden importa: una cuenta puede tener las dos marcas a la vez —la de
 * 0008 las tiene— y entonces manda `es_staff`, que es el permiso mas amplio.
 * Quien administra y ademas atiende puede llegar a `/profesional` por la barra
 * de direcciones; al reves, dar por defecto el panel mas reducido, obligaria a
 * adivinar que existe el otro.
 *
 * Las marcas salen de `app_metadata`, que solo se escribe con la service_role
 * key. Esto NO es un permiso: solo decide a que pantalla se llega. Quien decide
 * que datos se ven es Row Level Security, y a un panel al que no se tiene
 * acceso se llega para encontrarlo vacio, no para leer nada.
 */
export function rutaDePanel(usuario: UsuarioAuth): string | null {
  if (usuario.esStaff) return RUTA_STAFF
  if (usuario.profesionalId !== null) return RUTA_PROFESIONAL
  return null
}

/**
 * Valida el `?volver=` con que se llega al login, o `null` si no sirve.
 *
 * Solo acepta rutas internas: "/checkout" si, "//sitio-malo.com" o
 * "https://…" no. Sin esta comprobacion el login seria una redireccion abierta:
 * un enlace con el dominio del estudio que, tras escribir la contraseña, deja a
 * la persona en otro sitio que imita al nuestro.
 */
export function rutaDeRetorno(valor: string | null): string | null {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.includes('\\')) return null
  // Volver al login o al registro despues de entrar no tiene sentido.
  if (/^\/(login|registro)(\/|\?|$)/.test(valor)) return null
  return valor
}

/**
 * A donde llevar a alguien que acaba de iniciar sesion.
 *
 * Antes el formulario mandaba a todo el mundo a `/mis-reservas`, asi que una
 * profesional entraba con sus credenciales correctas y aterrizaba en la vista de
 * clienta, sin nada que le indicara que su panel existia.
 *
 * Respeta `?volver=` (el checkout manda ahi a quien quiere recibir el pedido en
 * su cita), pero el panel interno manda sobre el retorno: una profesional que
 * entra desde el checkout tiene que llegar a su panel, no a la tienda.
 */
export function rutaTrasIniciarSesion(usuario: UsuarioAuth, volver: string | null): string {
  return rutaDePanel(usuario) ?? rutaDeRetorno(volver) ?? RUTA_CLIENTA
}
