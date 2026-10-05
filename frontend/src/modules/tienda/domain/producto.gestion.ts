import { esCategoria } from './categorias'
import type { DatosProducto, InsigniaProducto } from './producto.types'

/** El mismo formato que el check `productos_slug_formato` de 0013. */
export const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const INSIGNIAS: InsigniaProducto[] = ['mas_vendido', 'nuevo', 'kit']

/** Tope de prudencia: un precio sobre esto casi seguro es un cero de mas. */
export const PRECIO_MAXIMO = 10_000_000

/**
 * Nombre -> slug para la URL: "Sérum Capilar Nº 2" -> "serum-capilar-n-2".
 *
 * Es la misma idea que el backfill de 0013, sin el sufijo con el id: aqui el
 * producto todavia no tiene id, y un slug repetido lo rechaza el indice unico.
 */
export function slugDesdeNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const esEnteroNoNegativo = (n: number) => Number.isInteger(n) && n >= 0

/**
 * Motivo por el que no se puede guardar el producto, o `null` si se puede.
 *
 * Repite los checks de 0013 para avisar antes de ir a la base y con un mensaje
 * que se entienda. La base los vuelve a aplicar: esto es ayuda, no seguridad.
 */
export function motivoParaNoGuardarProducto(datos: DatosProducto): string | null {
  if (!datos.nombre.trim()) return 'El nombre es obligatorio.'
  if (datos.nombre.trim().length > 120) return 'El nombre no puede pasar de 120 caracteres.'
  if (!FORMATO_SLUG.test(datos.slug)) {
    return 'La URL solo admite minúsculas, números y guiones simples (ej: aceite-de-cuticula).'
  }
  if (!esCategoria(datos.categoria)) return 'Elige una categoría.'
  if (!Number.isInteger(datos.precio) || datos.precio <= 0) {
    return 'El precio debe ser un número entero mayor a 0 (pesos, sin decimales).'
  }
  if (datos.precio > PRECIO_MAXIMO) return 'El precio parece demasiado alto. Revisa los ceros.'
  if (datos.precioAnterior !== null) {
    if (!Number.isInteger(datos.precioAnterior) || datos.precioAnterior <= datos.precio) {
      return 'El precio anterior debe ser mayor que el precio actual, o quedar vacío.'
    }
  }
  if (datos.stock !== null && !esEnteroNoNegativo(datos.stock)) {
    return 'El stock debe ser un número entero de 0 o más, o quedar vacío (sin control).'
  }
  if (!Number.isInteger(datos.orden)) return 'El orden debe ser un número entero.'
  if (datos.insignia !== null && !INSIGNIAS.includes(datos.insignia)) {
    return 'La insignia no es válida.'
  }
  return null
}
