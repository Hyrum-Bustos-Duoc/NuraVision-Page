# Proposal

## Why

El sitio hoy solo reserva servicios y orienta con el análisis IA. El estudio vende
los mismos productos que usa en cada ritual, pero no hay forma de comprarlos en
línea. El Diseño 1 «Tienda» (especificación en PDF, fuera del repositorio) agrega
la tienda, el carrito, el checkout con tres modos de entrega, los combos servicio +
producto y la asistente Nuva, y renueva el aspecto global del sitio.

## What Changes

- **Tienda**: catálogo con filtros por categoría, banner combo y detalle de
  producto con servicio vinculado y «Combina bien con».
- **Carrito**: drawer lateral persistido en el navegador, con barra de despacho
  gratis y stepper por línea.
- **Checkout** en tres pasos (Entrega → Pago → Confirmación). El pedido se crea en
  Supabase con una función `crear_pedido` que **recalcula precios, despacho y
  descuentos en el servidor**: el navegador nunca fija lo que se cobra.
- **Nuva**: asistente de compras y reservas por palabras clave. Recomienda
  productos, agrega al carrito y deja una hora **lista para confirmar** en el
  flujo de reserva real (no inventa reservas).
- **Chrome global**: barra de anuncios, navbar con Tienda / Nuva / carrito, footer
  oscuro con newsletter. Paleta Oliva por defecto, tipografías Newsreader y
  Hanken Grotesk.
- **Landing** renovada y bloque «Y para continuar en casa» en el análisis IA.
- **Administración**: listado de pedidos con cambio de estado, para que el
  estudio pueda despacharlos.
- **Login** acepta una ruta de retorno (`?volver=`) para volver al checkout.

## Capabilities

### New Capabilities
- `tienda`: catálogo de productos, filtros y detalle de producto.
- `carrito`: estado del carrito, reglas de cantidad y despacho gratis.
- `pedidos`: checkout, creación del pedido en la base y gestión del estudio.
- `nuva`: asistente de compras y reservas.
- `sitio-global`: barra de anuncios, navbar, footer, newsletter y tema.

### Modified Capabilities
<!-- No hay specs previas en openspec/specs/. -->

## Impact

- Base: migración `0013_tienda.sql` (tablas `productos`, `pedidos`,
  `pedido_items`, `suscripciones_newsletter` y funciones `crear_pedido`,
  `suscribir_newsletter`). Aditiva: no altera tablas existentes.
- Frontend: módulos nuevos `tienda`, `carrito`, `pedidos`, `nuva`, `newsletter`;
  cambios en `ClientChrome`, `Landing`, `AIAnalysis`, `Login`, `index.css`, `App`.
- Sin dependencias nuevas.
