-- ============================================================================
-- NuraVision · 0015 · Abono por servicio
-- ============================================================================
-- El estudio exige un abono para reservar los servicios de uñas (decision del
-- dueño, 2026-10-08). Contrato en openspec/changes/abono-servicios-unas/.
--
--   · servicios.abono  lo que se exige al reservar ese servicio. Lo edita el
--                      personal desde el panel.
--   · reservas.abono   COPIA del abono del servicio al crear la reserva. La
--                      fija la base, no el navegador, y no se edita despues.
--
-- Montos en pesos chilenos ENTEROS: CLP no usa decimales, y un `integer` no
-- deja que un 5000.50 llegue a la pantalla.
--
-- Aditiva: no borra ni reescribe columnas existentes. Las reservas previas
-- quedan con abono 0, que es la verdad: cuando se tomaron no se exigia nada.
--
-- Sin `if not exists` a proposito, a diferencia de 0010–0014: si la columna ya
-- existe es que alguien aplico esto a mano, y conviene que falle en vez de
-- seguir de largo sobre un esquema que no sabemos como quedo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- servicios.abono
-- ----------------------------------------------------------------------------
-- `not null default 0`: con un default constante Postgres agrega la columna sin
-- reescribir la tabla, y cada fila existente nace "sin abono".
--
-- El check es solo `>= 0`. NO hay tope contra `precio_base` (design.md,
-- decision 2): con variantes (0011) el precio cobrado es el de la opcion, que
-- puede ser menor que `precio_base`, asi que ese check dejaria pasar abonos
-- mayores que lo cobrado y rechazaria configuraciones validas. El tope real es
-- `abono <= precioDesde(servicio)` y lo valida el dominio al escribir.
--
-- Tampoco hay check "uñas => abono > 0": la categoria es texto libre y su
-- normalizacion vive en el frontend (`toCategoria`); duplicarla en un check la
-- dejaria desincronizada a la primera (decision 1).
alter table public.servicios
  add column abono integer not null default 0
    constraint servicios_abono_no_negativo check (abono >= 0);

comment on column public.servicios.abono is
  'Abono en CLP enteros que se exige al reservar. 0 = sin abono. Los servicios '
  'de uñas lo requieren > 0 (regla del dominio, no de la base). Cambiarlo no '
  'altera reservas ya creadas: cada una guarda su copia en reservas.abono.';

-- `servicios` ya tiene UPDATE completo para el personal (0010): el panel puede
-- escribir la columna sin conceder nada. `anon` no tiene escritura.

-- ----------------------------------------------------------------------------
-- reservas.abono
-- ----------------------------------------------------------------------------
-- Se llama `abono` y no `abono_pagado` (decision 6): el pago es simulado y la
-- base no tiene como comprobar que hubo pago. Registra lo EXIGIDO.
--
-- Es una copia y no se deriva del servicio por el mismo criterio que
-- `hora_fin` (0003) y `detalles_extra` (0011): si el estudio cambia el abono
-- mañana, las reservas ya tomadas deben conservar el del dia en que se tomaron.
alter table public.reservas
  add column abono integer not null default 0
    constraint reservas_abono_no_negativo check (abono >= 0);

comment on column public.reservas.abono is
  'Abono en CLP EXIGIDO al crear la reserva, copiado de servicios.abono por el '
  'trigger reservas_fijar_abono; lo que envie el navegador se ignora. No es '
  'comprobante de pago (el pago es simulado). No se edita despues: no esta en '
  'ningun GRANT UPDATE.';

-- PRIVILEGIOS: ninguno nuevo, y es deliberado. 0005 revoco el UPDATE de tabla
-- sobre `reservas` y lo reconcedio por columnas (estado, fecha, hora_inicio,
-- hora_fin); 0006 repitio esas cuatro. Una columna agregada despues NO hereda
-- un grant por columnas, asi que `abono` queda sin UPDATE para anon y
-- authenticated — clientela y personal por igual. NO escribir aqui un
-- `grant update on public.reservas`: desharia en silencio lo de 0005 y 0006.

