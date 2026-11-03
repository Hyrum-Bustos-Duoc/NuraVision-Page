# Proposal

## Why

EP01-HU02 «Actualización de perfil» (Jira NURA-9) figura como Done, pero una
clienta con cuenta real **no puede ni abrir su perfil**, y mucho menos
corregirlo. Comprobado el 2026-10-28 sobre `develop`:

- `/perfil` lee `currentUser` de `AppState`, el usuario de demostración. Ese
  estado nace en `null` y ningún código lo asigna (solo `logout` lo toca), así
  que la página redirige siempre a `/login`. El encabezado lo sabe y, con sesión
  de Supabase, manda «Mi cuenta» a `/mis-reservas` en vez de a `/perfil`.
- Aunque se llegara, «Guardar cambios» solo muestra un toast: no escribe en
  ninguna parte.
- Desde `0017_perfiles_sin_autoedicion.sql` la clienta **no tiene permiso** para
  escribir su fila de `perfiles`. Fue a propósito: la política de 0010 más el
  `grant update` de tabla entera le dejaban reescribir `rol`, `email`,
  `profesional_id` y `fecha_nacimiento`, falseando lo que ve el personal.
- El nombre y el teléfono que muestran el encabezado, el panel de la
  profesional y el formulario de reserva salen de `user_metadata`, no de
  `perfiles`. Corregir solo `perfiles` dejaría la cuenta mostrando el dato viejo
  en esas tres pantallas.

Decisión del usuario (2026-10-28): «El cliente puede editar los campos
relacionados a su información». Se lee como: datos personales propios, nunca
rol, estado de cuenta, puntos ni campos administrativos.

## What Changes

- Una función de base `actualizar_mi_perfil` es la **única vía** por la que una
  cuenta corrige su propia fila. Escribe exactamente tres campos —nombre,
  teléfono y cumpleaños— y nada más. No se recrea ninguna política de UPDATE
  propia: el UPDATE directo sigue afectando 0 filas, como dejó 0017.
- La misma función copia los tres valores a `user_metadata` en la misma
  transacción, para que el encabezado, el panel y la reserva muestren el dato
  nuevo y para que el trigger de 0010/0016 no resucite un valor borrado.
- `/perfil` funciona con la sesión real: lee la fila propia de `perfiles`,
  guarda por la función, y muestra el correo como solo lectura.
- Reglas comunes a front y base: nombre obligatorio de 1 a 120 caracteres;
  teléfono vacío o chileno de 9 dígitos, guardado como `+56XXXXXXXXX`;
  cumpleaños vacío o entre 1920-01-01 y hoy (la regla de 0016).

## Decisiones (2026-10-28)

1. **Función `security definer` con lista blanca, no política.** La función
   nombra las columnas que se escriben; una columna nueva de `perfiles` queda
   fuera hasta que alguien la agregue a propósito.
2. **Un solo campo «Nombre y apellido».** `perfiles` tiene una sola columna
   `nombre`, el registro pide un solo campo y el panel lo edita como uno. Los
   dos inputs actuales (Nombre / Apellido) eran del prototipo.
3. **El correo no se edita en este cambio** (se muestra, bloqueado). Vive en
   Supabase Auth; cambiarlo exige el flujo de confirmación por correo y su
   configuración en el proyecto, y `perfiles.email` ya se sincroniza solo
   cuando Auth lo cambia. Ver pregunta abierta en `design.md`.
4. **El cumpleaños se puede corregir y también borrar, sin límite de veces.**
   0016 **no** tiene una regla de «editable una sola vez»: su única regla es el
   rango 1920-01-01..hoy, y su propuesta archivada dejó la edición posterior
   «para el cambio que decida la fuente de verdad». Este cambio la decide:
   desde que existe la función, la fuente es `perfiles`, y `user_metadata` es
   una copia. No hay descuento de cumpleaños definido, así que hoy no existe el
   incentivo para cambiarlo a voluntad; cuando se defina, ese cambio deberá
   revisar esta decisión.
5. **Teléfono: cualquier número chileno de 9 dígitos** (móvil o fijo, primer
   dígito 2 a 9), con o sin `+56`/`56`, espacios, guiones, puntos o paréntesis.
   Se guarda canónico, `+56` seguido de los 9 dígitos. Vacío está permitido: en
   el registro es opcional.
