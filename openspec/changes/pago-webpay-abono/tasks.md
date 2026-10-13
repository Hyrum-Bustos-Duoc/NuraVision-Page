# Tasks

Orden por dependencia real: esquema → auditoría → tipos → funciones → front →
QA. Cada tarea tiene un solo dueño y toca una sola ruta. Los criterios están en
`specs/`; aquí se indica qué requisitos le tocan a cada una. La verificación de
cada criterio la ejecuta nv-qa (tarea 5.1), no el implementador.

## 1. Base de datos

- [ ] 1.1 **(nv-supabase)** 0018 `pagos`: sustituye a `0015_pagos_webpay.sql` y
  `0016_reserva_abono.sql` del PR #28 (se retiran; sin `cobrar_abono` ni
  `monto_abono`). FKs `on delete restrict`, `monto_total` nullable, índice
  único parcial de un `autorizado` por `reserva_id` y por `pedido_id`, sin
  escritura para `anon`/`authenticated`, rollback comentado.
  Requisitos: «Un solo pago autorizado» (escenarios de base).
  Depende de: nada.

- [ ] 1.2 **(nv-supabase)** 0019 trigger de precio en `reservas`: reescribe
  `detalles_extra.variante` desde el catálogo, rechaza opción ausente o
  inexistente y variante en servicio sin variantes, y fija
  `abono = least(servicios.abono, precio efectivo)`. Debe ejecutarse antes que
  el cálculo de abono de 0015 o sustituirlo; no puede quedar un orden de
  triggers en que el abono se calcule con la variante sin reescribir.
  Requisitos: «Precio de la reserva fijado por la base», «Abono registrado por
  la base».
  Depende de: nada.

- [ ] 1.3 **(nv-rls-auditor)** Auditar 1.1 y 1.2: que el navegador no pueda
  escribir `pagos`; que ningún valor enviado en `precio`, `etiqueta` o `abono`
  sobreviva al insert; que el trigger no sea `security definer` sin necesidad;
  que el orden de triggers de 1.2 sea el declarado. Criterio: reporte sin
  hallazgos bloqueantes o hallazgos devueltos a nv-supabase.
  Depende de: 1.1, 1.2.

## 2. Contrato

- [ ] 2.1 **(nv-contracts)** Tipos de `pagos` según `design.md`; `servicios`
  sin `cobrar_abono`/`monto_abono`; tipo del comprobante idéntico al de
  `design.md`. Criterio: `npx tsc --noEmit -p tsconfig.app.json` falla si algo
  lee `cobrar_abono` o un campo del comprobante que no está en el contrato.
  Depende de: 1.3.

## 3. Edge Functions

- [ ] 3.1 **(nv-supabase)** Iniciar pago: monto desde la base según la tabla
  de `design.md`, 403 antes que 404, rechazo si ya hay pago autorizado.
  Requisitos: «Monto calculado por el servidor», «Permiso antes que
  existencia», «Un solo pago autorizado».
  Depende de: 1.3.

- [ ] 3.2 **(nv-supabase)** Confirmar y retorno: `procesando`, timeout →
  consulta de estado, `repetida` sin `codigo`, abandono con orden coincidente,
  solo `pendiente → confirmada`.
  Requisitos: «Confirmación del pago», «Abandono en Webpay».
  Depende de: 1.3.

## 4. Frontend

- [ ] 4.1 **(nv-frontend)** Flujo de reserva: paso «Abono» solo con Webpay
  cuando `abono > 0`; elección Webpay / estudio cuando `abono = 0`, con el
  patrón del checkout de la tienda; sin formulario de tarjeta simulado.
  Requisito: «Paso de abono en el flujo de reserva».
  Depende de: 2.1, 3.1.

- [ ] 4.2 **(nv-frontend)** Pantalla de resultado: espera y reconsulta con
  `procesando`, saldo cuando lo hay, reintento cuando no se aprobó.
  Requisito: «Pantalla de resultado del pago».
  Depende de: 2.1, 3.2.

## 5. Verificación

- [ ] 5.1 **(nv-qa)** Cubrir cada escenario de `specs/abono-reservas` y
  `specs/pagos-webpay` contra el entorno de integración de Transbank, con
  especial atención a: insert con `precio: 1`, dos pestañas confirmando el
  mismo token, recarga de la URL de retorno, abandono con orden ajena.
  Depende de: 4.1, 4.2.