-- ----------------------------------------------------------------------------
-- Trigger: la base fija reservas.abono
-- ----------------------------------------------------------------------------
-- POR QUE UN TRIGGER Y NO ALGO DECLARATIVO: el valor sale de OTRA tabla.
--   · Un `default` no admite subconsultas, y ademas el navegador lo pisaria
--     enviando la columna.
--   · Una columna generada solo puede usar la propia fila y funciones
--     inmutables; tampoco congelaria el valor (se recalcularia).
--   · Un check (`abono = (select ...)`) no admite subconsultas, y aunque las
--     admitiera rechazaria el insert en vez de corregirlo.
-- Lo unico que copia un valor de otra tabla en el momento del insert, ignorando
-- lo que mande el cliente, es un BEFORE INSERT.
--
-- SIN `security definer` (decision 5): `servicios` es legible por anon y
-- authenticated sin filtro (0002, politica `using (true)`), asi que el trigger
-- lee con los permisos de quien inserta y no salta ninguna RLS. Si algun dia
-- esa politica filtra por `activo`, este trigger dejaria de ver los servicios
-- inactivos y la reserva fallaria con "servicio no existe": revisar aqui antes
-- de tocarla.
--
-- `search_path` fijo igual que el resto de funciones del repo.
--
-- SI EL SERVICIO NO SE VE, FALLA (no copia 0). El trigger corre antes que la
-- clave foranea, asi que "no encontrado" significa una de dos cosas: el
-- `servicio_id` no existe, o la RLS lo oculta a quien inserta. En el segundo
-- caso la FK SI pasaria (se comprueba sin RLS) y un `coalesce(..., 0)` dejaria
-- crear la reserva con abono 0 sin que nadie se enterara: justo el agujero que
-- esta columna existe para cerrar. Se lanza 23503 (foreign_key_violation), el
-- mismo codigo que daria la FK, para que el front lo trate igual.
--
-- Solo BEFORE INSERT, no UPDATE: `abono` no es actualizable desde el navegador
-- (ver privilegios arriba) y `servicio_id` tampoco, asi que no hay update que
-- deba recalcularlo. Quien tiene la service_role key puede corregirlo a mano,
-- que es justo lo que se quiere para el personal tecnico.
create function public.fijar_abono_reserva()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  select s.abono into new.abono
  from public.servicios s
  where s.id = new.servicio_id;

  if not found then
    raise exception 'servicio % no existe', new.servicio_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

comment on function public.fijar_abono_reserva() is
  'BEFORE INSERT en reservas: copia servicios.abono en reservas.abono e ignora '
  'el valor enviado; si el servicio no es visible lanza 23503 en vez de copiar '
  '0. security invoker: servicios es de lectura publica (0002).';

create trigger reservas_fijar_abono
  before insert on public.reservas
  for each row execute function public.fijar_abono_reserva();

