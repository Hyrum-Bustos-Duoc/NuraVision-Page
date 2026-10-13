# Design

## Context

- Frontend React 19 + Vite + Tailwind 4, organizado por módulos con capas
  `domain / application / infrastructure / ui`.
- Backend Supabase: el navegador usa la anon key y la seguridad la dan las
  políticas de RLS. Las reservas admiten invitadas (sin cuenta).
- El catálogo de servicios real no usa los nombres del prototipo
  («Manicura Completa», no «Manicure Ritual Nura»). Todo vínculo producto →
  servicio va por id de la base, nunca por nombre del prototipo.
- La ocupación real de la agenda no es legible por la anon key: el asistente de
  reserva calcula horas libres con la disponibilidad semanal.

## Goals / Non-Goals

**Goals:**
- Implementar las pantallas NUEVO y MODIFICADO del Diseño 1, responsive desde
  360 px.
- Que ningún precio, costo de despacho ni descuento dependa del navegador.
- No romper sesión, registro, reservas ni paneles internos.

**Non-Goals:**
- Integración real con Webpay (requiere credenciales de Transbank). El pedido
  queda en `pendiente_pago` y la pantalla lo dice.
- Modelo de lenguaje real para Nuria (la spec lo deja para producción).
- «Mis pedidos» de la clienta (la spec indica que aún no está diseñado).
- Switch de tema y «mapa del prototipo» (la spec los marca como solo prototipo).

## Decisions

1. **Precios en el servidor.** `crear_pedido` es `security definer`, recibe solo
   `[{slug, cantidad}]`, contacto y entrega, y lee precios de `productos`. Copia
   nombre y precio unitario en `pedido_items` para que editar el catálogo no
   reescriba pedidos pasados (mismo criterio que `reservas.detalles_extra`).
   Alternativa descartada: INSERT directo con RLS; no permite validar totales.
2. **Reglas espejo en el dominio.** `pedido.reglas.ts` calcula lo mismo que la
   función para mostrar el resumen antes de pagar. La función manda; si difieren,
   la confirmación muestra el total que devolvió la base.
3. **Despacho**: $3.990, gratis desde $40.000 de subtotal. Retiro y entrega en
   cita siempre gratis. Cobertura: Viña del Mar y Valparaíso (se valida en la
   función).
4. **Entrega en cita** solo con sesión y con una reserva propia futura
   (`pendiente` o `confirmada`). La función lo comprueba contra `reservas`.
5. **Combo**: 15 % sobre los productos de la categoría Kits cuyo servicio
   vinculado coincide con el de la reserva elegida para «entrega en cita».
6. **Pago en el estudio** solo con retiro o cita (la función lo rechaza con
   despacho).
7. **Stock opcional**: `productos.stock` nulo = sin control. Si tiene valor, la
   función lo descuenta con bloqueo de fila y rechaza la compra si no alcanza.
8. **Carrito local** en `localStorage` (`nv-carrito`), solo con `{slug, qty}`.
   Al leerlo se descartan productos que ya no existen o están inactivos.
9. **Nuria reserva de verdad**: elegir horario rellena el borrador del flujo de
   reserva (servicio, profesional, fecha, hora) y lleva al paso de confirmación,
   donde se crea la reserva con el mecanismo existente.
10. **Tema**: tokens `--nv-*` con Oliva por defecto y Arcilla bajo
    `html[data-nv-theme="clay"]`. Los tokens previos de Tailwind (`ink`, `ivory`,
    `olive-*`…) pasan a apuntar a los nuevos, así las pantallas BASE heredan la
    paleta sin reescribirlas.

## Risks / Trade-offs

- Hasta aplicar `0013_tienda.sql`, la tienda muestra un error explícito que
  nombra la migración. Se prefirió eso a un catálogo local que oculte el fallo.
- Las horas que sugiere Nuria no conocen las reservas de otras clientas (la RLS
  las oculta). El paso de confirmación es la última palabra.
- Pedidos de invitadas quedan con `cliente_id` nulo, igual que las reservas: su
  vínculo es el código del pedido y el correo.
