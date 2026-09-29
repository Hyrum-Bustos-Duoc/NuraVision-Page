import type { Tables } from '@/shared/types/supabase'
import type { Usuario } from '../domain/usuario.types'

export type PerfilRow = Tables<'perfiles'>

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
    creadoEn: row.creado_en,
  }
}

function normalizar(valor: string | null): string | null {
  if (valor === null) return null
  const limpio = valor.trim()
  return limpio === '' ? null : limpio
}
