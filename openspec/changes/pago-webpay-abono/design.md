# Design

## Context

- `reservas` se inserta desde el navegador (anon y authenticated). Hasta este
  cambio, `detalles_extra.variante` (0011) era una copia escrita por el cliente,
  sin verificar contra `servicios.variantes`.
- `reservas.abono` lo fija el trigger de 0015 (`abono-reservas`) como copia de
  `servicios.abono`.
- Webpay Plus son dos llamadas separadas por la visita de la clienta a
  Transbank: crear transacción (devuelve `token` + `url`) y confirmar (`commit`)
  con el `token_ws` que vuelve en la URL de retorno. Al abandonar, Transbank
  vuelve con `TBK_TOKEN`, `TBK_ORDEN_COMPRA` y `TBK_ID_SESION`, sin `token_ws`.
- `pagos.reserva_id` es FK: la reserva tiene que existir antes de iniciar el
  cobro. Se inserta en estado `pendiente` y pasa a `confirmada` al autorizarse
  el pago.
- El checkout de la tienda (`pedidos`) ya ofrece Webpay / pagar en el estudio;
  el flujo de reserva reutiliza ese patrón de elección.

## Contrato de datos

Montos en CLP enteros.

### SQL

```sql
-- 0019 · reservas, BEFORE INSERT: un solo trigger (reemplaza el de abono de 0015)
-- Si servicios.variantes es null:
--   si viene detalles_extra.variante, se quita (no se rechaza el insert).
--   precio efectivo = round(servicios.precio_base)
-- Si servicios.variantes no es null:
--   se busca la opción con id = detalles_extra.variante.opcionId;
--   si falta o no existe, se rechaza el insert.
--   detalles_extra.variante := { pregunta, opcionId, etiqueta, precio }
--     copiados de servicios.variantes (se ignora lo enviado salvo opcionId).
--   precio efectivo = esa opción.precio
-- reservas.abono := least(servicios.abono, precio efectivo)

-- 0018 · pagos (sustituye a 0015_pagos_webpay y 0016_reserva_abono del PR #28)
pedido_id  bigint references pedidos  (id) on delete restrict
reserva_id bigint references reservas (id) on delete restrict
monto       integer not null check (monto > 0)   -- lo cobrado en este intento
monto_total integer                               -- precio efectivo si monto < precio; null si se cobra el total
estado      estado_pago                           -- iniciado|autorizado|rechazado|anulado|error
-- unique parcial: un solo 'autorizado' por reserva_id y otro por pedido_id
-- sin INSERT/UPDATE/DELETE para anon ni authenticated; SELECT solo es_staff
```

`servicios.cobrar_abono` y `servicios.monto_abono` **no existen**.

### Monto a cobrar (lo decide la Edge Function leyendo la base)

| Caso | `monto` | `monto_total` |
|---|---|---|
| reserva, `abono > 0` y `abono < precio` | `reservas.abono` | precio efectivo |
| reserva, `abono > 0` y `abono = precio` | `reservas.abono` | null |
| reserva, `abono = 0`, elige Webpay | precio efectivo | null |
| pedido | total del pedido | null |

Precio efectivo de una reserva ya insertada =
`detalles_extra.variante.precio` si existe, o `servicios.precio_base`. Tras 0019
ambos son datos de la base, no del navegador.

### Comprobante (respuesta de `webpay-confirmar-transaccion`)

```ts
type Comprobante = {
  estado: 'iniciado' | 'autorizado' | 'rechazado' | 'anulado' | 'error'
  aprobado: boolean            // estado === 'autorizado'
  ordenCompra: string
  codigo: string | null        // código de reserva/pedido; null en confirmaciones repetidas
  monto: number                // cobrado en este pago
  montoTotal: number | null    // precio efectivo; null si se cobró el total
  saldo: number | null         // montoTotal - monto; null si montoTotal es null
  codigoAutorizacion: string | null
  tipoPago: string | null
  cuotas: number | null
  tarjetaFinal: string | null  // como máximo 4 dígitos
  tipo: 'pedido' | 'reserva'
  motivo?: string              // texto para la clienta si no se aprobó
  repetida?: true              // el token ya se había confirmado antes
  procesando?: true            // otra confirmación del mismo token está en curso
}
```

