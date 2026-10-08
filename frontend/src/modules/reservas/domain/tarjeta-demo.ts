/**
 * Tarjeta del pago de demostracion del abono (abono-servicios-unas, decision 8).
 *
 * No hay pasarela: con datos bien formados el pago se aprueba siempre. Sin Luhn
 * ni rechazos simulados, porque nadie los pidio. Estos datos viven solo en el
 * estado del componente del paso «Abono»: no van al borrador de la reserva, ni
 * al almacenamiento del navegador, ni a ninguna peticion.
 */
export interface DatosTarjeta {
  titular: string
  /** 16 digitos; se aceptan espacios entre grupos. */
  numero: string
  /** "MM/AA" */
  vencimiento: string
  cvv: string
}

export type ErroresTarjeta = Partial<Record<keyof DatosTarjeta, string>>

const VENCIMIENTO = /^(\d{2})\/(\d{2})$/

/**
 * Errores por campo; objeto vacio si la tarjeta es valida.
 *
 * `hoy` se recibe para que la regla del vencimiento se pueda probar con una
 * fecha fija. Vale hasta el ultimo dia del mes impreso, asi que el mes en curso
 * todavia es valido.
 */
export function erroresDeTarjeta(tarjeta: DatosTarjeta, hoy: Date): ErroresTarjeta {
  const errores: ErroresTarjeta = {}

  if (tarjeta.titular.trim() === '') {
    errores.titular = 'Escribe el nombre como aparece en la tarjeta.'
  }

  if (!/^\d{16}$/.test(tarjeta.numero.replace(/ /g, ''))) {
    errores.numero = 'El número de tarjeta debe tener 16 dígitos.'
  }

  const partes = VENCIMIENTO.exec(tarjeta.vencimiento.trim())
  if (!partes) {
    errores.vencimiento = 'Usa el formato MM/AA.'
  } else {
    const mes = Number(partes[1])
    const anio = 2000 + Number(partes[2])
    if (mes < 1 || mes > 12) {
      errores.vencimiento = 'El mes debe estar entre 01 y 12.'
    } else if (anio * 12 + mes < hoy.getFullYear() * 12 + (hoy.getMonth() + 1)) {
      errores.vencimiento = 'La tarjeta está vencida.'
    }
  }

  if (!/^\d{3}$/.test(tarjeta.cvv)) {
    errores.cvv = 'El CVV tiene 3 dígitos.'
  }

  return errores
}

/** Lo que se escribe en el numero -> "4242 4242 4242 4242". Solo digitos, maximo 16. */
export function formatearNumeroTarjeta(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 16)
  return digitos.replace(/(\d{4})(?=\d)/g, '$1 ')
}

/**
 * Lo que se escribe en el vencimiento -> "MM/AA".
 *
 * La barra se pone sola al pasar del mes, pero no antes: si se agregara con
 * dos digitos, borrar hacia atras desde "10/" volveria a poner la barra y el
 * campo pareceria trabado.
 */
export function formatearVencimiento(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 4)
  return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos
}
