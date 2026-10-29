import { esFechaISO, fechaDesdePartes, partesISO, sumarDias, sumarMeses } from '@/shared/lib/calendario'
import type { Indicadores, RangoFechas } from './indicadores.types'

/**
 * Reglas de los indicadores del panel que NO calcula la base.
 *
 * Todas reciben "hoy" como texto 'YYYY-MM-DD' y nunca leen el reloj: quien
 * llama lo obtiene con `hoyEnElEstudio()`, que es el dia de Chile sea cual sea
 * la zona del dispositivo. Con `new Date('YYYY-MM-DD')` o `toISOString()`, en
 * Chile los rangos se correrian un dia despues de las 21:00.
 */

/** Periodos predefinidos de la analitica. Todos terminan hoy. */
export type PresetRango = '30d' | '3m' | '6m' | 'anio'

export function rangoDelPreset(preset: PresetRango, hoy: string): RangoFechas {
  switch (preset) {
    case '30d':
      return { desde: sumarDias(hoy, -30), hasta: hoy }
    case '3m':
      return { desde: sumarMeses(hoy, -3), hasta: hoy }
    case '6m':
      return { desde: sumarMeses(hoy, -6), hasta: hoy }
    case 'anio':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }
  }
}

/**
 * Los 7 meses que terminan en el mes de hoy, completos.
 *
 * Incluye los dias que faltan del mes en curso: las reservas futuras ya
 * agendadas son parte de "las reservas del mes".
 */
export function rangoDelDashboard(hoy: string): RangoFechas {
  const { anio, mes } = partesISO(hoy)
  return {
    desde: fechaDesdePartes(anio, mes - 6, 1),
    // El 31 se ajusta al ultimo dia del mes (30, 28 o 29).
    hasta: fechaDesdePartes(anio, mes, 31),
  }
}

/**
 * Por que el rango no se puede consultar, o `null` si se puede.
 *
 * Un campo de fecha vaciado llega como cadena vacia: sin esta comprobacion se
 * mandaria a la base y volveria un error de formato en vez de un aviso.
 */
export function problemaDelRango(rango: RangoFechas): string | null {
  if (!esFechaISO(rango.desde) || !esFechaISO(rango.hasta)) return 'Completa las dos fechas.'
  if (rango.desde > rango.hasta) return 'La fecha inicial debe ser anterior a la final.'
  return null
}

/** Porcentaje de canceladas; 0 si no hubo reservas, en vez de NaN. */
export function tasaCancelacion(canceladas: number, total: number): number {
  return total === 0 ? 0 : (canceladas / total) * 100
}

export interface ResumenDashboard {
  reservasDelMes: number
  tasaCancelacionMes: number
  /** Las de hoy que no se cancelaron. */
  reservasHoy: number
  /** Las de hoy pendientes o confirmadas: las que todavia hay que atender. */
  porAtenderHoy: number
  clientasRegistradas: number
  evolucion: Indicadores['porMes']
  topServicios: Indicadores['porServicio']
}

/**
 * Cifras del Dashboard a partir de sus dos lecturas: la de los 7 meses
 * (`rangoDelDashboard`) y la del dia de hoy.
 */
export function resumirDashboard(
  sieteMeses: Indicadores,
  delDia: Indicadores,
  hoy: string,
): ResumenDashboard {
  // Se busca el mes por su clave y no se toma el ultimo elemento: asi la cifra
  // no depende del orden en que la base entregue los meses. El respaldo en 0
  // solo aplica si se llamara con un rango que no contiene hoy.
  const mes = sieteMeses.porMes.find((m) => m.mes === hoy.slice(0, 7)) ?? {
    mes: hoy.slice(0, 7),
    reservas: 0,
    canceladas: 0,
  }

  return {
    reservasDelMes: mes.reservas,
    tasaCancelacionMes: tasaCancelacion(mes.canceladas, mes.reservas),
    reservasHoy: delDia.reservas - delDia.porEstado.cancelada,
    porAtenderHoy: delDia.porEstado.pendiente + delDia.porEstado.confirmada,
    clientasRegistradas: sieteMeses.clientasRegistradas,
    evolucion: sieteMeses.porMes,
    topServicios: sieteMeses.porServicio.slice(0, 5),
  }
}
