# Spec Delta

## Purpose
Checkout en tres pasos y creación del pedido en la base con precios, despacho y descuentos calculados en el servidor; gestión de pedidos por el estudio.

## ADDED Requirements

### Requirement: Modos de entrega
El checkout SHALL ofrecer despacho a domicilio ($3.990, gratis desde $40.000 de subtotal, solo Viña del Mar y Valparaíso), retiro en el estudio (gratis) y entrega en la próxima cita (gratis). La entrega en cita SHALL estar disponible solo con sesión y una reserva propia futura no cancelada.

#### Scenario: Invitada sin reservas
- **WHEN** una visitante sin sesión llega al paso de entrega
- **THEN** la entrega en cita aparece deshabilitada con la indicación de iniciar sesión

#### Scenario: Comuna fuera de cobertura
- **WHEN** se elige despacho a una comuna distinta de Viña del Mar o Valparaíso
- **THEN** no se puede continuar y se explica la cobertura

### Requirement: Medios de pago
El checkout SHALL ofrecer Webpay, transferencia y pago en el estudio. Pagar en el estudio SHALL estar deshabilitado con despacho a domicilio.

#### Scenario: Despacho con pago en estudio
- **WHEN** la entrega es despacho
- **THEN** la opción «Pagar en el estudio» está deshabilitada

### Requirement: Totales en el servidor
La creación del pedido SHALL recibir solo productos y cantidades, y SHALL calcular en la base el subtotal, el despacho, el descuento del combo (15 % en Kits vinculados al servicio de la cita) y el total. El pedido SHALL guardar una copia del nombre y precio de cada producto.

#### Scenario: Precio manipulado
- **WHEN** el navegador envía un pedido alterando el precio en memoria
- **THEN** el total guardado corresponde a los precios de la tabla `productos`

#### Scenario: Sin stock
- **WHEN** un producto con stock 1 se pide con cantidad 2
- **THEN** el pedido se rechaza con un mensaje que nombra el producto

### Requirement: Confirmación
Tras crear el pedido, el carrito SHALL vaciarse y la confirmación SHALL mostrar el código del pedido, el total devuelto por la base y un mensaje según el modo de entrega.

#### Scenario: Pedido con retiro
- **WHEN** se confirma un pedido con retiro
- **THEN** se ve «Pedido confirmado», el código `NV-P-…` y el aviso de que se avisará cuando esté listo para retirar

### Requirement: Gestión del estudio
El personal SHALL poder listar todos los pedidos y cambiar su estado. Una clienta SHALL poder leer solo sus propios pedidos.

#### Scenario: Clienta lee pedidos ajenos
- **WHEN** una clienta consulta la tabla de pedidos
- **THEN** solo recibe los suyos
