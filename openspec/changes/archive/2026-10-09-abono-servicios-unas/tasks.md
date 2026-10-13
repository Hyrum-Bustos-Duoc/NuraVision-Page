# Tasks

Orden por dependencia real: esquema → auditoría → tipos → front → QA. Cada tarea
tiene un solo dueño y toca una sola ruta. Los criterios de cada una están en
`specs/abono-reservas/spec.md`; aquí se indica cuáles le tocan.

## 1. Base de datos

- [x] 1.1 **(nv-supabase)** Migración siguiente a `0014`: `servicios.abono` y
  `reservas.abono` (`integer not null default 0`, check `>= 0`), trigger
  `before insert` en `reservas` que copia `servicios.abono` sin
  `security definer`, relleno inicial de uñas según la decisión 4 de
  `design.md`, comentarios de columna con el porqué, sin tocar los `GRANT UPDATE`
  por columnas de 0005/0006, consulta de comprobación que liste
  `nombre, categoria, precio_base, abono` de cada servicio, y bloque de rollback
  comentado. Requisitos: «Abono por servicio» (escenario de la base), «Relleno
  inicial», «Abono registrado por la base».
  Depende de: nada.

- [x] 1.2 **(nv-rls-auditor)** Auditar la migración 1.1: que el trigger no se
  pueda saltar enviando `abono`, que `abono` no quede en ningún GRANT UPDATE para
  `anon`/`authenticated`, que el trigger no use `security definer` y que el
  relleno no altere otras columnas. Criterio: reporte sin hallazgos
  bloqueantes, o hallazgos devueltos a nv-supabase.
  Depende de: 1.1.

## 2. Contrato

- [x] 2.1 **(nv-contracts)** `shared/types/supabase.ts`: `servicios.abono`
  (Row `number`, Insert/Update opcional) y `reservas.abono` (solo en Row; ni en
  Insert ni en Update), con comentario de su origen. Criterio:
  `npx tsc --noEmit -p tsconfig.app.json` falla si un mapper intenta enviar
  `abono` en el insert de `reservas`.
  Depende de: 1.2.

## 3. Frontend

- [x] 3.1 **(nv-frontend)** Abono en el módulo `servicios` y en el formulario de
  servicios del panel: campo «Abono (CLP)», lectura tolerante a columna ausente
  (→ 0), validación en el dominio (uñas > 0; ≤ `precioDesde`), con tests
  unitarios de la regla. Requisito: «Abono por servicio» (escenarios del panel).
  Depende de: 2.1.

- [x] 3.2 **(nv-frontend)** Paso «Abono» en el flujo de reserva, formulario de
  tarjeta de demostración, creación de la reserva al aprobar, abono en el
  `Booking` local y en la pantalla de reserva creada. Requisitos: «Paso de abono
  en el flujo de reserva», «Pago simulado» y el escenario de pantalla de reserva
  creada.
  Depende de: 3.1.

- [x] 3.3 **(nv-frontend)** Abono en «Mis reservas», en el detalle de la reserva
  (con texto de política) y en el panel de reservas del estudio, leyendo
  `reservas.abono` en los dos mappers de reservas y tolerando reservas locales
  sin el campo. Requisito: «Visualización del abono».
  Depende de: 2.1. Puede ir en paralelo con 3.2 salvo el texto de política, que
  ambas comparten (ver preguntas resueltas, 1).

## 4. Verificación

- [x] 4.1 **(nv-qa)** Casos desde todos los escenarios de
  `specs/abono-reservas/spec.md`, incluido el insert manipulado con la anon key,
  el UPDATE de `abono` con sesión de clienta y de personal, el escaneo de red y
  almacenamiento con la tarjeta 4242…, el doble envío, la reserva que falla tras
  aprobar y una reserva desde Nuria. Criterio: reporte con pasos de
  reproducción de cada fallo; sin fallos abiertos para cerrar el cambio.
  Depende de: 3.2, 3.3.

## Preguntas resueltas

1. **Texto de política de cancelación del abono.** Lo fijó el dueño el
   2026-10-08: el abono no es reembolsable si se cancela con menos de 24 horas
   de anticipación. Texto:
   «El abono se descuenta del total el día de tu cita. Si reprogramas, se
   mantiene. Si cancelas con al menos 24 horas de anticipación, coordinamos su
   devolución; con menos de 24 horas, no es reembolsable.»
   El aviso de cancelación del detalle y la respuesta de Nuria pasan de 12 h a
   24 h para que no se contradigan. Descartado: «escríbenos y coordinamos su
   devolución» sin plazo (lo recomendado al principio), porque deja sin
   respaldo cancelar a última hora. Es solo texto: no hay bloqueo de
   cancelación por plazo en el código ni en la base.

## Fuera de alcance

- Pasarela de pago real y creación de la reserva en el servidor tras confirmar
  el pago: decisión del dueño (pago simulado). Será su propia propuesta.
- Estado de devolución del abono al cancelar: no hay dinero real que devolver.
- Rechazo de tarjetas simulado o validación Luhn: nadie lo pidió; el
  formulario aprueba siempre con datos bien formados.
- Detectar que el abono cambió durante el flujo (comparar el valor mostrado con
  el de la base): ventana mínima y la invitada no puede leer su fila; ver
  riesgos en `design.md`.
- Columna de precio total en `reservas`: deuda anterior (0011), no la causa
  este cambio.
- Abono en el panel de la profesional: no se pidió.
