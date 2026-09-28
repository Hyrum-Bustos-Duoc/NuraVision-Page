-- ============================================================================
-- NuraVision · 0009 · Cada profesional edita su propio horario
-- ============================================================================
-- El panel de disponibilidad mostraba el horario real de la base pero al
-- guardar no llegaba a ninguna parte: `disponibilidad` no tenia politica de
-- escritura, asi que los cambios se quedaban en el estado del navegador y
-- desaparecian al recargar. Esta migracion abre esa puerta, y solo esa.
--
-- ----------------------------------------------------------------------------
-- POR QUE NO SE CREA UNA TABLA NUEVA
-- ----------------------------------------------------------------------------
-- El nombre del archivo viene de la peticion original, que pedia una tabla
-- `disponibilidad_profesional`. No se crea, y conviene dejar escrito el motivo
-- porque no es una simplificacion: seria un error.
--
-- `public.disponibilidad` ya existe desde 0001 con las mismas columnas
-- (profesional_id, dia_semana, hora_inicio, hora_fin), ya tiene RLS y lectura
-- publica desde 0002, y ya esta poblada con las 8 profesionales de lunes a
-- sabado de 10:00 a 19:00 —exactamente los datos por defecto que se pedia
-- sembrar—. Sobre todo: es la tabla que LEEN el flujo de reserva, la portada y
-- el listado del equipo.
--
-- Una tabla paralela habria partido la verdad en dos. El panel escribiria en
-- una y la clienta seguiria reservando contra la otra, de modo que cambiar el
-- horario no cambiaria nada de lo que se puede reservar: un fallo silencioso,
-- peor que el aviso honesto que hay hoy.
--
-- Lo que si faltaba son las dos columnas nuevas, y se agregan aqui.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Columnas nuevas
-- ----------------------------------------------------------------------------
-- `activo` distingue "este dia no trabajo" de "este dia todavia no lo he
-- configurado". Hasta ahora la unica forma de cerrar un dia era no tener fila,
-- y eso hacia ambiguo el caso de una profesional recien creada: sin filas, su
-- semana entera se leia como cerrada sin que nadie lo hubiera decidido.
--
-- `bloques_bloqueados` guarda las pausas dentro de la jornada (la colacion, un
-- permiso, una hora reservada para uso personal). Antes se DEDUCIAN del hueco
-- entre dos filas del mismo dia, que es una conversion con perdida: al guardar
-- desde el panel, que maneja un unico tramo con pausas, esa informacion no
-- tenia donde volver. Con la columna, el horario va y vuelve intacto.
alter table public.disponibilidad
  add column if not exists activo boolean not null default true;

alter table public.disponibilidad
  add column if not exists bloques_bloqueados jsonb not null default '[]'::jsonb;

comment on column public.disponibilidad.activo is
  'false = ese dia no se atiende. La fila se conserva para no perder el horario '
  'configurado al volver a abrirlo.';
comment on column public.disponibilidad.bloques_bloqueados is
  'Pausas dentro de la jornada, como [{"id":"..","start":"13:00","end":"14:00",'
  '"label":"Colacion"}]. Ante la clienta se muestran como hora no disponible, '
  'sin distinguirlas de una hora ya reservada.';

-- `jsonb` acepta cualquier cosa: un numero suelto o un objeto entrarian igual y
-- reventarian al recorrerlos en el navegador. Aqui se exige que sea una lista.
alter table public.disponibilidad
  drop constraint if exists disponibilidad_pausas_es_lista;

alter table public.disponibilidad
  add constraint disponibilidad_pausas_es_lista
    check (jsonb_typeof(bloques_bloqueados) = 'array');

-- ----------------------------------------------------------------------------
-- Una sola fila por dia
-- ----------------------------------------------------------------------------
-- Es lo que permite guardar la semana entera con un UPSERT: sin una clave
-- unica sobre (profesional_id, dia_semana), PostgREST no tiene contra que
-- resolver el conflicto y habria que borrar e insertar en dos peticiones, con
-- el riesgo de dejar a alguien sin horario si la segunda falla.
--
-- El modelo de 0001 admitia varias filas por dia y trataba el hueco entre ellas
-- como colacion; eso ahora lo cubre `bloques_bloqueados`, que ademas conserva
-- la etiqueta de cada pausa.
--
-- OJO: este ALTER FALLA si alguna profesional tiene hoy dos bloques el mismo
-- dia. En esta base no ocurre (48 filas = 8 profesionales x 6 dias, una por
-- dia), pero si fallara, lo correcto es fusionar esos bloques a mano y volver a
-- ejecutar, NO quitar la restriccion: sin ella el guardado deja filas huerfanas
-- que la clienta seguiria viendo como horario valido.
alter table public.disponibilidad
  drop constraint if exists disponibilidad_un_bloque_por_dia;

alter table public.disponibilidad
  add constraint disponibilidad_un_bloque_por_dia
    unique (profesional_id, dia_semana);

