# Proposal

## Why

El estudio quiere saludar a sus clientas en su cumpleaños y, si así lo decide,
ofrecerles un descuento. Para eso el personal tiene que saber **quién está de
cumpleaños y cuándo**. Hoy no puede: el registro ya pide el cumpleaños
(opcional) y lo guarda en `auth.users.raw_user_meta_data.fecha_nacimiento`
(`'YYYY-MM-DD'`), pero el navegador del personal no puede leer `auth.users`, y
el trigger `sincronizar_perfil()` de 0010 copia a `public.perfiles` el nombre y
el teléfono, no la fecha. El dato existe y nadie del estudio lo ve.

Además, una fecha suelta en una tabla no resuelve el propósito: el personal
necesita saber a quién saludar en los próximos días sin calcularlo a mano.

## What Changes

- `perfiles` gana la columna `fecha_nacimiento` (`date`, nullable), réplica del
  metadato del registro, como ya lo son `email` y `profesional_id`.
- El trigger del alta la copia **validándola**: `user_metadata` lo escribe la
  propia usuaria, así que una fecha mal formada, inexistente, futura o anterior
  a 1920-01-01 se guarda como `null` **sin hacer fallar el alta**.
- Una sola carga inicial rellena la columna en las cuentas que ya existen.
- El panel de usuarios muestra el cumpleaños (día y mes) de cada cuenta y un
  filtro **«Próximos cumpleaños»**: las cuentas que cumplen en los próximos 30
  días, ordenadas por los días que faltan («Hoy», «Mañana», «en N días»).
- Nadie nuevo puede leer el dato: la RLS de `perfiles` (0010) ya limita la
  lectura al personal y a la propia persona.
- `0017` retira la política de 0010 que dejaba a una clienta reescribir su
  propia fila de `perfiles` (incluido el cumpleaños). El cumpleaños solo llega
  desde el registro o lo escribe el personal (ver decisión 6).

## Decisiones (2026-10-08)

1. **Réplica en `perfiles`, no lectura de `auth.users`.** Mismo patrón que el
   correo en 0010 y por el mismo motivo: `auth.users` exige la service_role key.
2. **No se resincroniza al cambiar `user_metadata`.** Hoy ninguna pantalla
   edita el cumpleaños tras el registro (`Profile.tsx` solo muestra un toast y
   trabaja sobre el estado local de `AppState`, no sobre la cuenta real). Si el
   trigger vuelve a correr por un cambio de correo o de `app_metadata`, la fecha
   se rellena si falta y **no se pisa** si ya existe: el mismo criterio que 0010
   aplica a nombre y teléfono.
3. **29 de febrero en años no bisiestos se celebra el 28 de febrero.** Se queda
   dentro de su mes, igual que `fechaDesdePartes` en `shared/lib/calendario.ts`.
4. **El panel muestra día y mes, no el año ni la edad.** El propósito es el
   saludo; la edad no se pidió y es el dato más sensible de los tres.
5. **«Hoy» es la fecha local del navegador** (Chile para el estudio), nunca UTC.
6. **La clienta no edita su fila de `perfiles` (0017).** Hallazgo medio heredado
   de 0010: podía reescribir `rol`, `email`, `profesional_id` y
   `fecha_nacimiento`; no escalaba permisos, pero falseaba lo que ve el personal.
   *Descartado:* grant por columnas, porque clientela y personal comparten el rol
   `authenticated` y el panel perdería la escritura de `rol`.
7. **Contador y etiqueta del filtro (coordinador).** «Próximos cumpleaños (n)»
   cuenta con el rol y la búsqueda vigentes, para no contradecir el mensaje
   vacío; la etiqueta de días se ve en las filas de la ventana aunque el filtro
   esté apagado.

## Alternativas descartadas

- **Leer el cumpleaños desde `auth.users` con una Edge Function.** Sirve, pero
  agrega una llamada con service_role a cada carga del panel para un dato que
  0010 ya resolvió con réplica.
- **Agregar `raw_user_meta_data` a las columnas del trigger de actualización.**
  Sin pantalla que edite el cumpleaños no hay caso que lo necesite, y haría que
  cualquier escritura de metadatos de la usuaria pudiera tocar `perfiles`.
- **Filtro «Cumplen este mes».** A fin de mes muestra casi solo cumpleaños ya
  pasados, cuando el personal necesita preparar el saludo con antelación.
- **Rechazar la fecha inválida con error en el alta.** Una usuaria que manipula
  su metadato se quedaría sin cuenta por un dato opcional.

## Fuera de alcance

- **Envío automático de saludos o cupones por correo.** No hay infraestructura
  de correos programados (la única Edge Function de correo es la confirmación de
  reservas) y el dueño no ha definido texto ni condiciones.
- **Descuento automático de cumpleaños en reservas o tienda.** Sin regla de
  negocio definida (monto, vigencia, quién lo aplica).
- **Editar el cumpleaños después del registro**, por la clienta o por el
  personal. `Profile.tsx` no está conectado a la cuenta real; conectarlo es un
  cambio propio que deberá decidir la fuente de verdad del dato.
- **Pedir el cumpleaños a cuentas creadas desde el panel** (`admin-cuentas`).
  No se pidió; esas cuentas quedan con `null`.

## Capabilities

### New Capabilities
- `cumpleanos-clientas`: réplica validada del cumpleaños en `perfiles`, su
  lectura restringida y su uso en el panel de usuarios.

### Modified Capabilities
<!-- openspec/specs/ está vacío: no hay specs previas que modificar. -->

## Impact

- Base: migración `0016` (la `0015` es `abono-servicios-unas`, en curso).
  Aditiva: una columna, el trigger redefinido y una carga inicial.
  Migración `0017`: borra la política «Correccion del perfil propio».
- Tipos: `perfiles` en `frontend/src/shared/types/supabase.ts`.
- Frontend: módulo `usuarios` (dominio y mapper) y `pages/admin/AdminUsers.tsx`.
- Sin dependencias nuevas. Sin servicio Python.
