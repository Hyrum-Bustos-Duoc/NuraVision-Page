-- ============================================================================
-- NuraVision · 0010 · Lo que el panel de administracion necesita para escribir
-- ============================================================================
-- Hasta aqui el panel de administracion solo leia: la unica escritura concedida
-- en todo el esquema era la de 0009, y era para que cada profesional editara su
-- propio horario. Confirmar una reserva funcionaba por 0006; todo lo demas
-- —crear un servicio, dar de alta a alguien del equipo, corregir un telefono—
-- se quedaba en el estado del navegador.
--
-- Esta migracion hace tres cosas:
--
--   1. Pone `perfiles` bajo control de versiones y le da un correo, para que la
--      lista de clientas se pueda leer sin la service_role key.
--   2. Agrega a `profesionales` los tres campos que el formulario del panel ya
--      pedia y no tenian donde guardarse.
--   3. Concede escritura al personal del estudio sobre el catalogo y el equipo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- perfiles: lo que habia
-- ----------------------------------------------------------------------------
-- La tabla YA EXISTIA en la base pero no en `migrations/`, asi que nadie habia
-- auditado su RLS y su forma solo se podia averiguar preguntandole al servidor.
-- Lo que hay hoy, comprobado contra el proyecto:
--
--   id        uuid                  -- la misma clave que auth.users
--   nombre    text
--   telefono  text
--   rol       usuario_rol           -- enum: 'cliente' | 'profesional' | 'admin'
--   creado_en timestamptz
--
-- Y estaba VACIA, con nueve cuentas ya creadas: nada la rellenaba. Por eso el
-- panel de usuarios no tenia de donde leer y seguia mostrando datos de ejemplo.
--
-- `create table if not exists` no se usa: la tabla existe y el `if not exists`
-- ocultaria una diferencia de forma en vez de delatarla. Se declara solo lo que
-- falta, y si algo no cuadra la migracion falla, que es lo que queremos.

-- ----------------------------------------------------------------------------
-- El correo, replicado
-- ----------------------------------------------------------------------------
-- El correo vive en `auth.users`, que el navegador NO puede leer: hace falta la
-- service_role key, y esa no sale del servidor. Sin una copia aqui, la lista de
-- clientas del panel no podria mostrar el dato por el que se identifica a una
-- persona.
--
-- Es una replica, no la fuente: la que manda sigue siendo `auth.users`. La
-- mantiene al dia el trigger de mas abajo, en el alta y en cada cambio de
-- correo. No se le pone `unique` a proposito: la unicidad ya la garantiza
-- `auth.users`, y duplicarla aqui solo agregaria una forma de que la replica
-- falle al escribirse.
alter table public.perfiles
  add column if not exists email text;

comment on column public.perfiles.email is
  'Replica del correo de auth.users, que el navegador no puede leer. La fuente '
  'de verdad es auth.users; aqui lo mantiene el trigger sincronizar_perfil().';

-- Mismo motivo que el correo, y el mismo caracter de replica. El vinculo con la
-- ficha vive en `app_metadata`, que cada sesion solo puede leer de SI MISMA: sin
-- esta copia, el panel no podria decir a que profesional corresponde una cuenta
-- que no es la propia, y la lista de usuarios mostraria "profesional" sin poder
-- decir cual.
--
-- Sin clave foranea a proposito: si se borrara una ficha, lo correcto es que la
-- cuenta siga existiendo con el vinculo colgando —y que se vea— en vez de que el
-- borrado falle o se lleve la cuenta por delante.
alter table public.perfiles
  add column if not exists profesional_id bigint;

comment on column public.perfiles.profesional_id is
  'Replica de app_metadata.profesional_id. La fuente es auth.users; sin clave '
  'foranea para que borrar una ficha no arrastre la cuenta.';

