import type {
  AvailabilityBreak,
  DayAvailability,
  Weekday,
  WeeklyAvailability,
} from '@/shared/types'
import type { Json, Tables, TablesInsert } from '@/shared/types/supabase'
import type { Disponibilidad } from '../domain/disponibilidad.types'

export type DisponibilidadRow = Tables<'disponibilidad'>
export type DisponibilidadInsert = TablesInsert<'disponibilidad'>

/**
 * Convencion de `dia_semana` en la base: 0 = domingo, como Date.getDay().
 *
 * Al escribir esto la tabla estaba vacia y quedo como supuesto. Ya hay datos y
 * son compatibles, aunque no lo demuestran: las 48 filas usan los dias 1..6,
 * que son lunes a sabado tanto con esta convencion como con la de ISO (1 =
 * lunes). Coinciden porque nadie atiende el domingo, que es justo el dia en que
 * las dos difieren. Si algun dia se abre el domingo y aparece un 0 o un 7, esta
 * constante es lo unico que habria que revisar.
 */
const DIA_SEMANA_BASE = 0

/** "10:00:00" -> "10:00". Postgres `time` llega con segundos. */
function aHoraCorta(valor: string): string {
  const [horas = '00', minutos = '00'] = valor.split(':')
  return `${horas.padStart(2, '0')}:${minutos.padStart(2, '0')}`
}

/** Weekday del dominio -> `dia_semana` de la base. Inverso de `aWeekday`. */
function aDiaSemana(dia: Weekday): number {
  return (dia + DIA_SEMANA_BASE) % 7
}

function aWeekday(diaSemana: number): Weekday {
  // Se normaliza contra la base declarada y se envuelve en 0..6, de modo que
  // un 7 (domingo en ISO) caiga en 0 y no en un indice inexistente.
  const normalizado = (((diaSemana - DIA_SEMANA_BASE) % 7) + 7) % 7
  return normalizado as Weekday
}

/**
 * `bloques_bloqueados` -> pausas.
 *
 * La base garantiza que es una lista (check `disponibilidad_pausas_es_lista`)
 * pero NO la forma de cada elemento: es `jsonb`, y ahi cabe cualquier cosa.
 * Cada pausa se valida una por una y las que no cuadran se descartan, en vez de
 * dejar pasar un objeto a medias que reventaria al pintar el editor.
 */
function aPausas(valor: Json): AvailabilityBreak[] {
  if (!Array.isArray(valor)) return []

  const pausas: AvailabilityBreak[] = []
  for (const item of valor) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const { id, start, end, label } = item as Record<string, unknown>
    if (typeof start !== 'string' || typeof end !== 'string') continue
    pausas.push({
      id: typeof id === 'string' ? id : `${start}-${end}`,
      start: aHoraCorta(start),
      end: aHoraCorta(end),
      label: typeof label === 'string' && label.trim() !== '' ? label : 'Pausa',
    })
  }
  return pausas
}

/** Fila de la base de datos -> entidad de dominio. */
export function toDisponibilidad(row: DisponibilidadRow): Disponibilidad {
  return {
    id: String(row.id),
    profesionalId: String(row.profesional_id),
    diaSemana: aWeekday(row.dia_semana),
    // `!== false` y no el valor directo: si 0009 todavia no esta aplicada, la
    // columna no existe y llega `undefined`. Tomarlo como falso dejaria la
    // semana entera cerrada y nadie podria reservar. Solo se cierra un dia si la
    // base lo dice explicitamente.
    activo: row.activo !== false,
    horaInicio: aHoraCorta(row.hora_inicio),
    horaFin: aHoraCorta(row.hora_fin),
    pausas: aPausas(row.bloques_bloqueados),
  }
}

function diaCerrado(): DayAvailability {
  return { enabled: false, start: '10:00', end: '19:00', breaks: [] }
}

