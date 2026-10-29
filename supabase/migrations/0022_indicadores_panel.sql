-- ============================================================================
-- NuraVision · 0022 · Indicadores del panel de administracion
-- ============================================================================
-- Contrato en openspec/changes/indicadores-panel-admin/design.md (decisiones
-- del 2026-10-29). El Dashboard y la Analitica dejan de calcular sobre el
-- estado semilla del navegador y leen estos agregados de la base.
--
-- Aditiva: una funcion de solo lectura y sus privilegios. NO crea ni modifica
-- tablas, columnas, indices, politicas ni privilegios de tabla.
--
-- Numerada 0022 porque 0020 (fix/perfil-editable) y 0021
-- (feature/catalogo-productos) estan tomadas por ramas sin integrar. No comparte
-- objetos con ninguna de las dos, asi que el orden de aplicacion entre ellas da
-- igual.
--
-- POR QUE AGREGAR EN SQL (decision 1): PostgREST corta en `max_rows` (1.000 por
-- defecto en Supabase) SIN error. «Este año» con algunos miles de reservas
-- daria totales falsos en el navegador, y contar alli obliga a descargar el
-- contacto de toda la clientela para producir numeros.
--
-- POR QUE security invoker + es_staff() EXPLICITO (decision 2):
--   · `security definer` saltaria la RLS sin necesidad: 0006 (reservas) y 0010
--     (perfiles) ya dejan al personal leer todo, y 0002 deja leer servicios y
--     profesionales a cualquiera.
--   · Apoyarse SOLO en la RLS no basta, porque la RLS filtra, no rechaza: una
--     clienta recibiria agregados de sus propias reservas (0004) y una
--     profesional los de su agenda (0007), con aspecto de indicadores validos.
--     La comprobacion explicita convierte eso en un error 42501.
--
-- Sin indice nuevo: el volumen es de cientos a pocos miles de reservas al año y
-- un escaneo de `reservas` es barato. Si hace falta, se mide primero con
-- `explain (analyze, buffers)` (design.md, decision 1).
--
-- Sin `create or replace` a proposito: si la funcion ya existe es que alguien
-- la creo a mano, y conviene que falle en vez de pisarla en silencio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- search_path VACIO, y por que no `public, pg_temp`
-- ----------------------------------------------------------------------------
-- La auditoria de 0020 encontro que fijar `public, pg_temp` no basta:
-- pg_catalog se busca antes que public, pero solo gana cuando su funcion
-- coincide EXACTAMENTE con los tipos. Una `public.to_char(date, text)` o una
-- `public.jsonb_build_object(text, ...)` plantadas ganarian la resolucion. 0020
-- lo resolvio calificando esas llamadas con `pg_catalog.`.
--
-- Aqui eso no alcanzaria: lo mismo pasa con los OPERADORES, que no se pueden
-- calificar sin la sintaxis `operator(pg_catalog.=)`. `estado = 'cancelada'`
-- busca un `=(estado_reserva, estado_reserva)` exacto, y pg_catalog solo tiene
-- `=(anyenum, anyenum)`: un operador plantado en public ganaria. Igual con
-- `->` sobre un literal sin tipo.
--
-- Con `search_path = ''` en public no se busca nada: solo pg_catalog (siempre
-- implicito) y, para relaciones, pg_temp, que aqui no importa porque toda
-- tabla va calificada con `public.`. Cubre funciones Y operadores sin calificar
-- cada llamada. Es mas estricto que lo que pide design.md (`public, pg_temp`)
-- y es la recomendacion del linter de Supabase.
--
-- Aunque sea `security invoker`, importa: quien la llama es el personal, y una
-- funcion plantada correria con su sesion (y su JWT con es_staff).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- La funcion
-- ----------------------------------------------------------------------------
-- plpgsql y no sql: hace falta lanzar errores ANTES de leer nada, y una
-- funcion `language sql` no tiene `raise`.
--
-- Errores (el front los distingue por codigo y hint, no por texto):
--   · 42501 (insufficient_privilege) si la sesion no es del personal: anon,
--     clienta o profesional sin es_staff. Va primero: nadie fuera del personal
--     aprende nada de la funcion, ni siquiera si su rango era valido.
--   · 22023 (invalid_parameter_value), hint 'rango_invalido', si falta un
--     extremo o p_desde > p_hasta. Un solo dia (p_desde = p_hasta) es valido.
--
-- QUE ESTADOS CUENTAN DONDE (design.md, decision 4): las canceladas existieron
-- y son el denominador de la tasa de cancelacion, asi que cuentan en
-- `reservas`, `por_estado`, `por_mes` y `clientas_distintas`; no son
-- atenciones, asi que NO cuentan en `ingresos_estimados`, `por_servicio` ni
-- `por_profesional`.
--
-- INGRESO ESTIMADO (decision 3, y respuesta del responsable del 2026-10-29 a
-- la pregunta abierta de tasks.md): suma del precio acordado de TODAS las
-- reservas no canceladas del rango, incluidas las pendientes y las futuras.
-- Ninguna pantalla marca reservas como completadas: filtrar por estado daria 0
-- en produccion. Por eso se rotula «Ingresos estimados» y no es dinero cobrado.
--
-- El cast del precio de la variante va dentro de un `case` que antes mira
-- `jsonb_typeof(...) = 'number'`: `'abc'::numeric` LANZA, y el `case` es lo que
-- garantiza el orden de evaluacion (0011, 0019). Un precio que no sea numero
-- JSON —texto, null, objeto, clave ausente— cae al `precio_base`.
--
-- `por_estado` nombra los 4 valores del enum `estado_reserva` uno por uno, y
-- es deliberado: el contrato (y el tipo TS) los fija. Si el enum gana un valor,
-- hay que sumarlo aqui y en supabase.ts; si no, `sum(por_estado)` dejaria de
-- ser igual a `reservas`.
--
-- Meses: se calculan con `timestamp` (sin zona) para que el resultado no
-- dependa del TimeZone de la sesion; `date_trunc` sobre un `date` a secas
-- elegiria la version `timestamptz`. Se ordenan por la fecha, no por el texto.
--
-- Los joins con servicios y profesionales son inner: `servicio_id` y
-- `profesional_id` son NOT NULL con clave foranea (0003), y ambas tablas son de
-- lectura publica `using (true)` (0002). Si algun dia esa lectura filtrara (por
-- `activo`, por ejemplo), las reservas de lo filtrado desaparecerian de TODOS
-- los totales sin error: revisar aqui antes.
create function public.indicadores_panel(p_desde date, p_hasta date)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not public.es_staff() then
    raise exception 'Solo el personal del estudio puede ver los indicadores.'
      using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.'
      using errcode = '22023', hint = 'rango_invalido';
  end if;

  with base as (
    select
      r.estado,
      r.servicio_id,
      s.nombre                                   as servicio_nombre,
      r.profesional_id,
      p.nombre                                   as profesional_nombre,
      date_trunc('month', r.fecha::timestamp)    as mes,
      lower(btrim(r.cliente_email))              as email,
      case
        when r.estado = 'cancelada' then null
        when jsonb_typeof(r.detalles_extra -> 'variante' -> 'precio') = 'number'
          then (r.detalles_extra -> 'variante' ->> 'precio')::numeric
        else s.precio_base
      end                                        as precio_acordado
    from public.reservas r
    join public.servicios s     on s.id = r.servicio_id
    join public.profesionales p on p.id = r.profesional_id
    where r.fecha between p_desde and p_hasta
  ),
  totales as (
    select
      count(*)                                         as reservas,
      count(*) filter (where estado = 'pendiente')     as pendiente,
      count(*) filter (where estado = 'confirmada')    as confirmada,
      count(*) filter (where estado = 'completada')    as completada,
      count(*) filter (where estado = 'cancelada')     as cancelada,
      -- bigint: el contrato pide enteros, y `precio_base` es numeric(10,2).
      coalesce(round(sum(precio_acordado)), 0)::bigint as ingresos,
      count(distinct email)                            as clientas
    from base
  )
  select jsonb_build_object(
    'desde',                to_char(p_desde::timestamp, 'YYYY-MM-DD'),
    'hasta',                to_char(p_hasta::timestamp, 'YYYY-MM-DD'),
    'reservas',             t.reservas,
    'por_estado',           jsonb_build_object(
                              'pendiente',  t.pendiente,
                              'confirmada', t.confirmada,
                              'completada', t.completada,
                              'cancelada',  t.cancelada
                            ),
    'ingresos_estimados',   t.ingresos,
    'clientas_distintas',   t.clientas,
    -- No depende del rango (contrato). La lee el personal por la politica
    -- «El personal gestiona los perfiles» de 0010.
    'clientas_registradas', (select count(*)
                               from public.perfiles pf
                              where pf.rol = 'cliente'),
    -- Un elemento por mes que toca el rango, incluidos los de 0. Nunca vacio:
    -- el rango ya se valido, asi que hay al menos un mes.
    'por_mes',              (select jsonb_agg(
                                      jsonb_build_object(
                                        'mes',        to_char(m.mes, 'YYYY-MM'),
                                        'reservas',   coalesce(c.reservas, 0),
                                        'canceladas', coalesce(c.canceladas, 0)
                                      )
                                      order by m.mes)
                               from generate_series(
                                      date_trunc('month', p_desde::timestamp),
                                      date_trunc('month', p_hasta::timestamp),
                                      interval '1 month'
                                    ) as m(mes)
                               left join (
                                 select b.mes,
                                        count(*) as reservas,
                                        count(*) filter (where b.estado = 'cancelada') as canceladas
                                   from base b
                                  group by b.mes
                               ) c on c.mes = m.mes),
    'por_servicio',         (select coalesce(jsonb_agg(
                                      jsonb_build_object(
                                        'servicio_id', x.servicio_id,
                                        'nombre',      x.servicio_nombre,
                                        'reservas',    x.reservas
                                      )
                                      order by x.reservas desc, x.servicio_nombre, x.servicio_id),
                                    '[]'::jsonb)
                               from (select b.servicio_id, b.servicio_nombre, count(*) as reservas
                                       from base b
                                      where b.estado <> 'cancelada'
                                      group by b.servicio_id, b.servicio_nombre) x),
    'por_profesional',      (select coalesce(jsonb_agg(
                                      jsonb_build_object(
                                        'profesional_id', x.profesional_id,
                                        'nombre',         x.profesional_nombre,
                                        'reservas',       x.reservas
                                      )
                                      order by x.reservas desc, x.profesional_nombre, x.profesional_id),
                                    '[]'::jsonb)
                               from (select b.profesional_id, b.profesional_nombre, count(*) as reservas
                                       from base b
                                      where b.estado <> 'cancelada'
                                      group by b.profesional_id, b.profesional_nombre) x)
  )
  into v_resultado
  from totales t;

  return v_resultado;
