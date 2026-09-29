import type { Tables } from '@/shared/types/supabase'
import type { Usuario } from '../domain/usuario.types'

export type PerfilRow = Tables<'perfiles'>

/** Fila de `perfiles` -> entidad de dominio. */
export function toUsuario(row: PerfilRow): Usuario {
  return {
    id: row.id,
    // Se normaliza el vacio a null: una cadena de espacios y "sin nombre" son
    // lo mismo para quien lee la tabla, y distinguirlos obligaria a cada
    // pantalla a comprobar las dos cosas.
    nombre: normalizar(row.nombre),
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
