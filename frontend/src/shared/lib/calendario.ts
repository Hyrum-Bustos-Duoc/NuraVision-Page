import { formatWeekdayLong, parseISODate, toISODate } from './format'

/**
 * Aritmetica de fechas de calendario para el selector de fecha.
 *
 * Todo trabaja con textos 'YYYY-MM-DD' y, cuando hace falta un `Date`, con el
 * constructor local `new Date(anio, mes, dia)` de `parseISODate`. Nunca con
 * `new Date('1990-03-04')`: ese formato se interpreta como medianoche UTC, y en
 * Chile (UTC-3/-4) se convierte en el dia 3 a las 21:00. Una fecha de
 * nacimiento no tiene hora ni zona, asi que se mantiene asi de principio a fin.
 */

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** `true` si el texto es una fecha 'YYYY-MM-DD' que existe (rechaza 1990-02-30). */
export function esFechaISO(valor: string): boolean {
  if (!FORMATO_ISO.test(valor)) return false
  return toISODate(parseISODate(valor)) === valor
}

/** Hoy en la zona horaria de quien usa la pagina, no en UTC. */
export function hoyISO(ahora: Date = new Date()): string {
  return toISODate(ahora)
}

const PARTES_EN_EL_ESTUDIO = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Hoy en Chile, sea cual sea la zona del dispositivo.
 *
 * Distinto de `hoyISO` a proposito: una fecha de nacimiento se valida contra el
 * calendario de quien la escribe, pero la agenda es la del estudio. Una
 * profesional con el telefono en otra zona (de viaje, o con la zona mal
 * configurada) tiene que ver como "hoy" el dia en que el estudio atiende.
 */
export function hoyEnElEstudio(ahora: Date = new Date()): string {
  const partes = PARTES_EN_EL_ESTUDIO.formatToParts(ahora)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

export function partesISO(iso: string): { anio: number; mes: number; dia: number } {
  const fecha = parseISODate(iso)
  return { anio: fecha.getFullYear(), mes: fecha.getMonth(), dia: fecha.getDate() }
}

function diasDelMes(anio: number, mes: number): number {
  // El dia 0 del mes siguiente es el ultimo de este.
  return new Date(anio, mes + 1, 0).getDate()
}

/**
 * Fecha a partir de sus partes. Si el dia no cabe en el mes (31 de febrero),
 * se queda en el ultimo dia del mes en vez de desbordar al siguiente como hace
 * `Date`: al cambiar de mes o de año, la persona espera seguir en ese mes.
 */
export function fechaDesdePartes(anio: number, mes: number, dia: number): string {
  const anioReal = anio + Math.floor(mes / 12)
  const mesReal = ((mes % 12) + 12) % 12
  return toISODate(new Date(anioReal, mesReal, Math.min(dia, diasDelMes(anioReal, mesReal))))
}

export function sumarDias(iso: string, dias: number): string {
  const { anio, mes, dia } = partesISO(iso)
  return toISODate(new Date(anio, mes, dia + dias))
}

export function sumarMeses(iso: string, meses: number): string {
  const { anio, mes, dia } = partesISO(iso)
  return fechaDesdePartes(anio, mes + meses, dia)
}

/**
 * Dias de calendario de `desde` a `hasta` (negativo si `hasta` es anterior).
 *
 * Se cuentan sobre `Date.UTC` de las partes, no sobre la hora local: en Chile
 * el dia del cambio de horario dura 23 o 25 horas, y dividir milisegundos
 * locales por 86 400 000 daria un dia de mas o de menos. En UTC todos los dias
 * duran lo mismo, y aqui solo representan fechas, no instantes.
 */
export function diasEntre(desde: string, hasta: string): number {
  const a = partesISO(desde)
  const b = partesISO(hasta)
  return Math.round((Date.UTC(b.anio, b.mes, b.dia) - Date.UTC(a.anio, a.mes, a.dia)) / 86_400_000)
}

/** Los textos ISO ordenan igual que las fechas, por eso se comparan tal cual. */
export function limitarFecha(iso: string, minimo: string, maximo: string): string {
  if (iso < minimo) return minimo
  if (iso > maximo) return maximo
  return iso
}

/** Dia de la semana con el lunes como 0, que es como se lee el calendario en Chile. */
function diaSemanaLunesPrimero(iso: string): number {
  return (parseISODate(iso).getDay() + 6) % 7
}

export interface CeldaDia {
  iso: string
  dia: number
}

/**
 * Grilla del mes: semanas de lunes a domingo, con `null` en los huecos.
 *
 * Siempre son seis semanas, aunque el mes quepa en cuatro o cinco. Asi el
 * selector no cambia de alto al pasar de mes y los botones de navegacion no
 * saltan bajo el puntero de quien esta haciendo clic seguido.
 */
export function semanasDelMes(anio: number, mes: number): (CeldaDia | null)[][] {
  const inicio = diaSemanaLunesPrimero(fechaDesdePartes(anio, mes, 1))
  const total = diasDelMes(anio, mes)

  return Array.from({ length: 6 }, (_, semana) =>
    Array.from({ length: 7 }, (_, columna) => {
      const dia = semana * 7 + columna - inicio + 1
      if (dia < 1 || dia > total) return null
      return { iso: fechaDesdePartes(anio, mes, dia), dia }
    }),
  )
}

/** Lunes de la semana de la fecha. */
export function inicioDeSemana(iso: string): string {
  return sumarDias(iso, -diaSemanaLunesPrimero(iso))
}

/** "jueves 8 de octubre de 2026": lo que lee un lector de pantalla en cada dia. */
export function fechaLegible(iso: string): string {
  return `${formatWeekdayLong(iso)} de ${partesISO(iso).anio}`
}
