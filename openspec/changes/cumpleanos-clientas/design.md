# Design

## Contrato de datos (se fija antes que las tareas)

El mismo objeto en cada capa. No hay capa Python (`services/api/` no existe).

| Capa | Forma |
|---|---|
| Origen (ya existe) | `auth.users.raw_user_meta_data ->> 'fecha_nacimiento'`: texto `'YYYY-MM-DD'` o ausente. Clave = `META_FECHA_NACIMIENTO` de `auth.mapper.ts`. Lo escribe la propia usuaria: **no es confiable**. |
| SQL | `public.perfiles.fecha_nacimiento date null`, con check `fecha_nacimiento is null or fecha_nacimiento between date '1920-01-01' and current_date`. `null` = no lo declaró o lo declaró inválido. |
| PostgREST (JSON) | `"fecha_nacimiento": "1990-03-04"` o `"fecha_nacimiento": null`. Nunca con hora ni zona. |
| `supabase.ts` | `perfiles.Row.fecha_nacimiento: string \| null`; `Insert` y `Update`: `fecha_nacimiento?: string \| null`. |
| Dominio `Usuario` | `fechaNacimiento: string \| null`, `'YYYY-MM-DD'`. El mapper devuelve `null` si la columna no llega (`undefined`, base sin 0016), igual que hace hoy con `profesional_id`. |
| `DatosPerfil` (edición del panel) | **Sin cambios.** El panel no edita el cumpleaños, así que guardar un perfil no envía ni altera la columna. |

### Validación de la réplica (trigger y carga inicial, la misma regla)

El texto del metadato produce una fecha solo si se cumplen todas:

1. es un string JSON con formato exacto `^\d{4}-\d{2}-\d{2}$` (sin recortar
   espacios: el registro nunca los envía);
2. es una fecha de calendario existente (`1990-02-30` y `1990-13-01` no lo son);
3. está entre `1920-01-01` (= `FECHA_NACIMIENTO_MINIMA` del registro) y
   `current_date`, ambos incluidos.

En cualquier otro caso —ausente, número, objeto, cadena vacía, formato
distinto, fecha inexistente, futura, anterior a 1920— el valor es `null`. **La
evaluación nunca lanza error**: un cast directo de `'1990-02-30'::date` falla, y
dentro del trigger del alta eso tumbaría el registro entero.

`current_date` es la fecha UTC del servidor, que va hasta un día por delante de
Chile. La tolerancia resultante (aceptar «mañana en Chile» durante unas horas)
no tiene consecuencia práctica y evita depender de la zona de la sesión.

### Cuándo se escribe

| Momento | Comportamiento |
|---|---|
| Alta de cuenta (`after insert`) | Se guarda la fecha validada o `null`. |
| Cambio de correo o `app_metadata` (`after update`, columnas de 0010 sin cambios) | Si la fila ya tiene fecha, **se conserva**; si es `null`, se rellena con la validada. Mismo criterio que nombre y teléfono en 0010. |
| Cambio solo de `raw_user_meta_data` | El trigger no corre (decisión 2 de la propuesta). |
| Carga inicial de 0016 | Solo filas existentes con `fecha_nacimiento is null`, desde `auth.users`, con la misma regla. No inserta perfiles. Reejecutarla no cambia nada. |
| Escritura directa a `perfiles` por el personal | La rechaza el check si queda fuera de rango. |
| Escritura directa de la clienta sobre su fila | Desde 0017 no hay política de UPDATE propia: afecta 0 filas por RLS, sin error, y el check ni se evalúa. |

Redefinir `sincronizar_perfil()` obliga a reescribir la función entera: todo lo
que hace hoy (rol, correo, nombre, teléfono, ficha) debe seguir idéntico. El
rollback de 0016 restaura el cuerpo de 0010 y elimina la columna.

## Quién lee el dato

Sin políticas nuevas. Las de 0010 sobre `perfiles` ya dan exactamente lo pedido:

| Quién | Lee `fecha_nacimiento` | Por qué |
|---|---|---|
| Personal (`es_staff()` en `app_metadata`) | Todas las filas | «El personal gestiona los perfiles» |
| La propia persona con sesión | Solo la suya | «Lectura del perfil propio» |
| Profesional sin `es_staff` | Solo la suya | Ninguna política le da más |
| `anon` | Nada | `revoke all ... from anon` |

## Datos personales

- **Qué:** fecha de nacimiento declarada voluntariamente. No es biométrica.
- **Dónde:** `auth.users.raw_user_meta_data` (origen, ya existe) y
  `public.perfiles.fecha_nacimiento` (réplica).
- **Cuánto tiempo:** mientras exista la cuenta.
- **Quién lo lee:** tabla anterior. El panel muestra día y mes, no el año.
- **Cómo se borra:** eliminar la cuenta desde el panel (`admin-cuentas`
  → `deleteUser`) borra el origen y el perfil. No hay borrado del dato
  suelto manteniendo la cuenta: queda para el cambio que habilite editarlo.

## Cálculo del próximo cumpleaños (panel)

Entrada: `fechaNacimiento` y `hoy`, ambos `'YYYY-MM-DD'`; `hoy` es la fecha
**local** del navegador (`hoyISO()` de `shared/lib/calendario.ts`). Toda la
aritmética trabaja con fechas de calendario, como ya documenta ese módulo;
nunca con `new Date('YYYY-MM-DD')` (medianoche UTC, que en Chile es el día
anterior) ni con milisegundos divididos por 86 400 000 (los días de cambio de
horario de Chile duran 23 o 25 horas).

1. Candidato = mes y día del nacimiento en el año de `hoy`.
2. Si es 29 de febrero y ese año no es bisiesto, el candidato es el 28 de
   febrero.
3. Si el candidato es anterior a `hoy`, se repite 1–2 con el año siguiente.
4. `dias` = días de calendario entre `hoy` y el candidato (0 = hoy).

«Próximos cumpleaños» = cuentas con fecha y `0 <= dias <= 30`. La ventana de 30
días es un valor fijo, no configurable.

Textos: `dias = 0` → «Hoy»; `1` → «Mañana»; `n` → «en n días». El cumpleaños se
muestra como «4 de marzo» (el 29 de febrero se muestra «29 de febrero» aunque se
cuente desde el 28).

Reutilizar: `parseISODate`, `toISODate`, `esFechaISO`, `hoyISO`, `sumarDias`
(`shared/lib/format.ts`, `shared/lib/calendario.ts`); el filtro convive con
`FilterPills` y `CampoBusqueda` que la página ya usa.

## Decisión: 0017 retira la autoedición de `perfiles` (2026-10-08)

Hallazgo medio de `nv-rls-auditor`, heredado de 0010: la política «Correccion
del perfil propio» más el `grant update` de tabla entera dejaban que una
clienta reescribiera `rol`, `email`, `profesional_id`, `nombre`, `telefono` y
ahora `fecha_nacimiento` de su propia fila. No escalaba permisos
(`es_staff()` lee `app_metadata`), pero falseaba lo que el personal ve en el
panel: el cumpleaños que este cambio expone pasaría a ser editable a voluntad.

`0017_perfiles_sin_autoedicion.sql` borra esa política. Ningún código del
front actualiza `perfiles` con sesión de clienta; el panel escribe con «El
personal gestiona los perfiles», que no cambia. La lectura propia y la
sincronización `security definer` de 0010/0016 tampoco cambian.

*Descartado:* restringir el `grant update` por columnas. Clientela y personal
son el mismo rol `authenticated`, así que quitar `rol` del grant también se lo
quitaría al panel, que escribe `nombre`, `telefono` y `rol`.
