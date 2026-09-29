import type { ServiceCategoryId } from '@/shared/types'
import type { Tables, TablesInsert } from '@/shared/types/supabase'
import { serviceCategories } from '@/modules/servicios/domain/serviceCategories'
import { normalizarTexto } from '@/shared/lib/texto'
import type { DatosProfesional, Profesional } from '../domain/profesional.types'

export type ProfesionalRow = Tables<'profesionales'>
export type ProfesionalInsert = TablesInsert<'profesionales'>

/**
 * Texto libre de la columna -> categoria del dominio, o `null`.
 *
 * A diferencia de `servicios`, aqui NO hay valor por defecto. Una categoria que
 * no se reconoce se deja en `null` en vez de asignarle una: en `servicios` el
 * peor efecto es un filtro descolocado, pero esto decide en que area del sitio
 * aparece una persona, y colocarla donde no trabaja es peor que no colocarla.
 */
function toCategoria(valor: string | null): ServiceCategoryId | null {
  if (!valor) return null
  const normalizada = normalizarTexto(valor)
  const encontrada = serviceCategories.find((c) => c.id === normalizada)
  return encontrada ? encontrada.id : null
}

/** Fila de la base de datos -> entidad de dominio. */
export function toProfesional(row: ProfesionalRow): Profesional {
  return {
    id: String(row.id),
    nombre: row.nombre,
    especialidad: row.especialidad,
    // Se normaliza la cadena vacia a null: para la vista son el mismo caso
    // (no hay foto) y asi no hay que comprobar los dos.
    avatarUrl: row.avatar_url?.trim() ? row.avatar_url : null,
    activo: row.activo,
    // `?? 0` y `?? null` cubren la base donde 0010 todavia no se aplico: las
    // columnas no existen, llegan como undefined, y sin esto la ficha publica
    // mostraria "undefined años de experiencia".
    experienciaAnios: row.experiencia_anios ?? 0,
    biografia: row.biografia?.trim() ? row.biografia : null,
    categoria: toCategoria(row.categoria ?? null),
  }
}

/**
 * Datos del panel -> fila para la base.
 *
 * `servicioIds` NO aparece: no es una columna de esta tabla sino filas de
 * `profesional_servicios`, y el repositorio las escribe aparte.
 *
 * La categoria se guarda con el id canonico del dominio ('unas', 'cabello'…) y
 * no con su etiqueta visible, de modo que el viaje de vuelta por `toCategoria`
 * sea exacto.
 */
export function fromDatosProfesional(datos: DatosProfesional): ProfesionalInsert {
  return {
    nombre: datos.nombre.trim(),
    especialidad: datos.especialidad.trim(),
    // null y no cadena vacia, para que no haya dos formas de decir "sin foto".
    avatar_url: datos.avatarUrl?.trim() ? datos.avatarUrl.trim() : null,
    activo: datos.activo,
    experiencia_anios: datos.experienciaAnios,
    biografia: datos.biografia?.trim() ? datos.biografia.trim() : null,
    categoria: datos.categoria,
  }
}
