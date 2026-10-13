# Proposal

## Why

Hoy el abono de una reserva no se cobra: el paso «Abono» de
`abono-reservas` es un formulario de demostración que siempre aprueba. El
estudio no recibe dinero y la reserva de uñas sigue sin compromiso real.

El PR #28 de Oscar Cubillos (abierto el 2026-10-09) integra Webpay Plus real
para reservas y pedidos de la tienda. La revisión del 2026-10-09 encontró un
fallo crítico: el monto de una reserva se leía de
`reservas.detalles_extra.variante.precio`, que escribe el navegador. Cualquiera
podía insertar la reserva con `precio: 1` y pagar $1 por un servicio de
$38.000. Además el PR traía su propio modelo de abono
(`servicios.cobrar_abono` + `monto_abono`) que duplica el de `abono-reservas`
(`servicios.abono`, 0015) y contradice su regla de negocio.

Lo que no puede hacer hoy la clienta: pagar de verdad el abono (o el total) de
su reserva. Lo que no puede garantizar hoy el estudio: que lo cobrado sea el
precio del servicio y no uno elegido por el navegador.

## What Changes

- **El precio de la reserva lo fija la base.** Al insertar, la base reescribe
  `detalles_extra.variante` desde `servicios.variantes` usando solo el
  `opcionId` enviado; rechaza la reserva si el servicio tiene variantes y la
  opción falta o no existe. `reservas.abono` pasa a ser
  `least(servicios.abono, precio efectivo)`.
- **Cobro real con Webpay Plus**, sustituyendo el pago simulado:
  - `abono > 0`: se cobra el abono por Webpay, obligatorio; no hay opción de
    pagar en el estudio.
  - `abono = 0`: la clienta elige pagar el total por Webpay o pagar en el
    estudio.
- **Tabla `pagos`** (renumerada a 0018): FKs `on delete restrict` y como máximo
  un pago autorizado por reserva o pedido, garantizado por la base.
- **Confirmación a prueba de recargas, carreras y caídas de Transbank**
  (ver `specs/pagos-webpay`).
- **Comprobante** con un contrato único para reservas y pedidos.

## Decisiones del dueño (Hyrum Bustos, 2026-10-11)

1. Se conserva el modelo de abono de `abono-reservas`: `servicios.abono`,
   `reservas.abono` fijado por trigger, 0 = sin abono, obligatorio en uñas.
2. `abono > 0` ⇒ Webpay obligatorio. `abono = 0` ⇒ Webpay por el total o pago
   en el estudio.
3. El precio lo fija un trigger `BEFORE INSERT` en la base.
4. `pagos` pasa a 0018; el trigger de precio es 0019.

## Alternativas descartadas

- **`servicios.cobrar_abono` / `monto_abono` (PR #28).** Dos columnas que
  significan lo mismo que `servicios.abono`; con dos fuentes, el panel y el
  cobro acabarían leyendo valores distintos. El interruptor opcional además
  contradice la regla del dueño del 2026-10-08: las uñas exigen abono, no
  «pueden exigirlo». Se descarta la migración `0016_reserva_abono.sql` del PR.
- **Calcular el precio solo en la Edge Function.** Cerraría el cobro de $1,
  pero `detalles_extra.variante.precio` seguiría siendo lo que escribió el
  navegador, y el panel, «Mis reservas» y el saldo mostrarían el precio
  manipulado. La base es el único sitio que todas las lecturas comparten.
- **Rechazar en la base un precio distinto del catálogo** (en vez de
  reescribirlo). Obligaría a que el navegador conozca el precio exacto vigente;
  si el estudio cambia el precio mientras la clienta reserva, la reserva falla
  sin que ella haya hecho nada mal. Reescribir es igual de seguro y no tiene
  esa carrera.
- **Mantener el pago simulado junto a Webpay.** Un camino que aprueba siempre
  es un camino para no pagar.
- **Permitir pagar en el estudio con abono > 0.** Anula el propósito del abono.

## Capabilities

### New Capabilities
- `pagos-webpay`: iniciar, confirmar y comprobar un pago Webpay Plus de una
  reserva o un pedido.

### Modified Capabilities
- `abono-reservas`: el abono se cobra por Webpay; el precio y el abono los fija
  la base; desaparece el pago simulado.

## Impact

- Base: 0018 (`pagos`) y 0019 (trigger de precio). Se retiran
  `0015_pagos_webpay.sql` y `0016_reserva_abono.sql` del PR #28, que además
  chocaban en número con `0015_abono_servicios.sql` y
  `0016_cumpleanos_perfiles.sql`.
- Edge Functions: `webpay-crear-transaccion`, `webpay-confirmar-transaccion`,
  `webpay-retorno`.
- Tipos: `pagos`; `servicios` sin `cobrar_abono`/`monto_abono`.
- Frontend: flujo de reserva (paso de pago), pantalla de confirmación del pago.
  El checkout de la tienda ya tiene la elección Webpay / estudio y se reutiliza
  como referencia visual.
- Sin dependencias nuevas. Sin servicio Python.
