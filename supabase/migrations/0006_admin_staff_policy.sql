-- ============================================================================
-- NuraVision · 0006 · Gestion de reservas por el personal del estudio
-- ============================================================================
-- El panel de administracion necesita dos cosas que hasta ahora nadie podia
-- hacer desde el navegador: leer las reservas de toda la clientela y pasarlas
-- a 'confirmada'. Las dos estaban cerradas a proposito, asi que esta migracion
-- abre exactamente esas dos, y solo para el personal.
--
-- ----------------------------------------------------------------------------
-- COMO SE IDENTIFICA AL PERSONAL
-- ----------------------------------------------------------------------------
-- Con la marca `es_staff` dentro de `app_metadata` del usuario.
--
-- Es la parte importante de este diseño: `app_metadata` NO la puede escribir
-- quien inicia sesion. Solo se modifica con la service_role key, desde el
-- panel de Supabase o un backend. Su gemela `user_metadata` si la puede
-- cambiar cualquiera con su propia sesion —ahi es donde el registro guarda el
-- nombre y el telefono—, asi que usarla para esto habria dejado que cualquier
-- clienta se ascendiera a administradora editando su propio perfil.
--
-- Para marcar a alguien del estudio, con la service_role key:
--
--   select id from auth.users where email = 'quien@estudionura.cl';
--
--   -- Panel de Supabase > Authentication > Users > (usuario) > Raw app meta:
--   {"es_staff": true}
--
--   -- o por API de administracion:
--   supabase.auth.admin.updateUserById(id, { app_metadata: { es_staff: true } })
--
-- OJO: el JWT se emite al iniciar sesion. Quien ya tuviera sesion abierta
-- seguira sin la marca hasta que su token se refresque o vuelva a entrar.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Quien es personal
-- ----------------------------------------------------------------------------
-- En una funcion y no repetida en cada politica: si mañana el estudio cambia
-- de mecanismo (una tabla `perfiles`, un rol de Postgres), se reescribe aqui y
-- las politicas no se tocan.
--
-- Si la marca falta, `->>` devuelve NULL, el cast da NULL y la comparacion no
-- es verdadera: se niega el acceso. El caso normal —una clienta cualquiera—
-- cae por ahi.
create or replace function public.es_staff()
  returns boolean
  language sql
  stable
  -- `security invoker` (el valor por defecto): la funcion debe evaluar el JWT
  -- de quien llama, no el de quien la creo.
  set search_path = public, pg_temp
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'es_staff')::boolean,
    false
  );
$$;

comment on function public.es_staff() is
  'Verdadero si la sesion actual tiene es_staff en app_metadata. '
  'app_metadata solo se escribe con la service_role key, nunca desde el navegador.';

grant execute on function public.es_staff() to authenticated;

-- ----------------------------------------------------------------------------
-- Lectura completa
-- ----------------------------------------------------------------------------
-- Se suma a la politica de 0004 en vez de reemplazarla: varias politicas
-- permisivas para el mismo comando se combinan con OR. El resultado es que
-- cada clienta sigue viendo lo suyo y el personal lo ve todo.
drop policy if exists "Lectura de reservas por el personal" on public.reservas;

create policy "Lectura de reservas por el personal"
  on public.reservas
  for select
  to authenticated
  using (public.es_staff());

-- ----------------------------------------------------------------------------
-- Actualizacion completa
-- ----------------------------------------------------------------------------
-- Sin las restricciones de estado que 0005 le impone a la clientela: el
-- personal SI puede dejar una reserva en 'confirmada' o 'completada'. Es
-- justamente la decision que 0003 reservo para el estudio.
drop policy if exists "Gestion de reservas por el personal" on public.reservas;

create policy "Gestion de reservas por el personal"
  on public.reservas
  for update
  to authenticated
  using (public.es_staff())
  with check (public.es_staff());

-- ----------------------------------------------------------------------------
-- Permisos de columna: por que NO se conceden todas
-- ----------------------------------------------------------------------------
-- Aqui hay una trampa que conviene dejar escrita.
--
-- La politica de arriba autoriza la fila entera, pero un GRANT de UPDATE es
-- del ROL, no de la politica. Y tanto el personal como la clientela son el
-- mismo rol: `authenticated`. Asi que todo lo que se conceda aqui se le
-- concede tambien a cualquiera con una cuenta.
--
-- 0005 revoco el UPDATE y lo reconcedio solo sobre estas cuatro columnas,
-- precisamente para que una clienta no pudiera cambiar el `servicio_id` de su
-- reserva por uno mas caro ya tomado, moverla a otra profesional o reescribir
-- el `codigo`. Un `grant update on public.reservas` a secas en esta migracion
-- desharia esa proteccion en silencio.
--
-- Se conceden las mismas cuatro, y basta: el panel confirma, reprograma y
-- cancela, y las cuatro lo cubren. Es idempotente, de modo que 0006 funciona
-- tanto despues de 0005 como sin ella.
--
-- Si mas adelante el estudio necesita editar el servicio o la profesional de
-- una reserva, la solucion NO es ampliar este grant, sino un rol propio para
-- el personal o una funcion `security definer` que haga ese cambio concreto.
grant update (estado, fecha, hora_inicio, hora_fin)
  on public.reservas to authenticated;

-- El SELECT ya esta concedido a `authenticated` (por 0004, y por los
-- privilegios por defecto del proyecto). Se repite por si esta migracion se
-- aplica sobre una base donde 0004 todavia no corrio.
grant select on public.reservas to authenticated;

-- ----------------------------------------------------------------------------
-- Lo que esta migracion NO abre
-- ----------------------------------------------------------------------------
-- Ni DELETE ni INSERT para el personal. Borrar una reserva perderia el
-- registro de que esa hora existio —cancelar deja la fila con estado
-- 'cancelada', que es lo que el historial necesita—, y crear reservas a nombre
-- de terceros desde el panel todavia no es una funcion del producto.
--
-- Tampoco toca las politicas de la clientela: siguen exactamente como las
-- dejaron 0003, 0004 y 0005.

notify pgrst, 'reload schema';