6. **Edición concurrente: gana la última escritura.** Es una persona editando
   sus propios datos; el peor caso es que una pestaña con el formulario viejo
   pise un cambio que ella misma hizo en otra. Tras guardar, el formulario se
   rellena con lo que devolvió la base, así que lo que ve es lo guardado.
7. **Cualquier cuenta con sesión usa la función para su propia fila**, no solo
   el rol `cliente`. Los tres campos son datos personales también para una
   profesional; impedírselo exigiría leer `rol` de una réplica para negar algo
   inocuo.
8. **Sin datos de demostración con sesión real.** La tarjeta de puntos y el
   botón «Eliminar mis imágenes» de `/perfil` salen del seed o no hacen nada;
   con la sesión real no se muestran (hoy tampoco los ve nadie: la página no
   abre).

## Alternativas descartadas

- **Recrear la política «Correccion del perfil propio» de 0010 tal cual.**
  Reabre el hallazgo que cerró 0017.
- **La política limitada que dejó esbozada 0017** (congelar `rol`, `email`,
  `profesional_id`, `creado_en` comparando con la fila guardada). Es una lista
  negra: cada columna nueva queda editable por la clienta si nadie se acuerda de
  sumarla, que es justo el fallo que 0017 advierte. Tampoco valida formatos.
- **`revoke update` + `grant update (nombre, telefono, fecha_nacimiento)`.**
  Descartado ya en 0017: clientela y personal comparten el rol `authenticated`,
  y el panel perdería la escritura de `rol`.
- **Escribir solo `user_metadata` con `auth.updateUser`.** El panel lee
  `perfiles` y el trigger no reacciona a `user_metadata` (decisión 2 de 0016),
  así que el personal seguiría viendo el dato viejo. Además no hay validación
  posible: `user_metadata` lo escribe la propia usuaria sin reglas.
- **Escribir `perfiles` por la función y después `user_metadata` desde el
  navegador.** Son dos escrituras sin transacción. Si la segunda falla, el
  encabezado muestra el dato viejo y, peor, un teléfono o cumpleaños borrados
  reaparecen en `perfiles` la próxima vez que el trigger corra por un cambio de
  correo (rellena lo vacío desde `user_metadata`).
- **Columna `apellido` nueva.** Obliga a partir los nombres ya guardados sin
  saber dónde cortar, y a cambiar registro, panel y trigger. Nadie lo pidió.
- **Bloqueo optimista (columna de versión y conflicto 409).** Agrega columna,
  parámetro y una pantalla de conflicto para un caso de una sola persona con dos
  pestañas.
- **Cumpleaños fijable una sola vez o solo si está vacío.** Deja sin salida un
  error de tipeo: el panel tampoco edita el cumpleaños.

## Fuera de alcance

- **Cambiar el correo o la contraseña.** Flujos de Supabase Auth con
  confirmación por correo; cambio propio.
- **Puntos y fidelidad reales.** Hoy salen de reservas del seed cruzadas por
  nombre. Necesita su propia definición.
- **Borrado de imágenes del análisis IA.** No existe el almacenamiento todavía.
- **Que el panel del personal edite el cumpleaños.** No se pidió.
- **Sincronizar `user_metadata` cuando el personal corrige un perfil desde el
  panel.** Ya pasa hoy (el panel escribe solo `perfiles`) y no lo empeora este
  cambio; queda anotado como riesgo.

## Capabilities

### New Capabilities
- `perfil-cliente`: lectura y corrección del perfil propio con sesión real.

### Modified Capabilities
- `cumpleanos-clientas`: «Rango válido ante escrituras directas» deja de decir
  que la clienta no modifica ninguna columna; ahora no las modifica *por
  UPDATE directo*, y sí por la función.

## Impact

- Base: una migración nueva (siguiente número libre; hoy `0020`). Aditiva: una
  función y sus privilegios. Sin columnas, sin políticas nuevas.
- Tipos: `Functions.actualizar_mi_perfil` en `frontend/src/shared/types/supabase.ts`.
- Frontend: `/perfil`, el destino de «Mi cuenta» en el encabezado, y la sesión
  refrescada tras guardar.
- Sin dependencias nuevas. Sin servicio Python.