-- ----------------------------------------------------------------------------
-- Un perfil por cuenta, automaticamente
-- ----------------------------------------------------------------------------
-- El alta la dispara `auth.users`, no la aplicacion: asi da igual por donde se
-- registre alguien —el formulario de la web, el panel de Supabase, un script
-- como 0008 o la Edge Function de administracion—, su perfil aparece siempre.
-- Dejarlo en manos del frontend significaria que una alta por cualquier otra via
-- no llega nunca a esta tabla, que es exactamente como quedo hasta ahora.
--
-- `security definer` es imprescindible: el trigger corre con los privilegios de
-- quien se esta registrando, que no tiene ninguno sobre `public.perfiles`.
--
-- El rol se deduce de `app_metadata`, con el mismo criterio que las politicas de
-- 0006 y 0007, para que no puedan discrepar: personal -> 'admin', ficha
-- vinculada -> 'profesional', y si no, 'cliente'.
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

  insert into public.perfiles as p (id, nombre, telefono, email, rol, profesional_id)
  values (
    new.id,
    -- El nombre y el telefono los escribe el registro en `user_metadata`; ver
    -- META_NOMBRE y META_TELEFONO en auth.mapper.ts. Pueden no venir.
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nombre', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'telefono', '')), ''),
    new.email,
    v_rol,
    case
      when coalesce(new.raw_app_meta_data ->> 'profesional_id', '') ~ '^[0-9]+$'
        then (new.raw_app_meta_data ->> 'profesional_id')::bigint
      else null
    end
  )
  on conflict (id) do update
  set
    -- El correo, el rol y la ficha se refrescan porque su fuente es `auth.users`.
    email          = excluded.email,
    rol            = excluded.rol,
    profesional_id = excluded.profesional_id,
    -- El nombre y el telefono NO se pisan si ya hay algo: el panel de
    -- administracion puede haberlos corregido, y `user_metadata` —que la propia
    -- persona edita— no deberia deshacer esa correccion.
    nombre   = coalesce(p.nombre, excluded.nombre),
    telefono = coalesce(p.telefono, excluded.telefono);

  return new;
end;
$$;

comment on function public.sincronizar_perfil() is
  'Crea o refresca la fila de perfiles al darse de alta una cuenta o al cambiar '
  'su correo o sus metadatos de rol.';

drop trigger if exists perfil_al_crear_cuenta on auth.users;

create trigger perfil_al_crear_cuenta
  after insert on auth.users
  for each row execute function public.sincronizar_perfil();

-- El segundo trigger cubre lo que el primero no puede ver: un cambio de correo,
-- o la asignacion de `es_staff` / `profesional_id` a una cuenta que ya existia
-- —que es justo lo que hizo 0008 con la cuenta principal—.
drop trigger if exists perfil_al_cambiar_cuenta on auth.users;

create trigger perfil_al_cambiar_cuenta
  after update of email, raw_app_meta_data on auth.users
  for each row execute function public.sincronizar_perfil();

-- ----------------------------------------------------------------------------
-- RLS de perfiles  (VA ANTES DE RELLENARLA, Y NO ES UN DETALLE DE ORDEN)
-- ----------------------------------------------------------------------------
-- La tabla estaba fuera de `migrations/`, asi que su RLS no la habia revisado
-- nadie. Se comprobo, y NO estaba protegida: un INSERT con la anon key no
-- devolvia 42501 (violacion de politica) sino 22P02 (error de tipo), lo que
-- significa que la peticion llegaba a ejecutarse. Con la anon key viajando dentro
-- del bundle, eso deja los datos de contacto de toda la clientela al alcance de
-- cualquiera.
--
-- Hoy no se filtra nada porque la tabla esta vacia. Pero el relleno de mas abajo
-- le mete los correos de las nueve cuentas, asi que el orden importa: si se
-- activara despues, habria un intervalo —corto, pero real si el editor no
-- envuelve el script en una transaccion— con datos dentro y sin proteccion.
--
-- Activar RLS no estorba al propio script: las migraciones corren con
-- privilegios que la saltan.
alter table public.perfiles enable row level security;

-- ----------------------------------------------------------------------------
-- Las nueve cuentas que ya existen
-- ----------------------------------------------------------------------------
-- Los triggers solo actuan de ahora en adelante. Sin esto, las cuentas creadas
-- por 0008 y quien se hubiera registrado antes seguirian sin perfil, y el panel
-- de usuarios abriria vacio pese a haber gente dada de alta.
insert into public.perfiles (id, nombre, telefono, email, rol, profesional_id)
select
  u.id,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'nombre', '')), ''),
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'telefono', '')), ''),
  u.email,
  case
    when lower(coalesce(u.raw_app_meta_data ->> 'es_staff', '')) in ('true', 't', '1')
      then 'admin'::public.usuario_rol
    when coalesce(u.raw_app_meta_data ->> 'profesional_id', '') ~ '^[0-9]+$'
      then 'profesional'::public.usuario_rol
    else 'cliente'::public.usuario_rol
  end,
  case
    when coalesce(u.raw_app_meta_data ->> 'profesional_id', '') ~ '^[0-9]+$'
      then (u.raw_app_meta_data ->> 'profesional_id')::bigint
    else null
  end
from auth.users u
on conflict (id) do update
set email          = excluded.email,
    rol            = excluded.rol,
    profesional_id = excluded.profesional_id;

