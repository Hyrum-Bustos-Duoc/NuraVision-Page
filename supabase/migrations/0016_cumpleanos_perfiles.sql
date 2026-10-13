-- ============================================================================
-- NuraVision · 0016 · Cumpleaños de las clientas en perfiles
-- ============================================================================
-- Contrato en openspec/changes/cumpleanos-clientas/ (decisiones del 2026-10-08).
--
-- El registro ya pide el cumpleaños (opcional) y lo guarda en
-- `auth.users.raw_user_meta_data.fecha_nacimiento` ('YYYY-MM-DD'), pero el
-- navegador del personal no puede leer `auth.users`. Igual que el correo en
-- 0010, se replica en `perfiles`.
--
-- Aditiva: una columna nullable, una funcion auxiliar, el cuerpo del trigger de
-- 0010 redefinido y una carga inicial. NO cambia politicas ni privilegios de
-- `perfiles`: las de 0010 ya limitan la lectura al personal y a la propia
-- persona, que es exactamente quien debe ver el dato.
--
-- Sin `if not exists` a proposito, como 0015: si la columna ya existe es que
-- alguien aplico esto a mano, y conviene que falle.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- perfiles.fecha_nacimiento
-- ----------------------------------------------------------------------------
-- Nullable: el dato es opcional en el registro, y `null` tambien significa "lo
-- declaro, pero era invalido" (no se distingue: el panel muestra lo mismo).
--
-- El check cubre las escrituras directas que 0010 permite (el personal y la
-- propia persona pueden hacer UPDATE de su fila). `current_date` en un check es
-- legal en Postgres aunque no sea inmutable; aqui no da problemas porque una
-- fecha valida hoy sigue siendolo mañana (el limite solo se ensancha). 1920-01-01
-- es `FECHA_NACIMIENTO_MINIMA` del formulario de registro.
alter table public.perfiles
  add column fecha_nacimiento date
    constraint perfiles_fecha_nacimiento_rango
      check (fecha_nacimiento is null
             or fecha_nacimiento between date '1920-01-01' and current_date);

comment on column public.perfiles.fecha_nacimiento is
  'Replica VALIDADA de auth.users.raw_user_meta_data.fecha_nacimiento, que '
  'escribe la propia usuaria. null = no la declaro o era invalida. La copia el '
  'trigger sincronizar_perfil() en el alta; despues solo rellena si es null, '
  'nunca pisa. Un cambio solo de user_metadata no la toca.';

-- ----------------------------------------------------------------------------
-- La regla de validacion, en un solo sitio
-- ----------------------------------------------------------------------------
-- La usan el trigger y la carga inicial; tenerla escrita dos veces es como
-- terminan discrepando.
--
-- POR QUE plpgsql CON IF ENCADENADOS Y NO UN CASE EN SQL: la funcion corre
-- dentro del trigger del alta, y cualquier error ahi tumba el registro entero.
--   · `'1990-02-30'::date` lanza 22008, y `make_date(1990, 2, 30)` tambien.
--   · Un CASE que proteja el cast no basta: el planificador puede plegar
--     constantes de una rama no tomada (plpgsql sustituye parametros por
--     constantes en los planes personalizados) y evaluar el cast igual.
--   · `pg_input_is_valid` solo existe desde Postgres 16.
-- Con IF, cada paso se evalua por separado y solo si el anterior paso: ninguna
-- expresion de abajo puede fallar con lo que dejaron pasar las de arriba.
--
-- `[0-9]` y no `\d`: segun la configuracion regional, `\d` acepta digitos no
-- ASCII que el cast a integer de la linea siguiente no entenderia.
--
-- Recibe el jsonb de metadatos entero para poder exigir que el valor sea un
-- string JSON: `->>` convertiria el numero 19900304 en el texto '19900304'.
create function public.fecha_nacimiento_de_metadatos(p_meta jsonb)
  returns date
  language plpgsql
  stable
  set search_path = pg_catalog, pg_temp
as $$
declare
  v_texto text;
  v_anio  integer;
  v_mes   integer;
  v_dia   integer;
  v_fecha date;