end;
$$;

comment on function public.indicadores_panel(date, date) is
  'Agregados del Dashboard y la Analitica para reservas con fecha entre p_desde y '
  'p_hasta (contrato en openspec/changes/indicadores-panel-admin/design.md). Solo '
  'personal: 42501 si no es_staff(); 22023 hint rango_invalido si falta un extremo '
  'o p_desde > p_hasta. ingresos_estimados = precio acordado de las reservas NO '
  'canceladas (incluidas pendientes y futuras), NO dinero cobrado. LIMITACIONES: '
  'las reservas sin variante usan el precio_base ACTUAL del servicio (reservas no '
  'tiene columna de precio, 0011); las reservas con variante anteriores a 0019 '
  'conservan el precio que mando el navegador (ver la comprobacion final de 0019).';

-- ----------------------------------------------------------------------------
-- Privilegios
-- ----------------------------------------------------------------------------
-- Postgres concede EXECUTE a PUBLIC al crear una funcion, y los privilegios por
-- defecto de Supabase se lo conceden ademas a `anon` directamente: hay que
-- revocar los dos. Sin execute, una llamada sin sesion falla con 42501 antes de
-- entrar a la funcion.
--
-- `authenticated` incluye a clientas y profesionales: los rechaza la
-- comprobacion de es_staff() dentro, no el privilegio, porque el personal es el
-- mismo rol de Postgres.
revoke execute on function public.indicadores_panel(date, date) from public, anon;
grant  execute on function public.indicadores_panel(date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Esperado: una fila con security_definer = false, volatilidad 's' (stable),
-- config {search_path=""}, anon_execute = false, authenticated_execute = true.
select
  p.prosecdef                                                 as security_definer,
  p.provolatile                                               as volatilidad,
  p.proconfig                                                 as config,
  has_function_privilege('anon', p.oid, 'execute')            as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute')   as authenticated_execute
from pg_proc p
where p.oid = 'public.indicadores_panel(date, date)'::regprocedure;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Rollback (no se ejecuta; copiar a mano si hace falta revertir)
-- ----------------------------------------------------------------------------
-- No destructivo: no hay datos que perder. El Dashboard y la Analitica que lean
-- esta funcion pasaran a mostrar su estado de error.
--
--   drop function public.indicadores_panel(date, date);
--   notify pgrst, 'reload schema';
