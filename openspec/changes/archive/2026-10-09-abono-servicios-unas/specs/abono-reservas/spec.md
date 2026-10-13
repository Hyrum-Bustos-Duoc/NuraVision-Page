# Spec Delta

## Purpose
Abono por servicio en pesos chilenos, exigido en los servicios de uñas, pagado
de forma simulada al final del flujo de reserva y registrado en la reserva como
copia inmutable.

## ADDED Requirements

### Requirement: Abono por servicio
Cada servicio SHALL tener un abono entero en CLP mayor o igual a 0, donde 0
significa «sin abono». La base SHALL rechazar un abono negativo. El panel SHALL
rechazar guardar un servicio cuyo abono supere su precio «desde»
(`precioDesde`), y SHALL rechazar guardar un servicio de categoría uñas con
abono 0.

#### Scenario: Abono negativo en la base
- **WHEN** se actualiza `servicios.abono` a -1
- **THEN** la base rechaza la escritura por el check y la fila conserva su valor

#### Scenario: Uñas sin abono desde el panel
- **WHEN** el personal guarda un servicio de categoría Uñas con abono 0
- **THEN** no se envía nada a la base y el formulario muestra «Los servicios de uñas requieren un abono mayor que $0.»

#### Scenario: Abono mayor que el precio con variantes
- **WHEN** el personal guarda un servicio con abono 12.000 y variantes cuya opción más barata cuesta 10.000
- **THEN** no se envía nada a la base y el formulario explica que el abono no puede superar $10.000

#### Scenario: Otra categoría sin abono
- **WHEN** el personal guarda un servicio de categoría Cabello con abono 0
- **THEN** se guarda sin error

#### Scenario: Editar el abono
- **WHEN** el personal cambia el abono de un servicio de 5.000 a 6.000 y recarga el panel
- **THEN** el formulario del servicio muestra 6.000

### Requirement: Relleno inicial de los servicios de uñas
La migración SHALL asignar a cada servicio que el frontend clasifica como uñas
(categoría normalizada distinta de cabello, piel, diagnostico, estilismo y
estetica, incluida la nula) un abono de
`least(desde, greatest(1000, round(desde * 0.30 / 1000) * 1000))`, con `desde`
igual al precio mínimo de sus variantes o a `precio_base` si no tiene. Los demás
servicios SHALL quedar con abono 0.

#### Scenario: Servicios del seed
- **WHEN** se aplica la migración sobre el seed
- **THEN** Manicura Completa queda en 5.000, Esmaltado Tradicional en 4.000, Esmaltado Permanente en 7.000, Esculpido de Uñas en 11.000 y «manicure rapida» (categoría nula) en 5.000

#### Scenario: Servicio de otra categoría
- **WHEN** se aplica la migración sobre el seed
- **THEN** Corte de Pelo, Tratamiento Facial y los demás servicios de Estilismo y Estética quedan con abono 0

#### Scenario: Reservas existentes
- **WHEN** se aplica la migración
- **THEN** todas las reservas previas quedan con `abono = 0` y ninguna otra columna de `reservas` cambia

### Requirement: Abono registrado por la base
Al insertar una reserva, la base SHALL fijar `reservas.abono` al abono vigente
del servicio, ignorando cualquier valor enviado. Ni la clienta ni el personal
SHALL poder modificar `reservas.abono` desde el navegador. Cambiar el abono del
servicio SHALL NOT alterar reservas ya creadas.

#### Scenario: Valor manipulado en el insert
- **WHEN** una sesión anónima inserta una reserva de un servicio con abono 5.000 enviando `abono: 0`
- **THEN** la fila queda con `abono = 5000`

#### Scenario: Intento de editar el abono
- **WHEN** una clienta con sesión o una cuenta del personal hace UPDATE de `abono` sobre una reserva
- **THEN** la base lo rechaza por falta de privilegio y el valor no cambia

#### Scenario: Cambio posterior del servicio
- **WHEN** el personal cambia el abono del servicio de 5.000 a 8.000 después de crear una reserva
- **THEN** esa reserva sigue con `abono = 5000`

