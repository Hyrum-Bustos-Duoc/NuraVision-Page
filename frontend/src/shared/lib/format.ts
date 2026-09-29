const currencyFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

export function formatPrice(value: number): string {
  return currencyFormatter.format(value)
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatLongDate(iso: string): string {
  const date = parseISODate(iso)
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}, ${date.getFullYear()}`
}

export function formatDayMonthShort(iso: string): { day: number; month: string } {
  const date = parseISODate(iso)
  return { day: date.getDate(), month: MONTHS_SHORT[date.getMonth()] }
}

export function formatWeekdayLong(iso: string): string {
  const date = parseISODate(iso)
  const weekdays = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
  ]
  return `${weekdays[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]}`
}

export function getWeekDates(iso: string): string[] {
  const date = parseISODate(iso)
  const weekday = (date.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(date)
  monday.setDate(date.getDate() - weekday)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISODate(d)
  })
}

export function monthLabel(year: number, month: number): string {
  const capitalized = MONTHS[month][0].toUpperCase() + MONTHS[month].slice(1)
  return `${capitalized} ${year}`
}

/**
 * Iniciales para un avatar, a partir de un nombre.
 *
 * Los datos de ejemplo traian las iniciales ya escritas ('CR' para «Camila
 * Reyes»), pero la tabla `profesionales` solo guarda el nombre, y ademas lo
 * guarda en una sola palabra: «Berenice», «Nicol». De ahi las dos ramas.
 *
 *   'Camila Reyes' -> 'CR'      (dos palabras: una letra de cada una)
 *   'Berenice'     -> 'BE'      (una sola: sus dos primeras letras)
 *
 * Devuelve cadena vacia si no hay nada aprovechable, en vez de un placeholder:
 * un circulo vacio se lee mejor que una interrogacion.
 */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export { WEEKDAYS_SHORT, MONTHS_SHORT }
