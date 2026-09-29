-- ============================================================================
-- NuraVision · 0007 · Cada profesional lee las horas que atiende
-- ============================================================================
-- Hasta ahora `reservas` solo tenia dos lecturas posibles: la clienta duenia
-- de la fila (0004) y el personal del estudio (0006). No habia ninguna para
-- "la profesional que atiende esta hora", asi que su propio panel salia vacio
-- salvo que se le diera `es_staff`, que es un permiso mucho mas amplio del que
-- necesita: con el veria TODAS las reservas del estudio, no solo las suyas.
--
-- ----------------------------------------------------------------------------
-- COMO SE VINCULA UNA CUENTA CON SU FICHA
-- ----------------------------------------------------------------------------
-- Con `profesional_id` dentro de `app_metadata`, igual que `es_staff` y por el
-- mismo motivo: es el unico metadato que la propia persona no puede escribir.
--
-- No se cruza por correo porque NO SE PUEDE: `profesionales` no tiene columna
-- de email. El vinculo hay que declararlo.
--
--   select id, nombre from public.profesionales order by id;
--
--   -- Panel de Supabase > Authentication > Users > (usuario) > Raw app meta:
--   {"profesional_id": 3}
--
--   -- o por API de administracion:
--   supabase.auth.admin.updateUserById(id, { app_metadata: { profesional_id: 3 } })
--
-- Las dos marcas conviven: una cuenta puede tener `es_staff` y ficha a la vez
-- (la duenia del estudio que ademas atiende), y vera todo por la politica de
-- 0006. Las politicas permisivas se combinan con OR.
--
-- OJO: el JWT se emite al iniciar sesion. Quien ya tuviera sesion abierta
-- seguira sin el vinculo hasta que su token se refresque o vuelva a entrar.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Que ficha le corresponde a la sesion
-- ----------------------------------------------------------------------------
-- `app_metadata` es JSON libre: la marca puede llegar como numero (3) o como
-- texto ("3"), segun se escriba desde el panel, desde la API o desde SQL.
-- `->>` devuelve texto en ambos casos.
--
-- EL CAST VA PROTEGIDO POR UNA COMPROBACION, y esto no es paranoia: un
-- `'abc'::bigint` no devuelve NULL, LANZA UN ERROR. Sin la guarda, una marca
-- mal escrita no dejaria a esa persona sin permiso —que seria lo correcto—,
-- sino que reventaria toda consulta a `reservas` que evaluara esta politica,
-- incluidas las de terceros.
--
-- Sin marca, o con una que no sea un entero, devuelve NULL. Y `profesional_id
-- = NULL` nunca es verdadero, asi que el caso normal —una clienta cualquiera—
-- se niega solo.
create or replace function public.mi_profesional_id()
  returns bigint
  language sql
  stable
  -- `security invoker` (el valor por defecto): la funcion debe evaluar el JWT
  -- de quien llama, no el de quien la creo.
  set search_path = public, pg_temp
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'profesional_id', '') ~ '^[0-9]+$'
      then (auth.jwt() -> 'app_metadata' ->> 'profesional_id')::bigint
    else null
  end;
$$;

comment on function public.mi_profesional_id() is
  'Ficha de profesionales vinculada a la sesion, o NULL. Sale de app_metadata, '
  'que solo se escribe con la service_role key, nunca desde el navegador.';

grant execute on function public.mi_profesional_id() to authenticated;

-- ----------------------------------------------------------------------------
-- Lectura de las reservas propias como profesional
-- ----------------------------------------------------------------------------
-- Se suma a las de 0004 y 0006 en vez de reemplazarlas: varias politicas
-- permisivas para el mismo comando se combinan con OR. El resultado es que
-- cada clienta sigue viendo lo suyo, el personal lo ve todo, y cada
-- profesional ve exactamente las horas que le toca atender.
--
-- La condicion se escribe con la funcion a la izquierda para dejar claro que
-- el filtro lo pone la sesion, no la fila.
drop policy if exists "Lectura de reservas asignadas al profesional" on public.reservas;

create policy "Lectura de reservas asignadas al profesional"
  on public.reservas
  for select
  to authenticated
  using (profesional_id = public.mi_profesional_id());

-- El SELECT sobre la tabla ya esta concedido a `authenticated` (por 0004, y
-- por los privilegios por defecto del proyecto). Se repite por si esta
-- migracion se aplica sobre una base donde 0004 todavia no corrio.
grant select on public.reservas to authenticated;

-- ----------------------------------------------------------------------------
-- Endurece la marca de personal de 0006
-- ----------------------------------------------------------------------------
-- Mismo problema que arriba, y conviene arreglarlo ahora que esta a la vista:
-- `es_staff` se casteaba directo con `::boolean`. Con `true` o `"true"`
-- funciona, pero con cualquier otro texto —un `"si"`, un `1` escrito a mano—
-- el cast lanza un error en vez de denegar, y tumba la consulta entera.
--
-- Ahora solo se acepta lo que de verdad significa verdadero; cualquier otra
-- cosa es "no es personal". Ante la duda, se niega.
create or replace function public.es_staff()
  returns boolean
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select coalesce(
    lower(auth.jwt() -> 'app_metadata' ->> 'es_staff') in ('true', 't', '1'),
    false
  );
$$;

-- ----------------------------------------------------------------------------
-- Lo que esta migracion NO abre
-- ----------------------------------------------------------------------------
-- El profesional solo LEE. No puede confirmar, cancelar ni reprogramar las
-- horas que atiende: 0005 deja el UPDATE acotado a la clienta duenia y 0006 al
-- personal. Si el estudio quiere que cada profesional gestione su propia
-- agenda, es una politica aparte y una decision de producto, no un efecto
-- secundario de poder verla.
--
-- Tampoco abre `disponibilidad` a escritura: editar el horario desde el panel
-- sigue sin llegar a la base.

notify pgrst, 'reload schema';