### Requirement: Paso de abono en el flujo de reserva
Si el servicio elegido tiene abono > 0, el flujo SHALL agregar un paso «Abono»
después de «Confirmar», y la reserva SHALL crearse solo al aprobar ese pago. Si
el abono es 0, el flujo SHALL comportarse exactamente como antes de este cambio.
El paso SHALL mostrar el abono, el saldo a pagar en el estudio (precio − abono),
el aviso de pago de demostración y el texto de política de cancelación. Aplica
igual a las reservas que llegan al paso de confirmación desde Nuria.

#### Scenario: Servicio de uñas
- **WHEN** se reserva Manicura Completa (abono 5.000, precio 18.000) y se pulsa «Continuar al abono» en Confirmar
- **THEN** no se ha creado ninguna reserva, el stepper marca «Abono» y la pantalla muestra abono $5.000 y saldo $13.000

#### Scenario: Servicio sin abono
- **WHEN** se reserva un servicio con abono 0
- **THEN** el stepper no tiene paso «Abono» y el botón «Confirmar» crea la reserva como hoy

#### Scenario: Variante elegida
- **WHEN** se reserva un servicio con abono 4.000 eligiendo una opción de 20.000
- **THEN** el saldo mostrado es $16.000

#### Scenario: Volver desde el pago
- **WHEN** en el paso «Abono» se vuelve a «Confirmar»
- **THEN** se conservan el servicio, la profesional, la fecha, la hora y los datos de contacto, y no existe reserva creada

### Requirement: Pago simulado
El formulario SHALL exigir titular no vacío, número de 16 dígitos (con espacios
permitidos), vencimiento MM/AA no anterior al mes en curso y CVV de 3 dígitos, y
con datos válidos SHALL aprobar siempre. Los datos de tarjeta SHALL NOT
enviarse en ninguna petición de red ni escribirse en `localStorage` o
`sessionStorage`.

#### Scenario: Tarjeta vencida
- **WHEN** el 2026-10-08 se ingresa vencimiento 09/26
- **THEN** el botón «Pagar abono y reservar» no crea la reserva y el campo indica que la tarjeta está vencida

#### Scenario: Número incompleto
- **WHEN** se ingresa un número de 15 dígitos
- **THEN** no se crea la reserva y el campo indica el error

#### Scenario: Pago aprobado
- **WHEN** se envían datos válidos
- **THEN** se crea exactamente una reserva y se muestra la pantalla de reserva creada con el abono

#### Scenario: Datos de tarjeta fuera de la red y del almacenamiento
- **WHEN** se completa un pago con el número 4242 4242 4242 4242
- **THEN** ninguna petición registrada por el navegador contiene «4242424242424242» ni «4242 4242 4242 4242», y `localStorage` y `sessionStorage` tampoco

#### Scenario: Doble envío
- **WHEN** se pulsa «Pagar abono y reservar» dos veces seguidas
- **THEN** se crea una sola reserva

#### Scenario: La base rechaza la reserva
- **WHEN** el insert falla tras aprobar el pago
- **THEN** la pantalla sigue en «Abono», muestra el error y «No se realizó ningún cobro.», conserva los datos del formulario y permite reintentar

### Requirement: Visualización del abono
Toda reserva con abono > 0 SHALL mostrarlo en la pantalla de reserva creada, en
«Mis reservas», en el detalle de la reserva y en el panel de reservas del
estudio. Una reserva con abono 0 SHALL NOT mostrar línea de abono. Cancelar o
reprogramar SHALL NOT cambiar el abono mostrado ni volver a pedir pago.

#### Scenario: Panel del estudio
- **WHEN** el personal abre el panel de reservas con una reserva de abono 5.000 y otra de abono 0
- **THEN** la primera muestra $5.000 de abono y la segunda no muestra abono

#### Scenario: Reserva cancelada
- **WHEN** una clienta con sesión cancela una reserva con abono 5.000
- **THEN** el detalle y «Mis reservas» siguen mostrando abono $5.000 y el texto de política de cancelación

#### Scenario: Reprogramar
- **WHEN** una clienta reprograma una reserva con abono 5.000
- **THEN** no aparece paso de pago y la reserva conserva abono $5.000

#### Scenario: Reserva local antigua
- **WHEN** «Mis reservas» lee una reserva local guardada antes de este cambio, sin campo de abono
- **THEN** se muestra sin línea de abono y la pantalla no falla
