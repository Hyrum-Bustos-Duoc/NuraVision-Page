-- ============================================================================
-- NuraVision · 0008 · Cuentas de acceso para las 8 profesionales
-- ============================================================================
-- Las politicas 0006 y 0007 deciden quien ve que a partir de `app_metadata`,
-- pero hasta ahora nadie tenia esa marca puesta: el panel de profesional solo
-- funcionaba eligiendo una ficha a mano en el navegador, que no da permisos.
-- Este script crea las cuentas y declara el vinculo, que es lo que hace que
-- 0007 empiece a devolver filas.
--
-- ----------------------------------------------------------------------------
-- OJO: ESTO NO ES UNA MIGRACION DE ESQUEMA, SON DATOS
-- ----------------------------------------------------------------------------
-- No crea ni altera tablas: inserta personas. Se guarda aqui por continuidad
-- con el resto del historial, pero conviene tenerlo presente porque:
--
--   · Hay que ejecutarlo con la service_role key (el editor SQL del panel de
--     Supabase ya lo hace). Con la anon key falla: `auth.users` no es publica.
--   · Es idempotente: cada cuenta se salta si ya existe ese correo. Volver a
--     correrlo NO reescribe contrasenias ni vinculos.
--
-- ----------------------------------------------------------------------------
-- ESCRIBIR EN auth.users A MANO NO ES EL CAMINO RECOMENDADO
-- ----------------------------------------------------------------------------
-- Supabase recomienda crear cuentas por la API de administracion
-- (`auth.admin.createUser`), que es la que conoce el formato exacto que espera
-- GoTrue. Insertar aqui directamente funciona —es lo que se pidio y lo que
-- hacen la mayoria de los seeds— pero queda acoplado a la forma interna del
-- esquema `auth`, que Supabase puede cambiar sin avisar. Si tras una
-- actualizacion estas cuentas dejaran de poder entrar, la causa mas probable
-- es esa, y la solucion es recrearlas por la API.
--
-- Por eso se rellenan explicitamente columnas que uno esperaria dejar en NULL
-- (`confirmation_token`, `recovery_token`, ...): GoTrue las lee como texto y
-- un NULL le provoca un error al iniciar sesion, no un login fallido.
--
-- ----------------------------------------------------------------------------
-- LAS CONTRASENIAS DE ESTE ARCHIVO SON PROVISIONALES
-- ----------------------------------------------------------------------------
-- Son el primer nombre en minusculas + 123, segun se pidio. Hay que decirlo
-- claro: se deducen de un dato publico —el nombre aparece en la portada del
-- sitio— y quedan versionadas en el repositorio, asi que cualquiera con acceso
-- al codigo puede entrar como cualquiera del equipo.
--
-- Sirven para el primer inicio de sesion y nada mas. Antes de que esto toque
-- produccion, cada profesional tiene que cambiar la suya, y lo prudente es
-- rotarlas todas el dia que el repositorio deje de ser privado.
-- ============================================================================

-- `crypt` y `gen_salt` vienen de pgcrypto, que en Supabase vive en el esquema
-- `extensions`. Se agrega al search_path en vez de calificar cada llamada para
-- que el script siga sirviendo en una base donde la extension este en `public`.
set search_path = public, extensions, pg_temp;

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Las 8 cuentas
-- ----------------------------------------------------------------------------
-- Los `profesional_id` NO son inventados: salen de consultar la tabla real
--
--   select id, nombre from public.profesionales order by id;
--
-- y hoy son 1..8 en el orden del seed. Si alguien recrea la tabla, la secuencia
-- entrega otros valores y esta lista deja de corresponder: es el unico bloque
-- que hay que revisar antes de ejecutar.
--
-- LOS CORREOS SIGUEN LA CONVENCION DEL PROTOTIPO (`@estudionura.cl`), porque
-- `profesionales` no tiene columna de email y no habia de donde sacarlos. Si el
-- estudio usa otro dominio o cada una tiene su correo personal, cambialos aqui
-- ANTES de ejecutar: el correo es con lo que van a entrar, y corregirlo despues
-- implica borrar la cuenta y volver a crearla.
with nuevas (profesional_id, email, password) as (
  values
    (1::bigint, 'berenice@estudionura.cl',  'berenice123'),
    (2::bigint, 'nicol@estudionura.cl',     'nicol123'),
    (3::bigint, 'viviana@estudionura.cl',   'viviana123'),
    (4::bigint, 'dominique@estudionura.cl', 'dominique123'),
    (5::bigint, 'nashtia@estudionura.cl',   'nashtia123'),
    (6::bigint, 'barbara@estudionura.cl',   'barbara123'),
    (7::bigint, 'tiare@estudionura.cl',     'tiare123'),
    (8::bigint, 'paula@estudionura.cl',     'paula123')
),

