import { diasEntre, fechaDesdePartes, partesISO } from '@/shared/lib/calendario'

/** Ventana del filtro «Próximos cumpleaños», hoy incluido. Fija a proposito (design.md). */
export const VENTANA_CUMPLEANOS_DIAS = 30

/**
 * Dias que faltan para el proximo cumpleaños; 0 si es hoy.
 *
 * `hoy` es la fecha local del navegador ('YYYY-MM-DD'), nunca la UTC. El 29 de
 * febrero se celebra el 28 en los años no bisiestos: `fechaDesdePartes` deja el
 * dia dentro de su mes, que es exactamente esa regla.
 */
export function diasHastaCumpleanos(fechaNacimiento: string, hoy: string): number {
  const { mes, dia } = partesISO(fechaNacimiento)
  const { anio } = partesISO(hoy)
  const esteAnio = fechaDesdePartes(anio, mes, dia)
  const candidato = esteAnio >= hoy ? esteAnio : fechaDesdePartes(anio + 1, mes, dia)
  return diasEntre(hoy, candidato)
}

/** «Hoy», «Mañana» o «en N días». */
export function etiquetaDiasRestantes(dias: number): string {
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  return `en ${dias} días`
}

/**
 * Cuentas que cumplen dentro de la ventana, de la mas cercana a la mas lejana.
 * Las que no declararon fecha quedan fuera. A igualdad de dias se conserva el
 * orden de entrada (`sort` es estable), que es el orden del panel.
 */
export function proximosCumpleanos<T extends { fechaNacimiento: string | null }>(
  cuentas: T[],
  hoy: string,
): { cuenta: T; dias: number }[] {
  return cuentas
    .flatMap((cuenta) =>
      cuenta.fechaNacimiento === null
        ? []
        : [{ cuenta, dias: diasHastaCumpleanos(cuenta.fechaNacimiento, hoy) }],
    )
    .filter(({ dias }) => dias <= VENTANA_CUMPLEANOS_DIAS)
    .sort((a, b) => a.dias - b.dias)
}
