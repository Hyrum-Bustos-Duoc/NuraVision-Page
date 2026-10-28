# Design

## Contrato de datos (acordado antes de las tareas)

### SQL: `public.actualizar_mi_perfil`

```sql
public.actualizar_mi_perfil(
  p_nombre           text,
  p_telefono         text,
  p_fecha_nacimiento date
)
returns table (
  nombre           text,
  telefono         text,
  fecha_nacimiento date
)
language plpgsql
security definer
set search_path = public, pg_temp
```

- `revoke execute ... from public, anon;` `grant execute ... to authenticated;`
- Actúa **solo** sobre la fila `perfiles.id = auth.uid()`. No recibe id.
- Escribe **solo** `nombre`, `telefono`, `fecha_nacimiento`. Nunca `rol`,
  `email`, `profesional_id`, `creado_en` ni ninguna otra columna presente o
  futura.
- En la misma transacción, mezcla en `auth.users.raw_user_meta_data` de esa
  cuenta las claves `nombre`, `telefono` y `fecha_nacimiento` (esta última como
  string `'YYYY-MM-DD'` o JSON `null`), conservando las demás claves. No toca
  `raw_app_meta_data` ni `email`, así que no dispara `perfil_al_cambiar_cuenta`.
- Reemplazo completo de los tres campos en cada llamada (no es un parche).
- Devuelve exactamente una fila: los tres valores tal como quedaron guardados.

Normalización y validación, en este orden. Todos los rechazos son
`raise exception '<mensaje>' using errcode = 'P0001'` (convención de 0013) y no
modifican nada:

| Paso | Regla | Mensaje |
|---|---|---|
| 1 | `auth.uid()` es null | `Tu sesión expiró. Vuelve a iniciar sesión.` |
| 2 | `nombre := btrim(coalesce(p_nombre, ''))`; vacío | `Necesitamos tu nombre.` |
| 3 | `char_length(nombre) > 120` | `El nombre admite hasta 120 caracteres.` |
| 4 | `telefono := coalesce(p_telefono, '')`; distinto de `''` y no cumple `^\+56[2-9][0-9]{8}$` | `El teléfono debe ser un número chileno de 9 dígitos.` |
| 5 | `p_fecha_nacimiento` no null y fuera de `1920-01-01 .. current_date` | `La fecha de nacimiento no es válida.` |
| 6 | No existe fila de `perfiles` para `auth.uid()` (0 filas actualizadas) | `No encontramos tu perfil. Escríbenos para revisarlo.` |

- La base **no** normaliza el teléfono: recibe el canónico o `''`. Normalizar es
  del front (abajo); la base solo se niega a guardar algo que no sea canónico.
- Teléfono vacío se guarda como `''`, no `null`: mismo criterio que 0010
  (`telefono` puede ser NOT NULL en producción y no se puede comprobar desde el
  navegador).
- La función no inserta filas de `perfiles`: eso es del trigger de alta.
- Los mensajes 2 y 5 son idénticos a los de `registrar.usecase.ts` a propósito.

### TypeScript: `frontend/src/shared/types/supabase.ts`

```ts
Functions: {
  actualizar_mi_perfil: {
    Args: {
      p_nombre: string
      p_telefono: string
      p_fecha_nacimiento: string | null   // 'YYYY-MM-DD'
    }
    Returns: {
      nombre: string
      telefono: string                    // '' = sin teléfono
      fecha_nacimiento: string | null     // 'YYYY-MM-DD'
    }[]
  }
}
```

Mismo patrón que `crear_pedido`: `returns table` llega como arreglo y quien
llama toma la primera fila; arreglo vacío es un error («La base no confirmó el
cambio»), no un éxito.

### Dominio en el front

La pantalla trabaja con el `Usuario` que ya existe en `modules/usuarios`
(leído de la fila propia de `perfiles` con el mapper actual, que convierte `''`
en `null`). Lo que la pantalla envía es `{ nombre, telefono, fechaNacimiento }`.
`DatosPerfil` (la del panel, con `rol`) **no** se reutiliza para esto: incluye
`rol`, y el objeto que viaja desde la clienta no debe poder ni representarlo.

### Normalización del teléfono en el front

1. Quitar espacios, `-`, `.`, `(` y `)`.
2. Si empieza por `+56` u `56` y le quedan 11 dígitos tras quitar el `+`, quitar
   el `56`.
3. Debe quedar exactamente 9 dígitos con el primero entre 2 y 9. Si no, error
   en el campo con el mensaje de la tabla.