-- ----------------------------------------------------------------------------
-- Relleno inicial de los servicios de uñas (design.md, decision 4)
-- ----------------------------------------------------------------------------
-- abono = least(desde, greatest(1000, round(desde * 0.30 / 1000) * 1000))
--
-- `desde` es lo mismo que `precioDesde()` en el dominio: el minimo precio de
-- las opciones si el servicio tiene variantes, o `precio_base` si no. Las
-- opciones se filtran igual que `aVariante` en servicio.mapper.ts (precio
-- numerico >= 0 y etiqueta con texto): si ninguna sobrevive, el mapper trata
-- el servicio como sin variantes y aqui se cae a `precio_base`.
--
-- REDONDEO: todo el calculo va en `numeric` (`precio_base` es numeric(10,2),
-- `0.30` es un literal numeric y el precio de la opcion se castea a numeric,
-- nunca a float). Importa: `round(numeric)` redondea la mitad ALEJANDOSE de
-- cero (4.5 -> 5), mientras que `round(double precision)` redondea la mitad al
-- PAR (4.5 -> 4). "manicure rapida" (15.000 * 0.30 = 4.500) es justo ese caso y
-- el contrato espera 5.000.
--
-- `floor(desde)` en el `least`: con un precio con centavos (999.50) el tope
-- seria 999.50 y el cast a integer lo subiria a 1000, por encima del precio. Con
-- precios enteros, que son todos los de hoy, es identico a `desde`.
--
-- QUE ES "UÑAS": lo que `toCategoria` clasifica como tal, que es todo lo que
-- NO se reconoce como otra categoria (incluidos null, vacio y desconocidos).
-- La normalizacion imita `normalizarTexto`: sin tildes, minusculas, espacios
-- colapsados. `translate` cubre las vocales con tilde, la ü y la ñ en ambas
-- cajas; se pasa a ASCII antes de `lower` para no depender de la configuracion
-- regional de la base. Si se clasificara distinto que el frontend, editar ese
-- servicio en el panel fallaria por la regla "uñas exige abono > 0".
--
-- Una sola sentencia y no por lotes: son ~17 filas de catalogo.
with desde as (
  select
    s.id,
    coalesce(
      (
        select min((o ->> 'precio')::numeric)
        from jsonb_array_elements(s.variantes -> 'opciones') as o
        where jsonb_typeof(o -> 'precio') = 'number'
          and (o ->> 'precio')::numeric >= 0
          and jsonb_typeof(o -> 'etiqueta') = 'string'
          and btrim(o ->> 'etiqueta') <> ''
      ),
      s.precio_base
    ) as valor
  from public.servicios s
  where coalesce(
          btrim(regexp_replace(
            lower(translate(s.categoria, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
            '\s+', ' ', 'g'
          )),
          ''
        ) not in ('cabello', 'piel', 'diagnostico', 'estilismo', 'estetica')
)
update public.servicios s
set abono = least(
              floor(d.valor),
              greatest(1000, round(d.valor * 0.30 / 1000) * 1000)
            )::integer
from desde d
where d.id = s.id;

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Con el catalogo real/seed debe dar: Manicura Completa 5000, Esmaltado
-- Tradicional 4000, Esmaltado Permanente 7000, Esculpido de Uñas 11000,
-- manicure rapida 5000, y 0 en Estilismo y Estetica.
--
-- `revisar` marca un servicio de uñas que quedo con abono 0 (precio «desde» 0):
-- el panel no lo dejara guardar hasta que se le ponga precio y abono.
select
  nombre,
  categoria,
  precio_base,
  abono,
  abono = 0
    and coalesce(
          btrim(regexp_replace(
            lower(translate(categoria, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
            '\s+', ' ', 'g'
          )),
          ''
        ) not in ('cabello', 'piel', 'diagnostico', 'estilismo', 'estetica')
    as revisar
from public.servicios
order by categoria nulls first, nombre;

-- Categorias con un caracter no ASCII que el `translate` de arriba no cubre
-- (à, â, ç, una tilde combinante, etc.). Debe dar CERO filas. Si da alguna,
-- esa categoria se normalizo distinto que en `normalizarTexto` del frontend y
-- el servicio pudo clasificarse mal como uñas o como no-uñas: revisarlo a mano.
select distinct categoria
from public.servicios
where translate(categoria, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun') ~ '[^\x01-\x7F]';

-- Todas las reservas existentes deben quedar en 0: `con_abono` = 0.
select count(*) as reservas, count(*) filter (where abono > 0) as con_abono
from public.reservas;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Rollback (no se ejecuta; copiar a mano si hace falta revertir)
-- ----------------------------------------------------------------------------
-- ⚠ Destructivo: pierde los abonos configurados en servicios y el registro del
-- abono exigido en cada reserva. Respaldar antes si ya hay reservas con abono:
--   create table respaldo_abono_reservas as select id, abono from public.reservas where abono > 0;
--   create table respaldo_abono_servicios as select id, abono from public.servicios;
--
-- Y antes de revertir, el frontend tiene que haber dejado de leer `abono`
-- (el mapper lo tolera ausente -> 0, ver design.md).
--
--   drop trigger reservas_fijar_abono on public.reservas;
--   drop function public.fijar_abono_reserva();
--   alter table public.reservas  drop column abono;
--   alter table public.servicios drop column abono;
--   notify pgrst, 'reload schema';