-- Cada quien ve y corrige lo suyo.
drop policy if exists "Lectura del perfil propio" on public.perfiles;
create policy "Lectura del perfil propio"
  on public.perfiles for select to authenticated
  using (id = auth.uid());

-- El `with check` repite la condicion para que nadie pueda reasignar su fila a
-- otra persona cambiandole el `id`.
drop policy if exists "Correccion del perfil propio" on public.perfiles;
create policy "Correccion del perfil propio"
  on public.perfiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- El personal del estudio gestiona a todo el mundo. `es_staff()` viene de 0006,
-- endurecida en 0007: lee `app_metadata`, que solo se escribe con la
-- service_role key, de modo que nadie se asciende solo.
drop policy if exists "El personal gestiona los perfiles" on public.perfiles;
create policy "El personal gestiona los perfiles"
  on public.perfiles for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

-- `anon` no aparece en ninguna politica: una visitante sin sesion no tiene por
-- que ver los datos de contacto de nadie. Se le retira tambien el privilegio,
-- porque los privilegios por defecto de Supabase se lo conceden sobre las
-- tablas de `public` y apoyarse solo en la ausencia de politica deja el permiso
-- a un descuido de distancia.
revoke all on public.perfiles from anon;
grant select, insert, update, delete on public.perfiles to authenticated;

-- ----------------------------------------------------------------------------
-- profesionales: los tres campos que el formulario ya pedia
-- ----------------------------------------------------------------------------
-- El modal del panel pide años de experiencia, reseña y categoria desde que
-- existe el prototipo, pero la tabla no tenia donde ponerlos: `ProProfile` y la
-- ficha publica los rellenaban con 0 y cadena vacia, y el comentario que lo
-- explicaba decia "se dejan vacios en vez de inventarlos sobre una persona
-- real". Ahora tienen columna.
--
-- `categoria` es texto libre, igual que en `servicios`, y por el mismo motivo:
-- el frontend ya normaliza esas etiquetas ('Uñas' -> unas) y un enum obligaria a
-- migrar el esquema cada vez que el estudio invente un area.
alter table public.profesionales
  add column if not exists experiencia_anios integer not null default 0;

alter table public.profesionales
  add column if not exists biografia text;

alter table public.profesionales
  add column if not exists categoria text;

alter table public.profesionales
  drop constraint if exists profesionales_experiencia_razonable;

-- Sin tope superior no habria nada que impidiera un 900 escrito de mas, y la
-- ficha publica lo mostraria tal cual.
alter table public.profesionales
  add constraint profesionales_experiencia_razonable
    check (experiencia_anios between 0 and 70);

comment on column public.profesionales.experiencia_anios is 'Años de oficio. 0 = sin declarar.';
comment on column public.profesionales.biografia is 'Reseña que se muestra en la ficha publica.';
comment on column public.profesionales.categoria is
  'Area principal, en el mismo vocabulario libre que servicios.categoria.';

-- ----------------------------------------------------------------------------
-- servicios: los tres campos que el formulario ya mostraba
-- ----------------------------------------------------------------------------
-- El modal de servicios del panel pide una fotografia, una descripcion larga y
-- una lista de "incluye" desde que existe el prototipo. La tabla solo tenia
-- `descripcion`, asi que esos tres campos se rellenaban, se guardaban en el
-- estado del navegador y se perdian al recargar. O se les da columna o hay que
-- quitarlos del formulario; se les da columna, que es lo que el estudio espera.
--
-- `imagen_url` se suma a `servicio.imagenes.ts`, no lo reemplaza: ese modulo
-- deduce una foto de Unsplash a partir del nombre y sigue siendo el respaldo
-- para los servicios sin imagen propia. Con columna, la que cargue el estudio
-- manda sobre la deducida.
alter table public.servicios
  add column if not exists imagen_url text;

alter table public.servicios
  add column if not exists descripcion_larga text;

alter table public.servicios
  add column if not exists incluye jsonb not null default '[]'::jsonb;

-- `jsonb` acepta cualquier cosa; aqui tiene que ser una lista o el navegador
-- reventaria al recorrerla.
alter table public.servicios
  drop constraint if exists servicios_incluye_es_lista;

alter table public.servicios
  add constraint servicios_incluye_es_lista
    check (jsonb_typeof(incluye) = 'array');

comment on column public.servicios.imagen_url is
  'Foto propia del servicio. Si es null, servicio.imagenes.ts deduce una del '
  'nombre.';