4. Se envía `+56` + los 9 dígitos. Campo vacío se envía `''`.

Ejemplos: `9 1234 5678`, `+56 9 1234-5678`, `56912345678`, `(2) 2345 6789` →
válidos. `12345678`, `+54 9 1234 5678`, `091234567`, `9123456789` → inválidos.

## Quién escribe qué, después de este cambio

| Quién | Cómo | Qué columnas de `perfiles` |
|---|---|---|
| La propia cuenta | `actualizar_mi_perfil` | `nombre`, `telefono`, `fecha_nacimiento` |
| La propia cuenta | UPDATE directo por PostgREST | Ninguna (0 filas, sin error; 0017 intacta) |
| Personal | «El personal gestiona los perfiles» (0010) | Sin cambios |
| Trigger de alta y de cambio de cuenta | `sincronizar_perfil()` | Sin cambios |

## Por qué la función escribe también `user_metadata`

El trigger de 0010/0016, al correr por un cambio de correo o de `app_metadata`,
rellena `telefono` (si es `''`) y `fecha_nacimiento` (si es `null`) desde
`user_metadata`. Si una clienta borra su teléfono solo en `perfiles`, el
siguiente cambio de correo se lo devuelve. Escribir las dos cosas en la misma
transacción es lo único que lo evita sin tocar el trigger.

Además, `ClientChrome`, `DashboardChrome` y la reserva (`BookingFlow`) leen el
nombre y el teléfono de la sesión (`user_metadata`). Tras guardar, el front
refresca la sesión y esas pantallas reciben el dato nuevo por la suscripción
que ya existe en `AuthProvider`.

**Supuesto a verificar (T1):** que el dueño de las funciones en el proyecto
pueda hacer `update auth.users set raw_user_meta_data = ...`. El trigger
`sincronizar_perfil()` ya es `security definer` sobre ese esquema, lo que hace
probable que sí. Si no fuera posible, nv-supabase se detiene y lo reporta: el
plan B (escritura desde el navegador) está descartado en `proposal.md` y
volver a él es decisión del usuario.

## Comportamiento de `/perfil`

- Sin sesión (ya resuelta la carga de la sesión): redirige a `/login`. Mientras
  la sesión carga, no redirige.
- Con sesión: estados **cargando**, **error** (mensaje y botón «Reintentar»),
  y **listo**. No existe estado «vacío»: si no hay fila de `perfiles`, es el
  error «No encontramos tu perfil».
- Campos: «Nombre y apellido» (máx. 120 caracteres contados como
  `char_length` de Postgres, es decir puntos de código; `maxLength` del input
  cuenta unidades UTF-16 y rechazaría antes de tiempo un nombre con emojis o
  caracteres fuera del plano básico), «Teléfono», «Cumpleaños» (el mismo
  `SelectorFecha` del registro, con su mínimo y máximo, y opción de dejarlo
  vacío), «Correo» bloqueado con el texto de la sesión.
- Validación antes de enviar, con las reglas y mensajes de la tabla, mostrada
  junto al campo. Un error de la base (P0001) se muestra con su mensaje; otro
  error, con un mensaje genérico. En ambos casos el formulario conserva lo
  escrito.
- Mientras guarda, el botón queda deshabilitado (no hay doble envío).
- Tras guardar: el formulario muestra lo que devolvió la función, toast
  «Perfil actualizado» y la sesión se refresca. Si refrescar la sesión falla,
  el guardado sigue siendo un éxito (ya está en la base); el encabezado se
  pondrá al día en el siguiente refresco de token.
- «Mi cuenta» en el encabezado lleva a `/perfil` con sesión real.

## Riesgos

- **El panel del personal sigue sin actualizar `user_metadata`.** Si el
  personal corrige un nombre, el encabezado de esa clienta muestra el viejo.
  Existía antes de este cambio.
- **Un teléfono antiguo guardado sin formato** (el registro nunca lo validó)
  impide guardar el formulario hasta que la clienta lo corrija o lo vacíe. Es el
  comportamiento buscado, pero lo verá quien entre por primera vez.
- **Última escritura gana**, también entre la clienta y el personal editando la
  misma fila a la vez.

## Preguntas abiertas

1. **¿El correo entra en «su información»?** Opciones: (a) fuera de este
   cambio, mostrado bloqueado; (b) editable aquí con `auth.updateUser({ email })`
   y su confirmación. **Recomendación: (a).** No bloquea ninguna tarea: si se
   elige (b), es un cambio aparte que no toca la función.
