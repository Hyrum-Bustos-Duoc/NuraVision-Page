# Base de datos

Todo lo necesario para levantar la base de NuraVision desde cero. Si clonas el
repo y sigues esta guía, vas a terminar con la misma estructura que espera el
frontend y con datos de ejemplo para recorrer el flujo de reserva completo.

## Qué hay aquí

| Archivo | Qué hace |
| --- | --- |
| `migrations/0001_esquema_inicial.sql` | Crea las 4 tablas del catálogo, con claves e índices. |
| `migrations/0002_rls.sql` | Activa Row Level Security y abre la lectura pública de esas 4. |
| `migrations/0003_reservas.sql` | Crea `reservas` y permite reservar sin cuenta. **Empieza con un `DROP TABLE`.** |
| `migrations/0004_auth_reservas_policy.sql` | Deja que cada persona lea sus propias reservas, con Supabase Auth. |
| `seed.sql` | Carga el catálogo y el equipo reales. Opcional, pero recomendado. |

El contrato de nombres y tipos de columna vive en
[`frontend/src/shared/types/supabase.ts`](../frontend/src/shared/types/supabase.ts).
Si cambias una columna aquí, tienes que cambiarla allí: de ese archivo sale el
tipado del cliente de Supabase.

## Paso 1 · Crear el proyecto

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) y crea un
   proyecto nuevo.
2. Elige una contraseña para la base de datos y guárdala donde corresponda. No
   va en el repo.
3. Espera a que el proyecto termine de aprovisionarse (uno o dos minutos).

## Paso 2 · Aplicar el esquema

Dos caminos. Si es tu primera vez, usa el dashboard.

### Opción A · Dashboard (sin instalar nada)

En el menú lateral, **SQL Editor** → **New query**. Luego, **en este orden**:

1. Pega el contenido completo de `migrations/0001_esquema_inicial.sql` y dale
   **Run**.
2. Nueva query: pega `migrations/0002_rls.sql` y **Run**.
3. Nueva query: pega `migrations/0003_reservas.sql` y **Run**.
4. Nueva query: pega `migrations/0004_auth_reservas_policy.sql` y **Run**.
5. Nueva query: pega `seed.sql` y **Run**. Al final te devuelve un recuento de
   filas por tabla.

El orden importa: 0002 referencia las tablas que crea 0001, 0003 apunta con
claves foráneas a esas mismas tablas, 0004 modifica las políticas que crea
0003, y el seed necesita el catálogo ya creado.

> **Ojo con 0003 en una base que ya está en uso.** Empieza con
> `drop table if exists public.reservas cascade`, así que borra las reservas
> que hubiera. Es lo que permite reaplicarla, pero respáldalas antes si te
> importan.

## Paso 2b · Activar Supabase Auth

`0004` solo sirve de algo si hay sesiones. En **Authentication → Providers**,
deja habilitado **Email**. Para probar en local conviene desactivar
*Confirm email* (en **Authentication → Sign In / Providers → Email**): con la
confirmación activa, al registrarte la cuenta se crea pero no se abre sesión,
y la aplicación te lo dice en vez de dejarte entrar.

### Opción B · CLI de Supabase

```bash
npm install -g supabase
supabase login
supabase link --project-ref <tu-project-ref>   # está en la URL del dashboard
supabase db push                               # aplica migrations/ en orden
```

Para cargar los datos de ejemplo:

```bash
supabase db reset   # recrea la base desde migrations/ y aplica seed.sql
```

> `db reset` **borra** la base remota y la reconstruye. En un proyecto de
> desarrollo es justo lo que quieres; en cualquier otro, no lo ejecutes.

## Paso 3 · Conectar el frontend

Necesitas dos valores del dashboard. Ve a **Project Settings** (el engranaje) →
**API**:

- **Project URL** → va en `VITE_SUPABASE_URL`.
  Se ve así: `https://abcdefghijklm.supabase.co`
- **API Keys** → copia la clave **pública**. Según la antigüedad del proyecto
  aparece como `anon` `public` (un JWT largo que empieza con `eyJ…`) o como
  **Publishable key** (empieza con `sb_publishable_…`). Cualquiera de las dos
  sirve; va en `VITE_SUPABASE_ANON_KEY`.

Después, desde `frontend/`:

```bash
cp .env.example .env.local
# edita .env.local y pega tus dos valores
npm install
npm run dev
```

### Dos errores que cuestan tiempo

**La URL va sin sufijo de ruta.** Tiene que ser
`https://<proyecto>.supabase.co`, **no** `https://<proyecto>.supabase.co/rest/v1/`.
La librería agrega `/rest/v1/` por su cuenta; si lo incluyes, todas las
consultas fallan con `Invalid path specified in request URL`.