begin
  -- Ausente, null JSON, numero, objeto, lista: todo lo que no sea string.
  if jsonb_typeof(p_meta -> 'fecha_nacimiento') is distinct from 'string' then
    return null;
  end if;

  v_texto := p_meta ->> 'fecha_nacimiento';

  -- Formato exacto, sin recortar espacios (el registro nunca los envia).
  -- Rechaza '', '1990-3-4', '04-03-1990' y '1990-03-04T00:00:00Z'.
  if v_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;

  -- Con el regex de arriba, estos tres casts no pueden fallar.
  v_anio := substr(v_texto, 1, 4)::integer;
  v_mes  := substr(v_texto, 6, 2)::integer;
  v_dia  := substr(v_texto, 9, 2)::integer;

  -- El año acotado por abajo deja fuera el año 0 (que make_date rechaza); por
  -- arriba el regex ya lo limita a 9999.
  if v_anio < 1920 or v_mes not between 1 and 12 or v_dia < 1 then
    return null;
  end if;

  -- Dia existente en ese mes: con año >= 1920 y mes 1..12, el dia 1 siempre
  -- existe, y la resta da los dias del mes (bisiestos incluidos).
  if v_dia > (make_date(v_anio, v_mes, 1) + interval '1 month')::date
             - make_date(v_anio, v_mes, 1) then
    return null;
  end if;

  v_fecha := make_date(v_anio, v_mes, v_dia);

  -- `current_date` del servidor (UTC): hasta un dia por delante de Chile. La
  -- tolerancia no tiene efecto practico (design.md).
  if v_fecha > current_date then
    return null;
  end if;

  return v_fecha;
end;
$$;

comment on function public.fecha_nacimiento_de_metadatos(jsonb) is
  'Fecha de nacimiento validada desde raw_user_meta_data: string YYYY-MM-DD, '
  'fecha real, entre 1920-01-01 y current_date; si no, null. Nunca lanza error.';

-- No es una API: solo la llaman el trigger (security definer, corre como su
-- dueño) y esta migracion. Sin el revoke, Supabase la expondria como RPC a
-- `anon` y `authenticated` por sus privilegios por defecto.
revoke execute on function public.fecha_nacimiento_de_metadatos(jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- sincronizar_perfil(), redefinida
-- ----------------------------------------------------------------------------
-- Cuerpo IDENTICO al de 0010 salvo la columna `fecha_nacimiento` en el insert y
-- en el `on conflict`. Los comentarios de 0010 explican cada decision del resto
-- y no se repiten aqui.
--
-- Los triggers `perfil_al_crear_cuenta` (after insert) y
-- `perfil_al_cambiar_cuenta` (after update of email, raw_app_meta_data) NO se
-- recrean: apuntan a la funcion por nombre y `create or replace` conserva dueño,
-- privilegios y triggers. No recrearlos es la forma de garantizar que sus
-- columnas no cambian; `raw_user_meta_data` sigue fuera (decision 2 de la
-- propuesta).
create or replace function public.sincronizar_perfil()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_rol public.usuario_rol;
begin
  v_rol := case
    when lower(coalesce(new.raw_app_meta_data ->> 'es_staff', '')) in ('true', 't', '1')
      then 'admin'::public.usuario_rol
    when coalesce(new.raw_app_meta_data ->> 'profesional_id', '') ~ '^[0-9]+$'
      then 'profesional'::public.usuario_rol
    else 'cliente'::public.usuario_rol
  end;

  insert into public.perfiles as p
    (id, nombre, telefono, email, rol, profesional_id, fecha_nacimiento)
  values (
    new.id,
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nombre', '')), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Sin nombre'
    ),
    coalesce(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'telefono', '')), ''), ''),
    coalesce(new.email, ''),
    v_rol,
    case
      when coalesce(new.raw_app_meta_data ->> 'profesional_id', '') ~ '^[0-9]+$'
        then (new.raw_app_meta_data ->> 'profesional_id')::bigint
      else null
    end,
    public.fecha_nacimiento_de_metadatos(new.raw_user_meta_data)
  )
  on conflict (id) do update
  set
    email          = excluded.email,
    rol            = excluded.rol,
    profesional_id = excluded.profesional_id,
    nombre   = coalesce(nullif(btrim(p.nombre), ''), excluded.nombre),
    telefono = coalesce(nullif(btrim(p.telefono), ''), excluded.telefono),
    -- Mismo criterio que nombre y telefono: lo ya guardado no se pisa. Aqui
    -- "vacio" es NULL (la columna es nullable), de ahi el coalesce directo.
    fecha_nacimiento = coalesce(p.fecha_nacimiento, excluded.fecha_nacimiento);

  return new;
end;
$$;

comment on function public.sincronizar_perfil() is
  'Crea o refresca la fila de perfiles al darse de alta una cuenta o al cambiar '
  'su correo o sus metadatos de rol.';

