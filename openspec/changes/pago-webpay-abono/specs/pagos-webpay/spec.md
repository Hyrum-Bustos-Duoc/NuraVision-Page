## ADDED Requirements

### Requirement: Monto calculado por el servidor
Iniciar un pago SHALL recibir solo la identidad de la reserva o del pedido (y la
prueba de permiso), nunca un monto. El servidor SHALL calcular el monto desde la
base según la tabla «Monto a cobrar» de `design.md` y SHALL registrar el intento
en `pagos` con ese monto antes de redirigir a Transbank.

#### Scenario: Reserva con abono
- **WHEN** se inicia el pago de una reserva con `abono = 5000` y precio efectivo 18.000
- **THEN** la transacción Webpay es por 5.000 y el pago queda con `monto = 5000`, `monto_total = 18000`

#### Scenario: Reserva sin abono
- **WHEN** se inicia el pago de una reserva con `abono = 0` y opción de 20.000
- **THEN** la transacción Webpay es por 20.000 y el pago queda con `monto_total` null

#### Scenario: Monto en la petición
- **WHEN** la petición para iniciar el pago incluye `monto: 1`
- **THEN** el valor se ignora y la transacción es por el monto calculado

### Requirement: Permiso antes que existencia
Iniciar un pago SHALL exigir que quien llama sea la clienta dueña (sesión), el
personal, o presente el `codigo` correcto. Quien no cumple SHALL recibir 403
tanto si la reserva o el pedido existe como si no.

#### Scenario: Id inexistente sin permiso
- **WHEN** una sesión anónima inicia el pago de la reserva 999999 (inexistente) sin código
- **THEN** recibe 403, igual que con una reserva existente ajena

#### Scenario: Código incorrecto
- **WHEN** una sesión anónima inicia el pago de una reserva existente con un código que no es el suyo
- **THEN** recibe 403 y no se crea fila en `pagos`

### Requirement: Un solo pago autorizado
La base SHALL impedir más de un pago `autorizado` por reserva y por pedido.
Iniciar un pago de algo que ya tiene un pago autorizado SHALL rechazarse sin
crear transacción. Un intento `rechazado`, `anulado` o `error` SHALL permitir
reintentar con una orden de compra nueva. Las filas de `pagos` SHALL impedir
borrar la reserva o el pedido al que apuntan.

#### Scenario: Segundo autorizado en la base
- **WHEN** se intenta marcar como `autorizado` un segundo pago de la misma reserva
- **THEN** la base rechaza la escritura

#### Scenario: Reintento tras rechazo
- **WHEN** el primer pago de una reserva quedó `rechazado` y se inicia otro
- **THEN** se crea una transacción con `buy_order` distinto

#### Scenario: Borrar una reserva con pago
- **WHEN** se borra una reserva que tiene una fila en `pagos`
- **THEN** la base rechaza el borrado y el pago sigue existiendo

### Requirement: Confirmación del pago
Confirmar un `token_ws` SHALL ejecutar el commit en Transbank como máximo una
vez y devolver el comprobante de `design.md`. Si el pago queda `autorizado`, la
reserva SHALL pasar de `pendiente` a `confirmada` y el pedido a `pagado`; una
reserva `completada` o `cancelada` SHALL NOT cambiar de estado. Si otra
confirmación del mismo token está en curso, la respuesta SHALL ser
`procesando: true`. Si el token ya se había confirmado, la respuesta SHALL ser
el comprobante guardado con `repetida: true` y `codigo: null`. Si el commit no
responde a tiempo, el servidor SHALL consultar el estado de la transacción en
Transbank y registrar ese resultado.

#### Scenario: Pago aprobado
- **WHEN** se confirma el token de una reserva `pendiente` con abono 5.000 y Transbank aprueba
- **THEN** el pago queda `autorizado`, la reserva `confirmada`, y el comprobante trae `aprobado: true`, `codigo` de la reserva, `monto: 5000`, `montoTotal: 18000`, `saldo: 13000`

#### Scenario: Recarga durante la confirmación
- **WHEN** llegan dos confirmaciones del mismo token y la segunda llega antes de que termine la primera
- **THEN** Transbank recibe un solo commit y la segunda respuesta trae `procesando: true` y no `estado: 'rechazado'`

#### Scenario: Confirmación repetida
- **WHEN** se confirma de nuevo un token ya confirmado y autorizado
- **THEN** la respuesta trae `repetida: true`, `aprobado: true` y `codigo: null`, y no se llama al commit

#### Scenario: Timeout del commit
- **WHEN** el commit excede el tiempo de espera y la consulta de estado en Transbank dice `AUTHORIZED`
- **THEN** el pago queda `autorizado` y la reserva `confirmada`

#### Scenario: Reserva completada
- **WHEN** se autoriza un pago de una reserva en estado `completada`
- **THEN** la reserva sigue `completada`

### Requirement: Abandono en Webpay
Cuando Transbank devuelve a la clienta sin `token_ws` (con `TBK_TOKEN` y
`TBK_ORDEN_COMPRA`), el pago SHALL marcarse `anulado` solo si existe un pago con
ese token cuya `buy_order` coincide con `TBK_ORDEN_COMPRA` y que sigue
`iniciado`. En otro caso SHALL NOT cambiar ningún pago.

#### Scenario: Abandono legítimo
- **WHEN** vuelve un abandono con `TBK_TOKEN` y `TBK_ORDEN_COMPRA` de un pago `iniciado`
- **THEN** el pago queda `anulado` y la respuesta trae `aprobado: false` y un `motivo`

#### Scenario: Orden que no coincide
- **WHEN** vuelve un abandono con un `TBK_TOKEN` válido y otra `TBK_ORDEN_COMPRA`
- **THEN** ningún pago cambia de estado

### Requirement: Pantalla de resultado del pago
La pantalla de retorno SHALL mostrar el comprobante: aprobado con código de
autorización, monto, últimos dígitos y, si hay saldo, el saldo a pagar en el
estudio; no aprobado con el `motivo` y una acción para reintentar el pago. Con
`procesando: true` SHALL mostrar un estado de espera y volver a consultar hasta
recibir un estado final, sin mostrar nunca «rechazado» mientras tanto; si a
los 30 segundos no hay estado final, SHALL decir que el pago se está
verificando y ofrecer volver a consultar. Con
`repetida: true` SHALL mostrar el resultado sin el código de reserva.

#### Scenario: Procesando
- **WHEN** la confirmación responde `procesando: true` y la siguiente consulta responde `autorizado`
- **THEN** la pantalla pasa de espera a aprobado y en ningún momento muestra «rechazado»

#### Scenario: Abono con saldo
- **WHEN** el comprobante trae `monto: 5000`, `saldo: 13000`
- **THEN** la pantalla muestra abono pagado $5.000 y saldo en el estudio $13.000

#### Scenario: Total pagado
- **WHEN** el comprobante trae `saldo: null`
- **THEN** la pantalla no muestra línea de saldo