-- ----------------------------------------------------------------------------
-- Alta en auth.users
-- ----------------------------------------------------------------------------
-- `email_confirmed_at` va puesto a proposito: sin el, GoTrue responde "Email
-- not confirmed" y no deja entrar. Nadie va a recibir el correo de
-- confirmacion de una cuenta creada por SQL, asi que se da por confirmada.
--
-- `raw_app_meta_data` lleva el vinculo con la ficha. Va aqui y no en
-- `raw_user_meta_data` porque este ultimo lo puede editar cualquiera con su
-- propia sesion: si el vinculo viviera ahi, una clienta podria asignarse una
-- ficha y leer la agenda de otra persona.
--
-- NO se marca `es_staff`. Con 0007 cada profesional ya lee las horas que
-- atiende; `es_staff` le abriria las de TODO el estudio, que es mucho mas de lo
-- que necesita.
--
-- El `where not exists` es lo que hace el script repetible. Se comprueba asi y
-- no con `on conflict` porque la unicidad del correo en `auth.users` es un
-- indice parcial (solo para cuentas que no vienen de SSO), y `on conflict`
-- exigiria repetir ese predicado.
creadas as (
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    -- Columnas de texto que GoTrue lee sin tolerar NULL.
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    n.email,
    -- bcrypt, que es lo que GoTrue espera encontrar en esta columna.
    crypt(n.password, gen_salt('bf')),
    now(),
    jsonb_build_object(
      'provider',       'email',
      'providers',      jsonb_build_array('email'),
      'profesional_id', n.profesional_id
    ),
    '{}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  from nuevas n
  where not exists (
    select 1 from auth.users u where u.email = n.email
  )
  returning id, email
)

-- ----------------------------------------------------------------------------
-- Identidad del proveedor "email"
-- ----------------------------------------------------------------------------
-- Una fila en `auth.users` sin su identidad es una cuenta a medias: es lo que
-- crea la API de administracion y lo que GoTrue espera para resolver el
-- proveedor. `identity_data` tiene que traer `sub` con el uuid del usuario, que
-- es el campo por el que GoTrue cruza las dos tablas.
--
-- Se alimenta del `returning` de arriba, asi que solo se crean identidades para
-- las cuentas que esta ejecucion acaba de dar de alta.
insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  -- Para el proveedor de correo, GoTrue usa el propio correo como id.
  c.email,
  c.id,
  jsonb_build_object('sub', c.id::text, 'email', c.email),
  'email',
  null,
  now(),
  now()
from creadas c;

-- ----------------------------------------------------------------------------
-- La cuenta principal: personal del estudio + ficha
-- ----------------------------------------------------------------------------
-- Se fusiona con `||` en vez de reemplazar el objeto completo: dentro de
-- `raw_app_meta_data` ya viven `provider` y `providers`, y pisarlos dejaria la
-- cuenta sin proveedor declarado.
--
-- OJO: `profesional_id: 1` es la ficha de Berenice, que ademas tiene su propia
-- cuenta (arriba). Dos cuentas apuntando a la misma ficha no rompe nada —ambas
-- leeran las mismas reservas por 0007— pero no es un vinculo real: si esta
-- cuenta es de administracion y no atiende, `es_staff` sola alcanza y lo limpio
-- seria no ponerle `profesional_id`. Se deja porque se pidio explicitamente, y
-- sirve para entrar a /profesional con datos reales.
update auth.users
set
  raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                      || '{"es_staff": true, "profesional_id": 1}'::jsonb,
  updated_at = now()
where email = 'oskarbastias1@gmail.com';

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- El UPDATE de arriba no falla si la cuenta no existe: no hace nada, en
-- silencio. Esta consulta es la que lo delata, y de paso confirma que cada
-- cuenta quedo con su identidad y su vinculo.
--
-- Tiene que devolver 9 filas, todas con `identidades = 1` y con `ficha` puesta.
-- Si falta la fila de oskarbastias1@gmail.com, esa cuenta todavia no existe:
-- hay que registrarla desde la aplicacion y volver a correr solo el UPDATE.
select
  u.email,
  u.raw_app_meta_data ->> 'profesional_id'          as profesional_id,
  p.nombre                                          as ficha,
  coalesce(u.raw_app_meta_data ->> 'es_staff', '-') as es_staff,
  (u.email_confirmed_at is not null)                as correo_confirmado,
  (select count(*) from auth.identities i where i.user_id = u.id) as identidades
from auth.users u
left join public.profesionales p
  on p.id::text = u.raw_app_meta_data ->> 'profesional_id'
where u.email like '%@estudionura.cl'
   or u.email = 'oskarbastias1@gmail.com'
order by u.email;

-- ----------------------------------------------------------------------------
-- Despues de ejecutar
-- ----------------------------------------------------------------------------
-- El JWT se emite al iniciar sesion, asi que estas marcas NO aparecen en una
-- sesion ya abierta. Hay que cerrar sesion y volver a entrar; hasta entonces el
-- panel sigue pidiendo elegir ficha a mano.