/**
 * Bloques sueltos -> horario semanal.
 *
 * Desde 0009 hay una fila por dia y las pausas vienen en su propia columna, que
 * es el caso normal. Se sigue admitiendo el modelo de 0001 —varias filas por
 * dia, con la colacion deducida del hueco entre ellas— porque una base donde
 * 0009 aun no se aplico lo tiene asi, y porque leer el horario de otra forma
 * segun la migracion aplicada seria peor que soportar las dos.
 *
 * Un dia sin filas ACTIVAS queda cerrado. Eso cubre las dos maneras de no
 * trabajar un dia: no tener fila (0001) o tenerla con `activo = false` (0009).
 */
export function toWeeklyAvailability(bloques: Disponibilidad[]): WeeklyAvailability {
  const semana = {
    0: diaCerrado(),
    1: diaCerrado(),
    2: diaCerrado(),
    3: diaCerrado(),
    4: diaCerrado(),
    5: diaCerrado(),
    6: diaCerrado(),
  } as WeeklyAvailability

  for (let dia = 0 as Weekday; dia <= 6; dia = (dia + 1) as Weekday) {
    const delDia = bloques
      .filter((b) => b.diaSemana === dia && b.activo)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))

    if (delDia.length === 0) continue

    const primero = delDia[0]
    const ultimo = delDia[delDia.length - 1]

    const pausas = delDia.slice(0, -1).flatMap((bloque, i) => {
      const siguiente = delDia[i + 1]
      if (bloque.horaFin >= siguiente.horaInicio) return []
      return [
        {
          id: `${bloque.id}-pausa`,
          start: bloque.horaFin,
          end: siguiente.horaInicio,
          label: 'Colación',
        },
      ]
    })

    semana[dia] = {
      enabled: true,
      start: primero.horaInicio,
      end: ultimo.horaFin,
      // Las guardadas van primero porque son las que la profesional escribio;
      // las deducidas de los huecos solo existen en datos previos a 0009.
      breaks: [...delDia.flatMap((b) => b.pausas), ...pausas],
    }
  }

  return semana
}

/**
 * Horario semanal -> filas para la base.
 *
 * Devuelve SIEMPRE las siete, tambien las de los dias cerrados. Es lo que
 * permite guardar con un UPSERT sobre (profesional_id, dia_semana): un dia que
 * se cierra conserva su fila con `activo = false` y sus horas intactas, de modo
 * que al volver a abrirlo reaparece como estaba. Borrar la fila perderia esa
 * configuracion y dejaria el dia indistinguible de uno nunca configurado.
 *
 * No se envia `id`: la clave la resuelve el UPSERT por el conflicto de
 * (profesional_id, dia_semana), asi que esta funcion no necesita saber si la
 * fila ya existia.
 */
export function fromWeeklyAvailability(
  profesionalId: string,
  semana: WeeklyAvailability,
): DisponibilidadInsert[] {
  const filas: DisponibilidadInsert[] = []

  for (let dia = 0 as Weekday; dia <= 6; dia = (dia + 1) as Weekday) {
    const jornada = semana[dia]

    // La base exige `hora_fin > hora_inicio` incluso en un dia cerrado, donde
    // esas horas no significan nada. Un rango invertido en un dia abierto no
    // llega hasta aqui: lo detiene antes `motivoParaNoGuardar`. Este respaldo es
    // para el dia cerrado, que nadie valida y que de otro modo haria fallar el
    // guardado completo por una hora que no se usa.
    const rangoValido = jornada.end > jornada.start
    const horaInicio = rangoValido ? jornada.start : '10:00'
    const horaFin = rangoValido ? jornada.end : '19:00'

    filas.push({
      profesional_id: Number(profesionalId),
      dia_semana: aDiaSemana(dia),
      activo: jornada.enabled,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      bloques_bloqueados: jornada.breaks.map((pausa) => ({
        id: pausa.id,
        start: pausa.start,
        end: pausa.end,
        label: pausa.label,
      })),
    })
  }

  return filas
}
