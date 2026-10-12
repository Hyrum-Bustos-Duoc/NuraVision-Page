/**
 * Como se reparte el precio de una reserva entre lo que se paga ahora y lo que
 * se paga en el local.
 *
 * ----------------------------------------------------------------------------
 * POR QUE ESTO ES UNA FUNCION Y NO TRES CUENTAS EN LA PANTALLA
 * ----------------------------------------------------------------------------
 * Las mismas tres cifras aparecen en el paso de confirmacion de la reserva, en
 * el comprobante del pago y —reescritas en Deno— en la Edge Function que le dice
 * a Transbank cuanto cobrar. Si cada sitio las calculara por su cuenta, bastaria
 * un redondeo distinto para que la clienta viera "abonas $5.000" y el banco le
 * cargara otra cosa.
 *
 * La version del servidor es la que manda, porque es la unica que el navegador
 * no puede alterar. Esta existe para que la pantalla diga LO MISMO, y la regla
 * del tope esta escrita igual en los dos lados a proposito.
 */

export interface DesglosePago {
  /** Lo que cuesta el servicio, con la variante ya resuelta. */
  total: number
  /** Lo que se cobra ahora con Webpay. */
  aPagarAhora: number
  /** Lo que queda por pagar en el local. 0 si se pago todo. */
  saldo: number
  /** Si lo que se cobra es un abono y no el total. */
  esAbono: boolean
}

/**
 * Reparte el precio segun la configuracion del servicio.
 *
 * `total` es el precio ya resuelto: con variantes, el de la opcion elegida; sin
 * ellas, `precioBase`. Esta funcion no lo calcula porque quien la llama ya lo
 * sabe, y recalcularlo aqui seria una segunda fuente de verdad.
 *
 * DOS SALVAGUARDAS QUE NO SON ADORNO:
 *
 *   · EL ABONO NUNCA SUPERA EL TOTAL. Se toma el menor de los dos. El estudio
 *     configura un abono fijo por servicio, pero con variantes el total varia:
 *     un abono de $15.000 puede quedar por encima de la opcion mas barata, y
 *     cobrar mas que el precio del servicio seria cobrar de mas. Cuando eso
 *     pasa se cobra el total y deja de ser un abono, que es lo unico correcto.
 *   · UN ABONO MAL CONFIGURADO SE IGNORA. Si `montoAbono` no es un numero
 *     positivo se cobra el total. La base lo impide con un check, pero esta
 *     funcion tambien recibe datos del formulario del panel antes de guardarlos.
 */
export function desglosarPago(
  total: number,
  servicio: { cobrarAbono: boolean; montoAbono: number | null },
): DesglosePago {
  const totalValido = Number.isFinite(total) && total > 0 ? Math.round(total) : 0

  const abonoConfigurado =
    servicio.cobrarAbono &&
    typeof servicio.montoAbono === 'number' &&
    Number.isFinite(servicio.montoAbono) &&
    servicio.montoAbono > 0

  if (!abonoConfigurado) {
    return { total: totalValido, aPagarAhora: totalValido, saldo: 0, esAbono: false }
  }

  const aPagarAhora = Math.min(Math.round(servicio.montoAbono as number), totalValido)
  const saldo = totalValido - aPagarAhora

  return {
    total: totalValido,
    aPagarAhora,
    saldo,
    // Si el abono cubre el total no queda saldo, y llamarlo "abono" le diria a
    // la clienta que debe algo en el local cuando no debe nada.
    esAbono: saldo > 0,
  }
}
