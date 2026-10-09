# Proposal

## Why

Hoy cualquier hora de uñas se puede tomar sin compromiso previo: el flujo de
reserva termina en «Confirmar» y la reserva queda creada sin que la clienta
adelante nada. El dueño del estudio pidió el 2026-10-08 que **todos los
servicios de uñas exijan un abono** para poder reservarse, pagado al final del
flujo, antes de que la reserva exista.

Hay que poder saber despues cuanto se abonó en cada reserva, aunque el estudio
cambie el abono del servicio más adelante. Hoy `reservas` no guarda precio ni
nada parecido (ver 0011): sin una copia en la fila, el historial mostraría el
abono vigente y no el del día de la reserva.

## What Changes

- Cada servicio tiene un **abono en CLP** (entero, 0 = sin abono) que el
  personal edita en el formulario de servicios del panel.
- Los servicios de uñas **no se pueden guardar con abono 0** desde el panel.
- La migración deja con abono a los servicios de uñas existentes: 30 % del
  precio «desde», redondeado al millar.
- El flujo de reserva suma un paso **«Abono»** después de «Confirmar» cuando el
  servicio tiene abono > 0. Es un **pago simulado**: formulario de tarjeta de
  demostración que siempre aprueba; no se cobra nada y los datos de tarjeta no
  salen de la memoria del navegador. La reserva se crea al aprobar ese pago.
- La base copia el abono del servicio en la reserva al insertarla (no confía en
  el valor que envíe el navegador) y esa copia no se puede editar después.
- El abono se muestra en el paso de pago, en la pantalla de reserva creada, en
  «Mis reservas», en el detalle de la reserva y en el panel de reservas del
  estudio. Cancelar o reprogramar no lo modifica.

## Decisiones del dueño (2026-10-08, no se reabren en este cambio)

1. **Pago simulado.** No hay pasarela real; Webpay tampoco está integrado en la
   tienda (`NOTA_PAGO` en `Checkout.tsx`).
   *Descartado:* transferencia con confirmación manual del personal, y aviso
   solo informativo sin paso de pago.
2. **Monto configurable por servicio** desde el panel.
   *Descartado:* porcentaje global y monto fijo global.

## Capabilities

### New Capabilities
- `abono-reservas`: abono por servicio, paso de pago simulado en la reserva,
  registro inmutable del abono en la reserva y su visualización.

### Modified Capabilities
<!-- openspec/specs/ está vacío: no hay specs previas que modificar. -->

## Impact

- Base: migración nueva (siguiente número tras `0014`). Agrega
  `servicios.abono` y `reservas.abono`, un trigger `before insert` en
  `reservas` y el relleno inicial de los servicios de uñas. Aditiva: no borra ni
  reescribe columnas existentes; las reservas previas quedan con abono 0.
- Tipos: `servicios` y `reservas` en `frontend/src/shared/types/supabase.ts`.
- Frontend: dominio y mapper de `servicios`, formulario de servicios del panel,
  flujo de reserva, «Mis reservas», detalle de reserva y panel de reservas del
  estudio.
- Sin dependencias nuevas. Sin servicio Python.
