-- ============================================================================
-- NuraVision · 0018 · Pagos con Webpay Plus
-- ============================================================================
-- Una tabla, `pagos`, que registra cada intento de cobro con Transbank. No es
-- un registro de auditoria opcional: es lo que hace que el flujo sea correcto.
--
-- ----------------------------------------------------------------------------
-- POR QUE HACE FALTA UNA TABLA Y NO UNA COLUMNA
-- ----------------------------------------------------------------------------
-- Webpay son DOS llamadas separadas por una vuelta al navegador de la clienta:
--
--   1. Se crea la transaccion y Transbank devuelve un `token` y una `url`.
--   2. La clienta va a Transbank, paga, y vuelve a nuestro sitio con ese token.
--   3. Se confirma (commit) contra Transbank con el token.
--
-- Entre el paso 1 y el 3 el token tiene que estar guardado EN ALGUN SITIO del
-- servidor, porque en el paso 3 lo unico que llega es el token: la URL de
-- retorno no puede traer el monto ni el pedido, o cualquiera los cambiaria.
-- El token es la unica llave, y esta tabla es donde se busca.
--
-- ----------------------------------------------------------------------------
-- Y POR QUE NO BASTA CON `pedidos.estado = 'pagado'`
-- ----------------------------------------------------------------------------
-- Por tres razones:
--
--   · UN PEDIDO PUEDE TENER VARIOS INTENTOS. Una tarjeta rechazada no deja el
--     pedido invalido: la clienta reintenta. Con una sola columna, el segundo
--     intento borraria el rastro del primero.
--   · LAS RESERVAS NO TIENEN DONDE. `estado_reserva` (0003) admite
--     'pendiente', 'confirmada', 'completada' y 'cancelada' — no hay "pagada"—
--     y `reservas` NO TIENE COLUMNA DE MONTO (ver 0011). Sin esta tabla no hay
--     donde anotar cuanto se cobro por un servicio.
--   · EL COMPROBANTE ES DE LA CLIENTA. El codigo de autorizacion, los ultimos
--     digitos de la tarjeta y las cuotas son lo que le permite reclamar en su
--     banco. Eso se guarda o se pierde.
--
-- Como efecto lateral, `pagos.monto` cierra en parte la deuda que 0011 dejo
-- anotada: de una reserva pagada ya se sabe cuanto se cobro ESE dia, no cuanto
-- cuesta el servicio hoy.
--
-- ----------------------------------------------------------------------------
-- HISTORIA DEL ARCHIVO
-- ----------------------------------------------------------------------------
-- Llego en el PR #28 como `0015_pagos_webpay.sql`, junto a un
-- `0016_reserva_abono.sql` con su propio modelo de abono (un interruptor y un
-- monto nuevos en `servicios`). Los dos numeros chocaban con
-- `0015_abono_servicios.sql` y `0016_cumpleanos_perfiles.sql` de develop, y el
-- modelo de abono duplicaba `servicios.abono` (0015). Decision del 2026-10-11
-- (openspec/changes/pago-webpay-abono/): se conserva `servicios.abono`, este
-- archivo pasa a 0018 y absorbe lo unico util de aquel 0016, `monto_total`.
--
-- Cambios respecto del PR, y por que:
--   · FKs `on delete restrict`, no `cascade`: con cascade, borrar una reserva
--     borraba la prueba de un cobro real. Un pago es un registro contable.
--   · Un solo 'autorizado' por reserva y por pedido, con indices unicos
--     parciales (ver abajo).
--
-- ----------------------------------------------------------------------------
-- DOS PUNTOS DE PARTIDA: BASE NUEVA Y PRODUCCION (2026-10-13)
-- ----------------------------------------------------------------------------
-- Al revisar produccion antes de aplicar 0015–0019 aparecio que el 0015 y el
-- 0016 del PR #28 YA estaban aplicados alli a mano, desde el SQL Editor (sin
-- historial de migraciones): existen `estado_pago`, `pagos` con 7 pagos de
-- prueba de Transbank, y `servicios.cobrar_abono` / `monto_abono`, encendido
-- en cuatro servicios.
--
-- Este archivo funciona sobre los dos estados y deja los dos IGUALES:
--   · Base nueva: crea el tipo, la tabla y todo lo demas, como siempre.
--   · Base con el PR #28: conserva las filas de `pagos` y corrige lo que
--     difiere (FKs a `restrict`, indices, politica, comentarios), pasa la
--     configuracion de abono de aquel modelo a `servicios.abono` y borra sus
--     dos columnas.
--
-- Por eso aqui, y solo aqui, hay `if not exists` y bloques condicionales, en
-- contra de la regla de 0015–0017. El riesgo que esa regla evita —seguir de
-- largo sobre un esquema desconocido— no aplica: el esquema previo es uno
-- concreto y leido (git show origin/feature/abono-reserva), y donde podria no
-- coincidir (los valores del enum) el archivo falla en vez de suponer.
--
-- ----------------------------------------------------------------------------
-- QUIEN ESCRIBE AQUI: NADIE, SALVO LAS EDGE FUNCTIONS
-- ----------------------------------------------------------------------------
-- La tabla no concede INSERT, UPDATE ni DELETE a `anon` ni a `authenticated`.
-- La escriben `webpay-crear-transaccion` y `webpay-confirmar-transaccion` con
-- la service_role key, que salta las politicas.
--
-- Es la decision mas importante del archivo. Si el navegador pudiera escribir
-- aqui, podria declararse un pago autorizado sin haber pagado, que es
-- exactamente el fraude que la pasarela existe para evitar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Estado del intento
-- ----------------------------------------------------------------------------
-- 'iniciado'   se creo la transaccion en Transbank y se espera el retorno.
-- 'autorizado' Transbank aprobo el cobro. Es el unico que significa "pagado".
-- 'rechazado'  Transbank respondio, pero no aprobo (tarjeta sin fondos, etc.).
-- 'anulado'    la clienta abandono el formulario de Webpay sin pagar.
-- 'error'      no se pudo saber el resultado (la API fallo, el token expiro).
--
-- 'rechazado' y 'error' se distinguen a proposito: el primero es una respuesta
-- del negocio y el segundo un fallo tecnico que puede necesitar revision.
--
-- Si el tipo ya existe (PR #28) se exige que tenga exactamente estos valores en
-- este orden, que es lo que aquel archivo creaba. No se agregan valores que
-- falten: un enum distinto del esperado es un estado que nadie ha leido, y
-- `alter type ... add value` no deja usar el valor nuevo en la misma
-- transaccion. Mejor que falle y se mire.
do $$
declare
  v_esperado constant text[] :=
    array['iniciado', 'autorizado', 'rechazado', 'anulado', 'error'];
begin
  if to_regtype('public.estado_pago') is null then
    create type public.estado_pago as enum (
      'iniciado',
      'autorizado',
      'rechazado',
      'anulado',
      'error'
    );
  elsif enum_range(null::public.estado_pago)::text[] is distinct from v_esperado then
    raise exception 'public.estado_pago ya existe con valores %, se esperaba %',
      enum_range(null::public.estado_pago)::text[], v_esperado;
  end if;
end
$$;

-- `if not exists`: en produccion la tabla ya existe (PR #28) con estas mismas
-- columnas salvo lo que se corrige en el bloque siguiente. En una base nueva
-- se crea tal cual.
create table if not exists public.pagos (
  id bigint generated by default as identity primary key,

  -- Lo que Transbank llama "orden de compra". Es NUESTRO identificador del
  -- intento, lo vemos en el portal de Transbank, y su limite es de 26
  -- caracteres. No se reutiliza el codigo del pedido porque un pedido puede
  -- tener varios intentos y Transbank rechaza una orden repetida.
  buy_order text not null unique
    constraint pagos_buy_order_largo check (length(buy_order) between 1 and 26),

  -- Identificador de sesion que exige la API. Solo sirve para rastrear.
  session_id text not null
    constraint pagos_session_largo check (length(session_id) between 1 and 61),

  -- El token que devuelve Transbank al crear la transaccion y que vuelve en la
  -- URL de retorno. UNICO: es la llave con la que se confirma el pago, y dos
  -- filas con el mismo token harian ambigua esa busqueda.
  --
  -- Nullable porque la fila se escribe ANTES de llamar a Transbank: si esa
  -- llamada falla, el intento queda registrado como 'error' y sin token, que es
  -- justo lo que hay que poder ver cuando algo va mal.
  token_ws text unique,

  -- Pesos chilenos enteros. El monto lo fija el servidor leyendo la base, NUNCA
  -- el navegador: es el motivo por el que existe `webpay-crear-transaccion`.
  monto integer not null
    constraint pagos_monto_positivo check (monto > 0),

  -- Precio efectivo del servicio el dia del cobro, SOLO cuando se cobro un
  -- abono menor que ese precio. NULL cuando se cobro el total —pedidos de la
  -- tienda y reservas sin abono—: ahi no hay saldo que explicar.
  --
  -- Se guarda y no se recalcula porque el estudio edita sus precios: un
  -- comprobante de hace dos meses mostraria un saldo que nadie acordo. Es el
  -- mismo criterio que `hora_fin` (0003) y `reservas.abono` (0015).
  --
  -- Un total menor que lo cobrado describiria un saldo negativo; el check lo
  -- impide. Igual se admite: el NULL pasa el check, que es lo que se quiere.
  monto_total integer
    constraint pagos_total_no_menor_que_cobrado
      check (monto_total is null or monto_total >= monto),

  estado public.estado_pago not null default 'iniciado',

  -- A que se paga. Uno de los dos, nunca ambos ni ninguno.
  -- `restrict`: un pedido o una reserva con intentos de cobro no se borra. Hoy
  -- ninguno de los dos se borra desde la app (se cancelan), asi que esto solo
  -- frena un DELETE a mano que se llevaria por delante el rastro de un cobro.
  pedido_id  bigint references public.pedidos  (id) on delete restrict,
  reserva_id bigint references public.reservas (id) on delete restrict,

  -- --- Lo que responde Transbank al confirmar -------------------------------
  -- Se guarda desglosado lo que la clienta necesita para reclamar en su banco,
  -- y la respuesta completa en `respuesta` para lo demas.
  response_code     integer,
  authorization_code text,
  payment_type_code  text,
  cuotas             integer,
  -- Solo los ultimos digitos, que es lo unico que entrega Transbank. Guardar un
  -- numero de tarjeta completo seria ilegal y Transbank no lo manda.
  tarjeta_final      text
    constraint pagos_tarjeta_solo_final check (tarjeta_final is null or length(tarjeta_final) <= 4),

  respuesta jsonb,

  creado_en     timestamptz not null default now(),
  -- Cuando se RECLAMO el commit. Es la marca que vuelve IRREPETIBLE la
  -- confirmacion: la funcion la reclama con un UPDATE condicional, igual que
  -- 0012 hace con el correo. Con `confirmado_en` puesto y `estado` aun en
  -- 'iniciado', el commit esta en curso (o el proceso murio a mitad). Un commit repetido en Transbank da error, asi que
  -- esto no es prolijidad sino correccion.
  confirmado_en timestamptz,

  -- Exactamente un destino. `<>` sobre dos booleanos es el XOR: da verdadero
  -- solo si uno es null y el otro no.
  constraint pagos_un_solo_destino
    check ((pedido_id is not null) <> (reserva_id is not null))
);

-- ----------------------------------------------------------------------------
-- Reconciliacion con la tabla del PR #28 (no hace nada en una base nueva)
-- ----------------------------------------------------------------------------
-- Comparada columna a columna con aquel 0015 + 0016, la tabla difiere solo en:
--   · `monto_total` y su check: los agrego aquel 0016 con el mismo nombre y la
--     misma expresion. Se agregan aqui solo si faltan (por si se aplico su
--     0015 y no su 0016).
--   · las FKs `pedido_id` / `reserva_id`: `on delete cascade` alli, `restrict`
--     aqui (ver arriba). Se buscan en pg_constraint por columna y no por nombre,
--     porque un nombre generado a mano en el SQL Editor no es seguro; se
--     reemplazan conservando el nombre que tengan. Las filas existentes ya
--     cumplen la FK, asi que validarla de nuevo no rechaza ninguna.
--   · los indices: se rehacen mas abajo.
-- Lo demas (checks, unicos, identidad, default de `estado`) es identico.
alter table public.pagos
  add column if not exists monto_total integer;

do $$
declare
  r record;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pagos'::regclass
      and conname = 'pagos_total_no_menor_que_cobrado'
  ) then
    alter table public.pagos
      add constraint pagos_total_no_menor_que_cobrado
        check (monto_total is null or monto_total >= monto);
  end if;

  for r in
    select c.conname, a.attname, c.confrelid::regclass as padre
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.pagos'::regclass
      and c.contype = 'f'
      and a.attname in ('pedido_id', 'reserva_id')
      and c.confdeltype <> 'r'           -- 'r' = restrict; 'c' = cascade
  loop
    execute format(
      'alter table public.pagos drop constraint %I, '
      'add constraint %I foreign key (%I) references %s (id) on delete restrict',
      r.conname, r.conname, r.attname, r.padre);
  end loop;
end
$$;

comment on table public.pagos is
  'Intentos de cobro con Webpay Plus. Los escriben solo las Edge Functions con '
  'la service_role key; el navegador no tiene ningun privilegio de escritura.';
comment on column public.pagos.buy_order is
  'Orden de compra enviada a Transbank, maximo 26 caracteres. Unica por intento.';
comment on column public.pagos.token_ws is
  'Token de Webpay. Es la unica llave con la que se confirma el pago.';
comment on column public.pagos.monto is
  'Monto cobrado, calculado por el servidor desde la base. Nunca lo fija el cliente.';
comment on column public.pagos.monto_total is
  'Precio efectivo el dia del cobro cuando se pago solo un abono menor. El '
  'saldo pendiente es monto_total - monto. NULL si se cobro el total.';
comment on column public.pagos.confirmado_en is
  'Cuando se reclamo el commit contra Transbank. Reclamarla con un UPDATE '
  'condicional es lo que impide confirmar dos veces el mismo token. Puesta con '
  'estado iniciado = commit en curso.';

-- ----------------------------------------------------------------------------
-- Indices
-- ----------------------------------------------------------------------------
-- UN SOLO PAGO AUTORIZADO POR RESERVA Y POR PEDIDO.
--
-- `webpay-crear-transaccion` ya pregunta "hay un pago autorizado?" antes de
-- iniciar otro, pero entre esa pregunta y el commit hay minutos (la clienta
-- esta en Transbank). Dos pestanas pueden iniciar dos intentos y pagar los dos.
-- Estos indices no evitan que Transbank cobre dos veces —eso ocurre fuera de la
-- base—, pero si que ambos queden registrados como validos: el segundo UPDATE a
-- 'autorizado' falla con 23505 y `webpay-confirmar-transaccion` lo deja en
-- 'error' para devolucion manual.
--
-- Parciales sobre 'autorizado' y no sobre todos los estados: los reintentos
-- tras un rechazo o un abandono SI deben poder crear filas nuevas.
--
-- Consultas que los usan: el UPDATE de confirmacion (comprobacion de unicidad)
-- y la pregunta previa de `webpay-crear-transaccion`:
--   select id from pagos where reserva_id = $1 and estado = 'autorizado'
create unique index pagos_un_autorizado_por_reserva
  on public.pagos (reserva_id)
  where estado = 'autorizado';
create unique index pagos_un_autorizado_por_pedido
  on public.pagos (pedido_id)
  where estado = 'autorizado';

-- Los de la clave foranea. Con `on delete restrict`, borrar una reserva o un
-- pedido ejecuta `select 1 from pagos where reserva_id = $1`: sin indice, es
-- un recorrido completo de `pagos` por cada fila borrada. Los unicos de arriba
-- no sirven para eso porque solo cubren los autorizados.
--
-- El PR #28 creo indices con estos mismos nombres pero sobre
-- `(pedido_id, creado_en desc)`, para listar los intentos de un pedido, una
-- consulta que hoy no hace nadie. Se borran y se rehacen con la forma de aqui;
-- en una base nueva el `drop` no encuentra nada.
drop index if exists public.pagos_pedido_idx;
drop index if exists public.pagos_reserva_idx;
create index pagos_pedido_idx
  on public.pagos (pedido_id)
  where pedido_id is not null;
create index pagos_reserva_idx
  on public.pagos (reserva_id)
  where reserva_id is not null;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Se habilita ANTES de conceder nada, por el mismo motivo que en 0010: una
-- tabla con privilegios y sin RLS queda abierta durante la ventana entre las
-- dos sentencias.
alter table public.pagos enable row level security;

-- Supabase concede por defecto SELECT/INSERT/UPDATE/DELETE sobre las tablas
-- nuevas de `public` a `anon` y `authenticated`. Hay que quitarlo
-- explicitamente: sin esto, lo de arriba sobre "nadie escribe aqui" seria falso.
revoke all on public.pagos from anon, authenticated;

-- El personal del estudio ve los pagos para cuadrar caja y atender reclamos.
-- Solo lectura: ni el estudio declara un pago a mano.
--
-- El PR #28 creo esta misma politica con el mismo nombre. Se borra y se crea de
-- nuevo para que la definicion vigente sea la de este archivo y no la que se
-- aplico a mano.
drop policy if exists "El personal consulta los pagos" on public.pagos;
create policy "El personal consulta los pagos"
  on public.pagos
  for select
  to authenticated
  using (public.es_staff());

grant select on public.pagos to authenticated;

-- La clienta NO lee esta tabla, y no es un olvido. El comprobante se lo
-- devuelve `webpay-confirmar-transaccion` en la respuesta de la llamada, que ya
-- comprobo el token contra Transbank. Darle SELECT obligaria a decidir que
-- filas son "suyas" cuando compro sin cuenta —no hay `auth.uid()` que cruzar— y
-- la unica prueba de pertenencia seria el token, que es precisamente lo que la
-- funcion ya valida mejor.

-- ----------------------------------------------------------------------------
-- El abono del PR #28 pasa a `servicios.abono` (no hace nada en una base nueva)
-- ----------------------------------------------------------------------------
-- Aquel 0016 modelaba el abono con dos columnas: `cobrar_abono` (interruptor) y
-- `monto_abono` (cuanto). Este repo lo modela con una, `servicios.abono` (0015),
-- donde 0 significa "sin abono". Son la misma regla: "cobrar_abono y
-- monto_abono = N" es "abono = N".
--
-- En produccion el estudio encendio el abono de aquel modelo en cuatro
-- servicios de cabello. 0015 no les puso abono, porque su relleno excluye
-- cabello, asi que aqui se copia `monto_abono` a `abono`. Solo donde `abono`
-- sigue en 0: si 0015 ya le dio un abono propio, ese valor es el de este
-- modelo y se respeta.
--
-- No se topa contra el precio: el abono que se cobra lo topa por reserva el
-- trigger de 0019 (`least(abono, precio efectivo)`). La comprobacion del final
-- lista los servicios con abono para revisarlos en el panel.
--
-- Despues se borran las dos columnas. Nada en este repo las lee (front, Edge
-- Functions ni tipos), y dejarlas seria tener dos fuentes de verdad para lo
-- mismo. Sus dos checks (`servicios_monto_abono_positivo`,
-- `servicios_abono_necesita_monto`) y sus comentarios se van con ellas.
--
-- El `update` va dentro de un bloque porque en una base nueva las columnas no
-- existen; plpgsql solo resuelve los nombres al ejecutar la rama.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'servicios'
      and column_name  = 'cobrar_abono'
  ) then
    update public.servicios
    set abono = monto_abono
    where cobrar_abono
      and abono = 0
      and monto_abono is not null;
  end if;
