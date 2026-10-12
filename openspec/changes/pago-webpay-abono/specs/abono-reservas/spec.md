## ADDED Requirements

### Requirement: Precio de la reserva fijado por la base
Al insertar una reserva, la base SHALL determinar la variante y el precio a
partir de `servicios.variantes`, usando del navegador solo
`detalles_extra.variante.opcionId`. Si el servicio tiene variantes, la base
SHALL reescribir `detalles_extra.variante` con `pregunta`, `opcionId`,
`etiqueta` y `precio` de la opción del catálogo, y SHALL rechazar el insert si
`opcionId` falta o no corresponde a ninguna opción. Si el servicio no tiene
variantes, la base SHALL quitar `detalles_extra.variante` si el navegador la
envía, sin rechazar el insert. Las demás claves de `detalles_extra` SHALL
conservarse. Solo aplica al INSERT: las reservas ya existentes no cambian.

#### Scenario: Precio manipulado
- **WHEN** una sesión anónima inserta una reserva de un servicio con variantes cuya opción `largo` cuesta 20.000, enviando `variante: { opcionId: "largo", precio: 1, etiqueta: "x" }`
- **THEN** la fila queda con `detalles_extra.variante.precio = 20000` y la `etiqueta` del catálogo

#### Scenario: Opción inexistente
- **WHEN** se inserta una reserva de un servicio con variantes y `opcionId: "no-existe"`
- **THEN** la base rechaza el insert y no se crea fila

#### Scenario: Opción ausente
- **WHEN** se inserta una reserva de un servicio con variantes sin `detalles_extra.variante`
- **THEN** la base rechaza el insert y no se crea fila

#### Scenario: Variante en un servicio sin variantes
- **WHEN** se inserta una reserva de un servicio sin variantes enviando `detalles_extra.variante`
- **THEN** la fila se crea sin `detalles_extra.variante` y su precio es `servicios.precio_base`

#### Scenario: Servicio sin variantes
- **WHEN** se inserta una reserva de un servicio sin variantes y sin `detalles_extra.variante`
- **THEN** se crea la fila sin variante

## MODIFIED Requirements

### Requirement: Abono registrado por la base
Al insertar una reserva, la base SHALL fijar `reservas.abono` a
`least(servicios.abono, precio efectivo)`, donde el precio efectivo es el de la
opción fijada por la base o, sin variantes, `servicios.precio_base` redondeado a
entero; SHALL ignorar cualquier valor de `abono` enviado. Ni la clienta ni el
personal SHALL poder modificar `reservas.abono` desde el navegador. Cambiar el
abono o el precio del servicio SHALL NOT alterar reservas ya creadas.

#### Scenario: Valor manipulado en el insert
- **WHEN** una sesión anónima inserta una reserva de un servicio con abono 5.000 y precio 18.000 enviando `abono: 0`
- **THEN** la fila queda con `abono = 5000`

#### Scenario: Abono mayor que la opción elegida
- **WHEN** se inserta una reserva de un servicio con abono 12.000 eligiendo una opción de 10.000
- **THEN** la fila queda con `abono = 10000`

#### Scenario: Intento de editar el abono
- **WHEN** una clienta con sesión o una cuenta del personal hace UPDATE de `abono` sobre una reserva
- **THEN** la base lo rechaza por falta de privilegio y el valor no cambia

#### Scenario: Cambio posterior del servicio
- **WHEN** el personal cambia el abono del servicio de 5.000 a 8.000 después de crear una reserva
- **THEN** esa reserva sigue con `abono = 5000`

### Requirement: Paso de abono en el flujo de reserva
Si el servicio elegido tiene abono > 0, el flujo SHALL agregar un paso «Abono»
después de «Confirmar» que muestre el abono, el saldo a pagar en el estudio
(precio − abono) y el texto de política de cancelación, y cuya única acción de
pago sea Webpay por el monto del abono. No SHALL ofrecer pagar en el estudio.
Si el abono es 0, el paso «Confirmar» SHALL ofrecer elegir entre pagar el total
con Webpay o pagar en el estudio, con el mismo patrón de elección que el
checkout de la tienda; pagar en el estudio SHALL crear la reserva como antes de
este cambio. Al pulsar la acción de Webpay, el flujo SHALL crear la reserva en
estado `pendiente` y llevar a la clienta a Webpay. El monto cobrado SHALL ser el
que calcula el servidor (`specs/pagos-webpay`), no uno enviado por el navegador.
Aplica igual a las reservas que llegan al paso de confirmación desde Nuria.

#### Scenario: Servicio de uñas
- **WHEN** se reserva Manicura Completa (abono 5.000, precio 18.000) y se pulsa «Continuar al abono» en Confirmar
- **THEN** no se ha creado ninguna reserva, el stepper marca «Abono», la pantalla muestra abono $5.000 y saldo $13.000, y no hay opción de pagar en el estudio

#### Scenario: Ir a Webpay con abono
- **WHEN** en el paso «Abono» de Manicura Completa se pulsa pagar con Webpay
- **THEN** existe una reserva `pendiente` con `abono = 5000` y la transacción Webpay creada es por $5.000

#### Scenario: Servicio sin abono
- **WHEN** se reserva un servicio con abono 0 y se elige pagar en el estudio
- **THEN** el stepper no tiene paso «Abono», se crea la reserva y no se crea ninguna transacción Webpay

#### Scenario: Variante elegida
- **WHEN** se reserva un servicio con abono 4.000 eligiendo una opción de 20.000
- **THEN** el paso «Abono» muestra saldo $16.000 y la transacción Webpay es por $4.000

#### Scenario: Servicio sin abono, pago con Webpay
- **WHEN** se reserva un servicio con abono 0 eligiendo una opción de 20.000 y se elige Webpay
- **THEN** la transacción Webpay creada es por $20.000

#### Scenario: Volver desde el pago
- **WHEN** en el paso «Abono» se vuelve a «Confirmar» sin pulsar pagar
- **THEN** se conservan el servicio, la profesional, la fecha, la hora y los datos de contacto, y no existe reserva creada

#### Scenario: Doble envío
- **WHEN** se pulsa la acción de pagar con Webpay dos veces seguidas
- **THEN** se crea una sola reserva y una sola transacción

#### Scenario: La base rechaza la reserva
- **WHEN** el insert de la reserva falla al pulsar pagar con Webpay
- **THEN** la pantalla sigue en el mismo paso, muestra el error y «No se realizó ningún cobro.», conserva los datos y permite reintentar

## REMOVED Requirements

### Requirement: Pago simulado
**Reason**: Sustituido por el cobro real con Webpay Plus (decisión del dueño,
2026-10-11). Un camino de pago que aprueba siempre permitiría reservar sin
pagar el abono.
**Migration**: El formulario de tarjeta de demostración desaparece. Los datos
de tarjeta los captura Transbank en su sitio; el navegador de NuraVision nunca
los recibe.
