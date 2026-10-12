-- ============================================================================
-- NuraVision · 0019 · La base fija el precio de la variante y topa el abono
-- ============================================================================
-- Contrato en openspec/changes/pago-webpay-abono/ (decisiones del 2026-10-11).
--
-- EL AGUJERO QUE CIERRA. `reservas.detalles_extra.variante` (0011) es una copia
-- de la opcion elegida —pregunta, etiqueta y PRECIO— y hasta ahora la escribia
-- el navegador tal cual. Con Webpay (0018) ese precio pasa a ser lo que se
-- cobra: cualquiera podia insertar su reserva con `precio: 1` y pagar $1 por un
-- servicio de $38.000. Y aunque el cobro se calculara aparte, el panel, «Mis
-- reservas» y el saldo seguirian mostrando el precio manipulado.
--
-- LO QUE HACE. Al insertar una reserva, la base:
--   1. Busca en `servicios.variantes` la opcion cuyo id es
--      `detalles_extra.variante.opcionId` —lo UNICO que se usa de lo enviado—
--      y reescribe la variante entera (pregunta, opcionId, etiqueta, precio)
--      con lo que dice el catalogo.
--   2. Si el servicio tiene variantes y la opcion falta o no existe, rechaza
--      la reserva (P0001, mensaje para la clienta).
--   3. Si el servicio NO tiene variantes, quita `variante` de lo enviado.
--   4. Fija `reservas.abono = least(servicios.abono, precio efectivo)`, donde
--      el precio efectivo es el de la opcion o, sin variantes, `precio_base`.
--
-- POR QUE REESCRIBIR Y NO RECHAZAR UN PRECIO DISTINTO: rechazar obligaria al
-- navegador a conocer el precio vigente exacto; si el estudio lo cambia
-- mientras la clienta reserva, la reserva falla sin que ella haya hecho nada
-- mal. Reescribir es igual de seguro y no tiene esa carrera (proposal.md).
--
-- POR QUE EL TOPE DEL ABONO: el panel impide guardar `abono > precioDesde`,
-- pero el estudio puede bajar el precio de una opcion DESPUES. Sin el `least`,
-- se cobraria como abono mas que el servicio (design.md, decision 2).
--
-- Solo INSERT: las reservas ya existentes no se tocan. Las que se tomaron con
-- un precio de variante manipulado lo conservan; ver la comprobacion al final.
--
-- Sin `if not exists`, como 0015: si algo de esto ya existe, alguien lo aplico
-- a mano y conviene que falle.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- UN SOLO TRIGGER, NO DOS
-- ----------------------------------------------------------------------------
-- 0015 dejo `reservas_fijar_abono`, que copia `servicios.abono`. El tope nuevo
-- necesita el precio efectivo, y ese precio lo resuelve el paso de la variante:
-- el abono tiene que calcularse DESPUES.
--
-- Con dos triggers BEFORE INSERT, Postgres los dispara por orden alfabetico de
-- nombre. Funcionaria nombrandolos con cuidado, pero es un orden invisible: un
-- tercer trigger mal nombrado, o renombrar uno, lo rompe sin ningun error. Se
-- reemplaza el de 0015 por una sola funcion que hace los dos pasos en orden y
-- lee `servicios` una sola vez. El orden queda escrito en el codigo, no en el
-- alfabeto.
drop trigger reservas_fijar_abono on public.reservas;
drop function public.fijar_abono_reserva();

