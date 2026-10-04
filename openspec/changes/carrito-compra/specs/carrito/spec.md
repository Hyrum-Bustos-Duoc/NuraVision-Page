# Spec Delta

## Purpose
Estado del carrito de compras: agregar, cambiar cantidades, quitar, persistir entre visitas y mostrar el avance hacia el despacho gratis.

## ADDED Requirements

### Requirement: Líneas del carrito
El carrito SHALL guardar líneas `{producto, cantidad}`. Agregar un producto ya presente SHALL sumar la cantidad. Llevar una línea a 0 desde el drawer SHALL eliminarla. El contador del header SHALL ser la suma de cantidades.

#### Scenario: Agregar dos veces
- **WHEN** se agrega el mismo producto dos veces
- **THEN** hay una sola línea con cantidad 2 y el contador muestra 2

### Requirement: Persistencia
El carrito SHALL persistir en el navegador y sobrevivir a recargas. Al restaurarlo SHALL descartar productos que ya no estén activos en el catálogo.

#### Scenario: Producto descontinuado
- **WHEN** un producto guardado en el carrito se desactiva en la base
- **THEN** al volver, la línea ya no aparece y el subtotal no lo cuenta

### Requirement: Barra de despacho gratis
El drawer SHALL indicar cuánto falta para el despacho gratis ($40.000) o que ya se alcanzó, con una barra proporcional al subtotal con tope en 100 %.

#### Scenario: Bajo el umbral
- **WHEN** el subtotal es $29.700
- **THEN** el texto dice «Te faltan $10.300 para despacho gratis.»
