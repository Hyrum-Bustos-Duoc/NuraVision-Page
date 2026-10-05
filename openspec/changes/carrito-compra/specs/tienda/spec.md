# Spec Delta

## Purpose
Catálogo de productos del estudio: listado filtrable por categoría, detalle de producto y vínculo con el servicio en que se usa.

## ADDED Requirements

### Requirement: Catálogo filtrable
La tienda SHALL listar los productos activos de la base y permitir filtrarlos por una única categoría (Todos, Uñas y manos, Cabello, Piel, Kits, Gift cards) sin recargar la página. El filtro SHALL reflejarse en la URL (`?categoria=`) para poder enlazarlo desde el footer.

#### Scenario: Filtrar por categoría
- **WHEN** la visitante elige «Cabello»
- **THEN** solo se muestran productos de Cabello y el contador indica cuántos son

#### Scenario: Catálogo no disponible
- **WHEN** la consulta de productos falla
- **THEN** se muestra un aviso con el motivo en vez de una grilla vacía

### Requirement: Banner combo
El banner «Ritual de manos completo» SHALL mostrarse con los filtros Todos, Kits o Uñas y manos. «Reservar y agregar kit» SHALL agregar el kit al carrito, preferir la entrega en cita, NO abrir el drawer y llevar al flujo de reserva con el servicio vinculado preseleccionado.

#### Scenario: Reservar y agregar kit
- **WHEN** la visitante pulsa «Reservar y agregar kit»
- **THEN** el kit queda en el carrito, aparece el aviso «Kit agregado: lo entregamos en tu cita.» y el flujo de reserva arranca en la elección de profesional

### Requirement: Detalle de producto
El detalle SHALL mostrar galería, precio, stepper (mínimo 1), «Agregar al carrito · {total}» recalculado en vivo, «Comprar ahora», información de entrega, modo de uso, ingredientes, servicio vinculado si existe y hasta 4 productos de «Combina bien con» (misma categoría o Kits, excluido el actual, completado con el resto).

#### Scenario: Comprar ahora
- **WHEN** la visitante pulsa «Comprar ahora» con cantidad 2
- **THEN** se agregan 2 unidades y se abre el checkout sin pasar por el drawer

#### Scenario: Producto inexistente
- **WHEN** se visita `/tienda/slug-que-no-existe`
- **THEN** se informa que el producto no está disponible y se ofrece volver a la tienda