-- ----------------------------------------------------------------------------
-- La funcion
-- ----------------------------------------------------------------------------
-- POR QUE UN TRIGGER Y NO ALGO DECLARATIVO: igual que en 0015, los valores
-- salen de OTRA tabla. Un check no admite subconsultas (y rechazaria en vez de
-- corregir), un default lo pisaria el navegador y una columna generada no puede
-- leer `servicios` ni congelar el valor.
--
-- SIN `security definer`, verificado: `servicios` es legible por anon y
-- authenticated sin filtro (0002, «lectura publica de servicios», `using
-- (true)`; 0010 solo agrega una politica para el personal, que suma por OR).
-- El trigger lee con los permisos de quien inserta y no salta ninguna RLS. Si
-- algun dia esa politica filtra por `activo`, este trigger dejara de ver los
-- servicios inactivos y la reserva fallara con 23503: revisar aqui antes.
--
-- "TIENE VARIANTES" SE DECIDE COMO EL FRONTEND. `aVariante` en
-- servicio.mapper.ts descarta las opciones sin precio numerico >= 0 o sin
-- etiqueta, usa la etiqueta como id si falta el id, y si no sobrevive ninguna
-- trata el servicio como SIN variantes. Aqui se aplica el mismo filtro. Si no
-- se hiciera, un servicio con todas sus opciones mal formadas no preguntaria
-- nada en pantalla y la base rechazaria cada reserva por "falta la opcion": un
-- servicio imposible de reservar sin ningun error visible para el estudio.
--
-- Los `case` dentro del filtro no son estilo: el orden de evaluacion de un AND
-- no esta garantizado (0011), y `(o ->> 'precio')::numeric` sobre un texto
-- como "abc" LANZA. El `case` asegura que solo se castea lo que ya es numero.
-- Lo mismo con `jsonb_array_elements`, que lanza si no recibe una lista.
--
-- El abono usa `floor(precio)`, igual que el relleno de 0015: con un precio con
-- centavos (999.50) el cast a integer redondearia a 1000, por encima del
-- precio.
--
-- Errores para la clienta. Los dos usan P0001 (raise_exception) y un `hint`
-- estable para que el front no tenga que comparar el texto:
--   · hint 'variante_requerida'     el servicio pregunta algo y no llego opcion.
--   · hint 'variante_no_disponible' la opcion no existe (el estudio la quito o
--                                   la cambio mientras la clienta reservaba).
create function public.fijar_precio_reserva()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  v_abono          integer;
  v_precio         numeric;
  v_variantes      jsonb;
  v_opcion_id      text;
  v_hay_variantes  boolean;
  v_elegida        jsonb;
begin
  select s.abono, s.precio_base, s.variantes
    into v_abono, v_precio, v_variantes
  from public.servicios s
  where s.id = new.servicio_id;

  -- Mismo criterio que 0015: si el servicio no se ve, se falla con el codigo
  -- de la FK en vez de inventar un precio o un abono.
  if not found then
    raise exception 'servicio % no existe', new.servicio_id
      using errcode = '23503';
  end if;

  v_opcion_id := new.detalles_extra -> 'variante' ->> 'opcionId';

  -- Paso 1: las opciones validas y, entre ellas, la elegida (la primera si dos
  -- comparten id, que es la que `find` encontraria en el front).
  select
    count(*) > 0,
    (array_agg(
       jsonb_build_object(
         'pregunta', btrim(v_variantes ->> 'pregunta'),
         'opcionId', o.id,
         'etiqueta', o.etiqueta,
         'precio',   o.precio
       )
       order by o.n
     ) filter (where o.id = v_opcion_id))[1]
    into v_hay_variantes, v_elegida
  from (
    select
      coalesce(
        case when jsonb_typeof(e.op -> 'id') = 'string'
             then nullif(btrim(e.op ->> 'id'), '') end,
        btrim(e.op ->> 'etiqueta')
      )                        as id,
      btrim(e.op ->> 'etiqueta') as etiqueta,
      e.op -> 'precio'         as precio,
      e.n
    from jsonb_array_elements(
           case when jsonb_typeof(v_variantes -> 'opciones') = 'array'
                then v_variantes -> 'opciones'
                else '[]'::jsonb end
         ) with ordinality as e(op, n)
    where case when jsonb_typeof(e.op -> 'precio') = 'number'
               then (e.op ->> 'precio')::numeric >= 0
               else false end
      and jsonb_typeof(e.op -> 'etiqueta') = 'string'
      and btrim(e.op ->> 'etiqueta') <> ''
  ) as o;

  if not v_hay_variantes then
    -- Sin variantes: lo que mande el navegador bajo `variante` sobra. Se quita
    -- y el resto de `detalles_extra` se conserva; si no queda nada, NULL, que
    -- es como el front guarda "sin variante".
    new.detalles_extra := nullif(new.detalles_extra - 'variante', '{}'::jsonb);

  elsif v_opcion_id is null then
    raise exception 'Este servicio requiere elegir una opción antes de reservar.'
      using errcode = 'P0001', hint = 'variante_requerida';

  elsif v_elegida is null then
    raise exception 'La opción elegida ya no está disponible. Vuelve a elegirla.'
      using errcode = 'P0001', hint = 'variante_no_disponible';

  else
    new.detalles_extra :=
      coalesce(new.detalles_extra, '{}'::jsonb)
      || jsonb_build_object('variante', v_elegida);
    v_precio := (v_elegida ->> 'precio')::numeric;
  end if;

  -- Paso 2: el abono, topado al precio efectivo que acaba de resolverse.
  new.abono := least(v_abono, floor(v_precio))::integer;

  return new;
