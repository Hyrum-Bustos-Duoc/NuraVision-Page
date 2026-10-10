/**
 * Politica del abono que se muestra en el paso de pago, en el detalle y en
 * «Mis reservas». Una sola copia para que las tres pantallas no se contradigan.
 *
 * La fijo el dueño el 2026-10-08 (pregunta abierta 1 de abono-servicios-unas):
 * no reembolsable con menos de 24 h. El mismo plazo aparece en Nuria
 * (`nuria.motor.ts`), en el detalle de la reserva y en la ficha del servicio;
 * si cambia, cambia en todos. Es solo texto: la app no aplica el plazo.
 */
export const POLITICA_ABONO =
  'El abono se descuenta del total el día de tu cita. Si reprogramas, se mantiene. ' +
  'Si cancelas con al menos 24 horas de anticipación, coordinamos su devolución; ' +
  'con menos de 24 horas, no es reembolsable.'