end
$$;

alter table public.servicios
  drop column if exists cobrar_abono,
  drop column if exists monto_abono;

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- En una base nueva la tabla nace vacia y `pagos` es 0. En produccion son los
-- 7 pagos de prueba previos, y `fk_restrict` debe ser 2 en los dos casos.
select
  count(*)                                             as pagos,
  count(*) filter (where estado = 'autorizado')        as autorizados,
  (select count(*) from pg_constraint
    where conrelid = 'public.pagos'::regclass
      and contype = 'f' and confdeltype = 'r')         as fk_restrict
from public.pagos;

-- Servicios con abono: revisar en el panel que ninguno supere su precio.
select id, nombre, categoria, precio_base, abono
from public.servicios
where abono > 0
order by id;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Rollback (no se ejecuta; copiar a mano si hace falta revertir)
-- ----------------------------------------------------------------------------
-- BASE NUEVA.
-- ⚠ Destructivo: pierde el registro de cobros reales. Antes de revertir con
-- pagos autorizados, respaldar y conciliar con el portal de Transbank:
--   create table respaldo_pagos as select * from public.pagos;
--
-- Las Edge Functions webpay-* dejan de funcionar al quitar la tabla: retirarlas
-- (o el boton de pago del front) ANTES.
--
--   drop table public.pagos;          -- arrastra indices, politica y grants
--   drop type public.estado_pago;
--   notify pgrst, 'reload schema';
--
-- PRODUCCION (la tabla venia del PR #28). No se borra `pagos`: tenia filas
-- antes de este archivo. Lo unico que tiene sentido revertir es el abono, para
-- volver al front y las funciones del PR #28. Los ids son los que listo la
-- comprobacion de antes de aplicar (en produccion, 3, 18, 19 y 21):
--
--   alter table public.servicios
--     add column cobrar_abono boolean not null default false,
--     add column monto_abono integer default 5000
--       constraint servicios_monto_abono_positivo
--         check (monto_abono is null or monto_abono > 0),
--     add constraint servicios_abono_necesita_monto
--       check (not cobrar_abono or monto_abono is not null);
--   update public.servicios
--     set cobrar_abono = true, monto_abono = abono, abono = 0
--     where id = any(array[3, 18, 19, 21]);
--   notify pgrst, 'reload schema';
--
-- Volver las FKs a `cascade` no se revierte a proposito (ver arriba).
