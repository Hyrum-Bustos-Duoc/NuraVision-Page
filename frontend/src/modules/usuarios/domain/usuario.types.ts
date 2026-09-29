import type { UsuarioRol } from '@/shared/types/supabase'

export type { UsuarioRol }

/**
 * Una persona con cuenta, vista por el estudio.
 *
 * Sale de `public.perfiles`, no de `auth.users`: esa tabla exige la
 * service_role key y el navegador no la puede leer. `perfiles` la replica en lo
 * que el panel necesita, y la mantiene al dia el trigger de 0010.
 *
 * Por eso `email` es nullable aunque toda cuenta tenga uno: si el trigger no
 * hubiera corrido para una fila antigua, el dato faltaria. Mentirle al tipo lo
 * unico que conseguiria es un `undefined` pintado en la tabla.
 */
export interface Usuario {
  /** uuid de la cuenta. El mismo que `auth.uid()`. */
  id: string
  /**
   * Nunca vacio: la columna es NOT NULL y la migracion garantiza un valor —el
   * nombre del registro, o la parte local del correo—.
   */
  nombre: string
  email: string | null
  telefono: string | null
  rol: UsuarioRol
  /**
   * Ficha de `profesionales` vinculada, o `null`.
   *
   * Es una replica de `app_metadata.profesional_id`, que cada sesion solo puede
   * leer de si misma: sin ella el panel no podria decir a que profesional
   * corresponde una cuenta que no es la propia.
   */
  profesionalId: string | null
  /** ISO. Cuando se creo la cuenta. */
  creadoEn: string
}

/**
 * Lo que el panel puede corregir de un perfil ya existente.
 *
 * Los textos son `string` y NO `string | null`, aunque al leerlos se normalice el
 * vacio a `null`. El motivo es concreto: `perfiles.nombre` es NOT NULL, y no se
 * puede comprobar desde el navegador si `telefono` tambien lo es. Mandar `null`
 * arriesga un 23502 —el mismo error que tumbo la carga inicial de 0010—, mientras
 * que la cadena vacia funciona con las dos formas de la columna y el mapper la
 * trata como ausente al volver a leerla.
 */
export interface DatosPerfil {
  nombre: string
  telefono: string
  rol: UsuarioRol
}

/**
 * Lo que hace falta para dar de alta una cuenta.
 *
 * No se puede hacer desde el navegador: `auth.admin.createUser` exige la
 * service_role key. Va por la Edge Function `admin-cuentas`.
 */
export interface NuevaCuenta {
  email: string
  password: string
  nombre: string
  telefono: string
  rol: UsuarioRol
  /** Obligatoria si `rol` es 'profesional': sin ficha, su panel sale vacio. */
  profesionalId?: string
}

/** Etiquetas de los roles, para no repetirlas en cada pantalla. */
export const ETIQUETA_ROL: Record<UsuarioRol, string> = {
  cliente: 'Clienta',
  profesional: 'Profesional',
  admin: 'Administración',
}

export const ROLES: UsuarioRol[] = ['cliente', 'profesional', 'admin']