No hay Pydantic: `services/api/` no existe.

## Decisions

1. **Reescribir la variante, no validarla.** Ver alternativas en
   `proposal.md`. El único dato del cliente que se usa es `opcionId`.
2. **`reservas.abono = least(servicios.abono, precio efectivo)`.** El panel ya
   impide `abono > precioDesde`, pero el estudio puede bajar el precio de una
   opción después. Sin el `least`, se cobraría como abono más que el servicio.
3. **`on delete restrict` en `pagos`.** Con `cascade` (PR #28), borrar una
   reserva borraba la prueba de un cobro real. Un pago es un registro contable.
4. **Unique parcial sobre `autorizado`.** La comprobación previa en la Edge
   Function («ya hay un pago autorizado») tiene una ventana de carrera entre dos
   pestañas. El índice convierte el segundo cobro en un error de la base.
   No impide que Transbank cobre dos veces si dos transacciones se inician en
   paralelo y ambas se pagan; impide registrar ambas como válidas, y el segundo
   commit queda visible como fallo para el personal (ver riesgos).
5. **Concurrencia en la confirmación: `procesando`, nunca `rechazado`.** La
   confirmación se reclama con un UPDATE condicional sobre `confirmado_en`.
   Quien pierde la carrera (recarga, doble pestaña) recibe `procesando: true`
   y la UI consulta de nuevo. Mostrar «rechazado» a quien sí pagó genera un
   segundo pago o un reclamo.
6. **Timeout del commit ⇒ consultar el estado en Transbank.** Un commit puede
   haberse ejecutado aunque la respuesta no llegue. Marcarlo `error` sin
   preguntar deja un cobro real sin registrar.
7. **La confirmación repetida no devuelve `codigo`.** El `codigo` de reserva es
   la credencial de quien reserva sin cuenta (deuda conocida). El `token_ws`
   queda en el historial y en logs; quien lo reutilice no debe obtener el código.
8. **El abandono exige `TBK_ORDEN_COMPRA` coincidente.** Sin esa comprobación,
   cualquiera con un `TBK_TOKEN` podría anular un pago ajeno en curso.
9. **Autorizar solo mueve `pendiente → confirmada`.** Una reserva `completada`
   o `cancelada` no cambia de estado por un pago.
10. **Permiso antes que existencia.** Al iniciar un pago, quien no tiene permiso
    recibe 403 exista o no la reserva/pedido; así no se enumeran ids.

## Risks / Trade-offs

- **Reserva `pendiente` sin pago.** Si la clienta abandona Webpay, la reserva
  queda `pendiente` ocupando el bloque. Ver pregunta abierta 1.
- **Pago autorizado sobre reserva cancelada.** Si la reserva se cancela entre
  iniciar y confirmar, el cobro se registra y la reserva sigue cancelada. La
  devolución es manual (fuera de alcance).
- **Doble cobro en Transbank** por dos transacciones paralelas pagadas: la base
  solo acepta una como autorizada; la otra queda `error` y requiere anulación
  manual en el portal de Transbank.
- **Reservas existentes con `detalles_extra.variante` manipulado** no se
  corrigen: 0019 solo actúa en INSERT.

## Open Questions

1. **¿Qué pasa con una reserva `pendiente` cuyo pago nunca se autoriza?**
   - a) Queda `pendiente`; la clienta puede reintentar el pago desde la pantalla
     de resultado; el personal la cancela a mano.
   - b) Se cancela sola tras N minutos (requiere tarea programada).
   Recomendación: **a** para este cambio. b añade infraestructura que hoy no
   existe y un valor de N que nadie ha pedido. No bloquea ninguna tarea; si se
   elige b, es un cambio aparte.
