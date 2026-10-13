# Spec Delta

## Purpose
Asistente Nuria: responde por palabras clave, recomienda productos, los agrega al carrito, sugiere horas y explica políticas de entrega, devoluciones y cancelación.

## ADDED Requirements

### Requirement: Puntos de entrada
Nuria SHALL abrirse desde el launcher flotante, el botón del navbar, la tarjeta del hero, la banda «Dile qué necesitas» y los links de Ayuda del footer. Los prompts SHALL abrir el panel y enviar su texto.

#### Scenario: Prompt del hero
- **WHEN** se pulsa «Mis uñas se quiebran, ¿qué uso?»
- **THEN** el panel se abre, aparece el mensaje de la usuaria y, tras «escribiendo», la recomendación con carrusel de productos

### Requirement: Intenciones
Nuria SHALL normalizar el texto (minúsculas, sin tildes) y evaluar en orden: agregar todo, carrito, entrega, devoluciones, cancelación, reservar servicio, reservar sin servicio, tema → productos, saludo y respuesta por defecto.

#### Scenario: Agregar todo
- **WHEN** tras una recomendación se escribe «agregar todo»
- **THEN** los productos recomendados se agregan, se marcan «Agregado ✓» y Nuria resume ítems y total

### Requirement: Reserva desde Nuria
Al elegir un horario, Nuria SHALL dejar la reserva lista para confirmar en el flujo de reserva real y NO SHALL afirmar que la hora quedó reservada antes de que exista en la base.

#### Scenario: Elegir horario
- **WHEN** se elige «Mañana · 10:30» en la tarjeta de servicio
- **THEN** el resto de los horarios se bloquea y Nuria ofrece «Confirmar reserva →», que abre el paso de confirmación con servicio, profesional, fecha y hora cargados