end;
$$;

comment on function public.fijar_precio_reserva() is
  'BEFORE INSERT en reservas: reescribe detalles_extra.variante desde '
  'servicios.variantes por opcionId (P0001 si falta o no existe; la quita si el '
  'servicio no tiene variantes) y fija abono = least(servicios.abono, precio '
  'efectivo). Reemplaza a fijar_abono_reserva (0015). security invoker: '
  'servicios es de lectura publica (0002).';

create trigger reservas_fijar_precio
  before insert on public.reservas
  for each row execute function public.fijar_precio_reserva();

-- Los comentarios de 0011 y 0015 describian lo que ahora es falso.
comment on column public.reservas.abono is
  'Abono en CLP EXIGIDO al crear la reserva: least(servicios.abono, precio '
  'efectivo), fijado por el trigger reservas_fijar_precio; lo que envie el '
  'navegador se ignora. No se edita despues: no esta en ningun GRANT UPDATE.';

comment on column public.reservas.detalles_extra is
  'Datos extra de la reserva. La clave `variante` es una COPIA de la opcion '
  'elegida (pregunta, opcionId, etiqueta, precio) que escribe la base desde '
  'servicios.variantes al insertar (reservas_fijar_precio); del navegador solo '
  'se usa opcionId.';

-- PRIVILEGIOS: ninguno nuevo. `detalles_extra` y `abono` siguen fuera de los
-- GRANT UPDATE por columnas de 0005/0006, asi que el trigger de INSERT es el
-- unico punto donde se escriben.

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Un solo trigger BEFORE INSERT en reservas: `reservas_fijar_precio`.
select tgname
from pg_trigger
where tgrelid = 'public.reservas'::regclass
  and not tgisinternal;

-- Reservas YA EXISTENTES cuyo precio de variante no coincide con ninguna opcion
-- vigente del servicio. No se corrigen (no se puede saber si fue manipulacion
-- o un cambio legitimo de precio posterior): es la lista para revisar a mano
-- antes de cobrarlas por Webpay. Lo esperable es cero filas.
select r.id, r.codigo, r.servicio_id, r.detalles_extra -> 'variante' as variante
from public.reservas r
join public.servicios s on s.id = r.servicio_id
where r.detalles_extra ? 'variante'
  and not exists (
    select 1
    from jsonb_array_elements(
           case when jsonb_typeof(s.variantes -> 'opciones') = 'array'
                then s.variantes -> 'opciones' else '[]'::jsonb end
         ) as o
    where o -> 'precio' = r.detalles_extra -> 'variante' -> 'precio'
  );

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Rollback (no se ejecuta; copiar a mano si hace falta revertir)
-- ----------------------------------------------------------------------------
-- No destructivo: no borra datos. Devuelve el trigger de 0015 (copia del abono
-- sin tope) y el navegador vuelve a escribir la variante tal cual, es decir,
-- REABRE el cobro manipulable. No revertir con Webpay en produccion.
--
--   drop trigger reservas_fijar_precio on public.reservas;
--   drop function public.fijar_precio_reserva();
--
--   create function public.fijar_abono_reserva()
--     returns trigger
--     language plpgsql
--     set search_path = public, pg_temp
--   as $$
--   begin
--     select s.abono into new.abono
--     from public.servicios s
--     where s.id = new.servicio_id;
--     if not found then
--       raise exception 'servicio % no existe', new.servicio_id
--         using errcode = '23503';
--     end if;
--     return new;
--   end;
--   $$;
--
--   create trigger reservas_fijar_abono
--     before insert on public.reservas
--     for each row execute function public.fijar_abono_reserva();
--
--   notify pgrst, 'reload schema';