comment on column public.servicios.descripcion_larga is
  'Texto de la pagina de detalle. `descripcion` es el breve de las tarjetas.';
comment on column public.servicios.incluye is
  'Lista de textos: lo que contempla el servicio. Ej. ["Limado","Hidratación"].';

-- ----------------------------------------------------------------------------
-- servicios.duracion_bloques: que el alta no dependa de adivinarla
-- ----------------------------------------------------------------------------
-- Es otra columna que existe en la base y no en `migrations/`, igual que
-- `perfiles`. Su significado no esta documentado en ninguna parte y los datos no
-- lo aclaran: hay un servicio de 120 minutos con `duracion_bloques = 1`, asi que
-- NO es duracion/60 y no se puede deducir.
--
-- Por eso el panel no la escribe: inventarle una semantica seria peor que
-- dejarla quieta. Pero si la columna fuera NOT NULL sin valor por defecto, cada
-- alta de servicio fallaria por una columna que nadie entiende. Se le asegura un
-- valor por defecto para que omitirla sea seguro.
--
-- Queda pendiente averiguar que representa y documentarla o retirarla.
alter table public.servicios
  alter column duracion_bloques set default 1;

comment on column public.servicios.duracion_bloques is
  'Sin documentar: se agrego fuera de migrations/ y su relacion con '
  'duracion_minutos no es evidente (hay 120 minutos con 1 bloque). El panel de '
  'administracion no la escribe.';

-- ----------------------------------------------------------------------------
-- Escritura del personal sobre el catalogo y el equipo
-- ----------------------------------------------------------------------------
-- Las cuatro tablas ya tenian lectura publica desde 0002, que se deja intacta:
-- el catalogo y el equipo se consultan sin sesion. Lo que se agrega es la
-- escritura, y solo para el personal.
--
-- `for all` cubre insert, update y delete. Cada politica lleva `with check`
-- aunque repita el `using`: Postgres usaria el `using` como comprobacion si se
-- omitiera, pero dejarlo implicito esconde que es lo que impide que una fila se
-- escriba en un estado que luego su autora no podria volver a leer.
--
-- Se declaran una por una y no con un bucle para que `grep "for all"` sobre
-- `migrations/` siga encontrandolas todas: son el inventario de lo que el panel
-- puede tocar.

drop policy if exists "El personal gestiona los servicios" on public.servicios;
create policy "El personal gestiona los servicios"
  on public.servicios for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists "El personal gestiona el equipo" on public.profesionales;
create policy "El personal gestiona el equipo"
  on public.profesionales for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists "El personal asigna servicios al equipo" on public.profesional_servicios;
create policy "El personal asigna servicios al equipo"
  on public.profesional_servicios for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

-- En `disponibilidad` esta politica CONVIVE con la de 0009: las permisivas se
-- combinan con OR, asi que cada profesional sigue editando su propio horario y
-- ademas el personal puede dejar cargada la semana por defecto al dar de alta a
-- alguien. Ninguna le quita nada a la otra.
drop policy if exists "El personal gestiona los horarios" on public.disponibilidad;
create policy "El personal gestiona los horarios"
  on public.disponibilidad for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

-- ----------------------------------------------------------------------------
-- Privilegios
-- ----------------------------------------------------------------------------
-- Una politica sin privilegio no deja pasar, y un privilegio sin politica
-- tampoco: hacen falta los dos. A `anon` se le retira todo lo que no sea leer.
revoke insert, update, delete on public.servicios             from anon;
revoke insert, update, delete on public.profesionales         from anon;
revoke insert, update, delete on public.profesional_servicios from anon;
revoke insert, update, delete on public.disponibilidad        from anon;

grant insert, update, delete on public.servicios             to authenticated;
grant insert, update, delete on public.profesionales         to authenticated;
grant insert, update, delete on public.profesional_servicios to authenticated;
grant insert, delete         on public.disponibilidad        to authenticated;

-- 0009 concedio el UPDATE de `disponibilidad` por columnas para que una
-- profesional no pudiera reasignar su fila a otra persona. Esa concesion sigue
-- valiendo para el personal, que no necesita mas: dar de alta un horario es un
-- INSERT, y corregirlo toca las mismas cuatro columnas.
grant update (activo, dia_semana, hora_inicio, hora_fin, bloques_bloqueados)
  on public.disponibilidad to authenticated;

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Tiene que devolver una fila por cuenta de auth.users, con su rol deducido.
select rol, count(*) as cuentas, count(email) as con_correo
from public.perfiles
group by rol
order by rol;

notify pgrst, 'reload schema';