-- La unica de 0001 sobre (profesional_id, dia_semana, hora_inicio) queda
-- implicada por esta y por tanto redundante. Se deja donde esta: quitarla no
-- aporta nada y una restriccion de menos es una red de seguridad de menos.

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Ya venia activada de 0002. Se repite porque es idempotente y porque una
-- migracion que concede escritura no deberia dar por hecho que alguien
-- ejecuto la anterior: si RLS estuviera apagada, las politicas de abajo no se
-- aplicarian y la tabla quedaria abierta de par en par.
alter table public.disponibilidad enable row level security;

-- ----------------------------------------------------------------------------
-- Lectura publica
-- ----------------------------------------------------------------------------
-- Creada en 0002. Se vuelve a declarar por lo mismo que arriba, y porque el
-- flujo de reserva depende de ella: la clienta consulta el horario antes de
-- tener sesion, asi que `anon` tiene que poder leerlo.
--
-- No se filtra por `activo` en la politica. Quien filtra es la consulta, igual
-- que con `servicios`: el panel de la profesional necesita ver los dias que
-- tiene cerrados para poder volver a abrirlos.
drop policy if exists "lectura publica de disponibilidad" on public.disponibilidad;

create policy "lectura publica de disponibilidad"
  on public.disponibilidad
  for select
  to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- Escritura: solo sobre el horario propio
-- ----------------------------------------------------------------------------
-- Se apoya en `public.mi_profesional_id()` de 0007, que lee `profesional_id` de
-- `app_metadata` —el unico metadato que la propia persona no puede escribir— y
-- devuelve NULL si no hay marca o si esta mal escrita. Como `profesional_id =
-- NULL` nunca es verdadero, una clienta cualquiera se queda fuera sola.
--
-- `for all` cubre INSERT, UPDATE y DELETE:
--
--   · INSERT para abrir un dia que todavia no tiene fila.
--   · UPDATE para el caso normal, cambiar horas o cerrar un dia.
--   · DELETE para poder limpiar filas sobrantes de un horario partido.
--
-- El `with check` va escrito aparte aunque repita el `using`. Postgres usaria
-- el `using` como comprobacion si se omitiera, pero dejarlo implicito esconde
-- lo que de verdad impide: sin el, una profesional podria mover una fila SUYA a
-- otra persona cambiandole el `profesional_id`, y escribirle el horario.
--
-- La lectura sigue siendo publica por la politica de arriba; las permisivas se
-- combinan con OR, asi que esta no le quita acceso a nadie.
drop policy if exists "Escritura del horario propio" on public.disponibilidad;

create policy "Escritura del horario propio"
  on public.disponibilidad
  for all
  to authenticated
  using (profesional_id = public.mi_profesional_id())
  with check (profesional_id = public.mi_profesional_id());

-- ----------------------------------------------------------------------------
-- Privilegios
-- ----------------------------------------------------------------------------
-- Una politica no sirve de nada si el rol no tiene el privilegio, y al reves:
-- el privilegio sin politica tampoco deja pasar. Hacen falta los dos.
--
-- A `anon` se le retira todo lo que no sea leer. Hoy RLS ya lo frena —no hay
-- ninguna politica de escritura para ese rol— pero los privilegios por defecto
-- de Supabase se los conceden sobre las tablas de `public`, y apoyarse solo en
-- la ausencia de politica deja el permiso a un descuido de distancia.
revoke insert, update, delete on public.disponibilidad from anon;

grant select on public.disponibilidad to anon, authenticated;
grant insert, delete on public.disponibilidad to authenticated;

-- El UPDATE se concede por columnas, no entero. `profesional_id` queda fuera a
-- proposito: el `with check` de la politica ya impide reasignar una fila, y
-- esto lo impide una segunda vez, en otra capa. `id` tampoco se concede porque
-- no hay motivo para reescribir una clave primaria.
grant update (activo, dia_semana, hora_inicio, hora_fin, bloques_bloqueados)
  on public.disponibilidad to authenticated;

-- ----------------------------------------------------------------------------
-- Datos por defecto
-- ----------------------------------------------------------------------------
-- No hay nada que sembrar: las 48 filas de lunes a sabado de 10:00 a 19:00 para
-- las 8 profesionales ya estan en la tabla desde el seed, y las dos columnas
-- nuevas toman su valor por defecto (activo = true, sin pausas), que es
-- exactamente el horario que se pedia dejar cargado.
--
-- Este INSERT solo cubre el caso de una profesional dada de alta despues, que
-- se quedaria sin ninguna fila. No toca las existentes.
insert into public.disponibilidad (profesional_id, dia_semana, hora_inicio, hora_fin)
select p.id, d.dia, time '10:00', time '19:00'
from public.profesionales p
cross join generate_series(1, 6) as d(dia)
where not exists (
  select 1
  from public.disponibilidad h
  where h.profesional_id = p.id
    and h.dia_semana = d.dia
);

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Una fila por profesional y dia, sin huecos ni duplicados.
select
  p.nombre,
  count(*)                          as dias_configurados,
  count(*) filter (where h.activo)  as dias_abiertos,
  min(h.hora_inicio)                as abre,
  max(h.hora_fin)                   as cierra
from public.profesionales p
join public.disponibilidad h on h.profesional_id = p.id
group by p.id, p.nombre
order by p.id;

notify pgrst, 'reload schema';