-- ----------------------------------------------------------------------------
-- Carga inicial
-- ----------------------------------------------------------------------------
-- Solo filas existentes y solo si estan en null: no inserta perfiles (eso lo
-- hizo 0010), no toca otras columnas, y reejecutarla no cambia nada. Una sola
-- sentencia: son decenas de cuentas, no hace falta ir por lotes.
--
-- Un UPDATE de `perfiles` no dispara los triggers de `auth.users`.
update public.perfiles p
set fecha_nacimiento = public.fecha_nacimiento_de_metadatos(u.raw_user_meta_data)
from auth.users u
where u.id = p.id
  and p.fecha_nacimiento is null
  and public.fecha_nacimiento_de_metadatos(u.raw_user_meta_data) is not null;

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- `perfiles` = numero de cuentas (no cambia con esta migracion);
-- `con_cumpleanos` = las que lo declararon con una fecha valida.
select count(*) as perfiles, count(fecha_nacimiento) as con_cumpleanos
from public.perfiles;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Rollback (no se ejecuta; copiar a mano si hace falta revertir)
-- ----------------------------------------------------------------------------
-- ⚠ Destructivo solo para la replica: el origen sigue en auth.users, y volver a
-- aplicar 0016 la reconstruye con la carga inicial.
--
-- Antes de revertir, el frontend tiene que tolerar la columna ausente (el
-- mapper la trata como null, ver design.md).
--
-- El cuerpo es copia literal del de 0010, comentarios incluidos, para que
-- `prosrc` quede byte a byte como antes.
--
-- Orden: primero la funcion de 0010 (que deja de nombrar la columna), despues
-- la columna y la auxiliar. Al reves, cada alta fallaria en el intervalo.
--
--   create or replace function public.sincronizar_perfil()
--     returns trigger
--     language plpgsql
--     security definer
--     set search_path = public, pg_temp
--   as $$
--   declare
--     v_rol public.usuario_rol;
--   begin
--     v_rol := case
--       when lower(coalesce(new.raw_app_meta_data ->> 'es_staff', '')) in ('true', 't', '1')
--         then 'admin'::public.usuario_rol
--       when coalesce(new.raw_app_meta_data ->> 'profesional_id', '') ~ '^[0-9]+$'
--         then 'profesional'::public.usuario_rol
--       else 'cliente'::public.usuario_rol
--     end;
--
--     insert into public.perfiles as p (id, nombre, telefono, email, rol, profesional_id)
--     values (
--       new.id,
--       -- `perfiles.nombre` es NOT NULL, y el nombre PUEDE NO VENIR: el registro de la
--       -- web lo escribe en `user_metadata` (ver META_NOMBRE en auth.mapper.ts), pero
--       -- una cuenta creada por SQL o desde el panel de Supabase no lo trae. De ahi la
--       -- cadena de reserva.
--       --
--       -- Se cae a la parte local del correo y no a un "Sin nombre" porque es un dato
--       -- util: para las cuentas de 0008, `berenice@estudionura.cl` da justo
--       -- "berenice". El literal final cubre el caso extremo de una cuenta sin correo
--       -- —Supabase admite alta por telefono—, donde no hay nada de donde sacarlo.
--       coalesce(
--         nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nombre', '')), ''),
--         nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
--         'Sin nombre'
--       ),
--       -- `telefono` y `email` se rellenan con cadena vacia en vez de NULL por si
--       -- tambien fueran NOT NULL: no se puede comprobar desde el navegador, y una
--       -- migracion que falla a mitad es peor que un dato vacio. El mapper del
--       -- frontend trata la cadena vacia como ausente, asi que no se nota.
--       coalesce(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'telefono', '')), ''), ''),
--       coalesce(new.email, ''),
--       v_rol,
--       case
--         when coalesce(new.raw_app_meta_data ->> 'profesional_id', '') ~ '^[0-9]+$'
--           then (new.raw_app_meta_data ->> 'profesional_id')::bigint
--         else null
--       end
--     )
--     on conflict (id) do update
--     set
--       -- El correo, el rol y la ficha se refrescan porque su fuente es `auth.users`.
--       email          = excluded.email,
--       rol            = excluded.rol,
--       profesional_id = excluded.profesional_id,
--       -- El nombre y el telefono NO se pisan si ya hay algo: el panel de
--       -- administracion puede haberlos corregido, y `user_metadata` —que la propia
--       -- persona edita— no deberia deshacer esa correccion.
--       --
--       -- Se compara con `nullif(...,'')` y no con `coalesce`: al ser NOT NULL, lo que
--       -- indica "aqui no hay nada escrito" es la cadena vacia, no NULL.
--       nombre   = coalesce(nullif(btrim(p.nombre), ''), excluded.nombre),
--       telefono = coalesce(nullif(btrim(p.telefono), ''), excluded.telefono);
--
--     return new;
--   end;
--   $$;
--
--   alter table public.perfiles drop column fecha_nacimiento;
--   drop function public.fecha_nacimiento_de_metadatos(jsonb);
--   notify pgrst, 'reload schema';