**No te saltes `0002_rls.sql`.** Con RLS activado y sin políticas, las
consultas no dan error: devuelven cero filas. La app carga, se ve vacía y no
hay nada en la consola que lo explique. Si la app no muestra datos, esto es lo
primero que hay que revisar.

## Seguridad

La anon key es **pública por diseño**: viaja dentro del bundle de JavaScript y
cualquiera puede extraerla del navegador. Eso no es una filtración, es cómo
funciona. Quien protege los datos son las políticas de RLS, no la clave.

Por eso `0002_rls.sql` abre **solo SELECT**, y solo sobre las cuatro tablas del
catálogo: son datos públicos (servicios, equipo, horarios) y no hay nada que
proteger ahí.

`reservas` sí tiene datos de personas, y se trata distinto:

- **INSERT abierto** (`0003`), porque reservar no exige cuenta. Se acota lo que
  se puede: el estado se fuerza a `pendiente` —nadie se auto-confirma una
  hora—, el nombre y el correo son obligatorios, y desde `0004` la reserva solo
  puede quedar sin dueño o a nombre de quien la crea.
- **SELECT solo de lo propio** (`0004`): `cliente_id = auth.uid()`. Sin sesión
  no se lee nada. Es lo que impide que cualquiera con la anon key se lleve el
  teléfono y el correo de toda la clientela.
- **Ni UPDATE ni DELETE para nadie.** Cancelar y reprogramar todavía no están
  implementados contra la base.

Una reserva hecha sin cuenta queda con `cliente_id` NULL, así que **ninguna
política la devuelve**: ni a su autora. Su único vínculo con ella es el código
que se le muestra al confirmar.

La **`service_role` key** salta todas las políticas de RLS. Nunca va en el
repo, ni en `.env.local`, ni en ninguna variable `VITE_*` (todo lo que empieza
con `VITE_` termina dentro del bundle). Es solo para backend.

`.env.local` está cubierto por `*.local` en `frontend/.gitignore`. El archivo
versionado es `.env.example`, y va con los valores vacíos.

## El esquema

```
servicios                       profesionales
  id            bigint  PK        id            bigint  PK
  nombre        text              nombre        text
  categoria     text NULL         especialidad  text
  descripcion   text NULL         avatar_url    text NULL
  duracion_min… integer           activo        boolean
  precio_base   numeric           created_at    timestamptz
  activo        boolean
       ▲                                ▲
       │                                │
       └────────┐              ┌────────┴──────────┐
                │              │                   │
        profesional_servicios              disponibilidad
          profesional_id  FK ──┘             id             bigint PK
          servicio_id     FK ───┐            profesional_id FK
          PK (profesional_id,   │            dia_semana     integer
              servicio_id)      │            hora_inicio    time
                                │            hora_fin       time
                                ▼
                            servicios
```

### Detalles que conviene saber

**`dia_semana` es 0 = domingo … 6 = sábado**, el mismo índice que
`Date.getDay()` en JavaScript. El frontend lo asume en `DIA_SEMANA_BASE`
([`disponibilidad.mapper.ts`](../frontend/src/modules/profesionales/infrastructure/disponibilidad.mapper.ts)).
Si cambias la convención en la base, cámbiala también ahí o todos los horarios
quedarán corridos un día.

**Un día puede tener varios bloques de disponibilidad.** El hueco entre dos
bloques consecutivos se interpreta como colación: `10:00-13:00` más
`14:00-19:00` se muestra como jornada de 10 a 19 con pausa de 13 a 14.

**`categoria` es texto libre.** El frontend la normaliza (minúsculas, sin
tildes) y acepta tanto los ids del dominio (`unas`, `cabello`, `piel`,
`diagnostico`) como variantes de presentación (`Uñas`, `Estilismo`,
`Estética`). Si viene `NULL` o no se reconoce, cae en una categoría por defecto
y deja un aviso en la consola.

**`profesional_servicios.profesional_id` es `bigint`.** En el proyecto original
era `uuid` mientras `profesionales.id` era `bigint`: los tipos no cruzaban y
preguntar quién realiza un servicio respondía
`invalid input syntax for type uuid`. Aquí queda alineada con la tabla padre y
con clave foránea declarada.

**El filtro de `activo` no está en las políticas de RLS**, está en las
consultas. Es deliberado: el panel de administración necesita ver los
inactivos, y «mis reservas» tiene que poder mostrar el nombre de un servicio
dado de baja.

## Verificar que quedó bien

En el **SQL Editor**:

```sql
-- Deben aparecer las 4 tablas, todas con rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Deben aparecer 4 políticas, todas de tipo SELECT
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename;
```

Y desde el navegador, con la app corriendo: si `/servicios` muestra el catálogo,
la cadena completa —credenciales, RLS y datos— está funcionando.
