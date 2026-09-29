/**
 * Normaliza texto para comparar: minusculas, sin tildes, sin espacios sobrantes.
 *
 * Vive aqui y no dentro de un mapper porque lo necesitan al menos dos —el de
 * servicios y el de profesionales— para cruzar la misma columna de categoria,
 * que es texto libre. Tener dos copias del mismo criterio significa que una
 * puede cambiar sin la otra y que las categorias dejen de cruzar entre modulos.
 *
 * La descomposicion NFD separa cada tilde de su letra, y el rango
 * \u0300-\u036f son esos diacriticos ya sueltos. Asi "Uñas" queda en
 * "unas" y cruza con el id del dominio.
 */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}
