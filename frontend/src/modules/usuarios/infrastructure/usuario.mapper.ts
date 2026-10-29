import { esFechaISO } from '@/shared/lib/calendario'
import type { Database, Tables } from '@/shared/types/supabase'
import type { DatosPerfilPropio, DatosPersonales, Usuario } from '../domain/usuario.types'

export type PerfilRow = Tables<'perfiles'>

type ActualizarMiPerfil = Database['public']['Functions']['actualizar_mi_perfil']

/**
 * Argumentos de `actualizar_mi_perfil()`.
 *
 * El tipo de retorno explicito es la defensa: `rpc()` infiere `Args` del objeto
 * que recibe y no rechaza claves de mas (supabase-js 2.109.0), asi que un
 * literal dentro de la llamada compilaria con un `p_rol`. Aqui no.
 * `p_fecha_nacimiento` viaja como null, no se omite: es obligatorio.
 */
export function toArgumentosActualizarMiPerfil(datos: DatosPerfilPropio): ActualizarMiPerfil['Args'] {
  return {
    p_nombre: datos.nombre,
    p_telefono: datos.telefono,
    p_fecha_nacimiento: datos.fechaNacimiento,
  }
}

/** Fila devuelta por `actualizar_mi_perfil()` -> los mismos campos que en `Usuario`. */
export function toDatosPersonales(fila: ActualizarMiPerfil['Returns'][number]): DatosPersonales {
  return {
    nombre: fila.nombre,
    // '' es "sin telefono" en la base; en el dominio es null, como en toUsuario.
    telefono: normalizar(fila.telefono),
    fechaNacimiento: fechaOpcional(fila.fecha_nacimiento),
  }
}

/**
 * Fila propia de `perfiles` -> valores iniciales de «Mi perfil».
 *
 * No toma el nombre de `toUsuario`: su 'Sin nombre' es texto para pintar en un
 * listado, y como valor de un campo editable acabaria guardado en la base. Aqui
 * llega recortado y vacio si lo esta, para que la validacion pida el nombre.
 */
export function toPerfilPropio(row: PerfilRow): DatosPersonales {
  const { telefono, fechaNacimiento } = toUsuario(row)
  return { nombre: row.nombre.trim(), telefono, fechaNacimiento }
}

/** Fila de `perfiles` -> entidad de dominio. */
export function toUsuario(row: PerfilRow): Usuario {
  return {
    id: row.id,
    // `nombre` es NOT NULL en la base, asi que no se normaliza a null: se
    // recorta y, si aun asi quedara vacio —una fila escrita a mano antes de
    // 0010—, se dice en vez de pintar un hueco.
    nombre: row.nombre.trim() === '' ? 'Sin nombre' : row.nombre.trim(),
    // Los demas si: para quien lee la tabla, una cadena de espacios y "no hay
    // dato" son lo mismo, y distinguirlos obligaria a comprobar las dos cosas en
    // cada pantalla.
    email: normalizar(row.email),
    telefono: normalizar(row.telefono),
    rol: row.rol,
    // Se pasa a string porque asi viajan los ids en todo el dominio y en las
    // rutas. `?? null` cubre la base donde 0010 no se aplico: la columna no
    // existe y llega undefined.
    profesionalId: row.profesional_id != null ? String(row.profesional_id) : null,
    // `?? null`: en una base sin 0016 la columna no existe y llega undefined.
    // La forma se comprueba aunque el check de la base ya la acote, igual que
    // en auth.mapper: a la interfaz solo llega una fecha que existe.
    fechaNacimiento: fechaOpcional(row.fecha_nacimiento ?? null),
    creadoEn: row.creado_en,
  }
}

function fechaOpcional(valor: string | null): string | null {
  return valor !== null && esFechaISO(valor) ? valor : null
}

function normalizar(valor: string | null): string | null {
  if (valor === null) return null
  const limpio = valor.trim()
  return limpio === '' ? null : limpio
}
