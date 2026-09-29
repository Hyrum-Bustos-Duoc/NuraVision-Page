-- ============================================================================
-- NuraVision · 0004 · Lectura de reservas propias
-- ============================================================================
-- 0003 dejo `reservas` como una tabla de SOLO ESCRITURA desde el navegador:
-- sin autenticacion no habia forma de acotar la lectura a "mis reservas", y
-- abrirla habria expuesto el contacto de todos los clientes.
--
-- Con Supabase Auth ya existe esa forma: `auth.uid()` devuelve el id del
-- usuario de la sesion, y eso permite entregar exactamente sus filas.
--
-- Quien reserva SIN cuenta sigue sin poder leer: sus filas tienen
-- cliente_id NULL y `NULL = auth.uid()` nunca es verdadero. Su unico vinculo
-- con la reserva sigue siendo el `codigo` y el correo, igual que antes.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Permiso de tabla
-- ----------------------------------------------------------------------------
-- Explicito aunque en un proyecto Supabase suele ser redundante: los
-- privilegios por defecto del proyecto ya conceden SELECT sobre las tablas
-- nuevas de `public` a anon y authenticated (comprobado contra la base: un
-- SELECT anonimo sobre `reservas` responde 0 filas, no "permission denied").
--
-- Se declara igual para que la migracion no dependa de esa configuracion y
-- funcione tal cual en un Postgres sin ella.
--
-- IMPORTANTE: el GRANT no es lo que protege la tabla, y no hay que leerlo como
-- si lo fuera. Lo que decide que ve cada quien es la politica de abajo: sin
-- una politica de SELECT, RLS niega todas las filas aunque el permiso exista.
-- Por eso `anon` puede consultar la tabla y no obtiene nada.
grant select on public.reservas to authenticated;

-- ----------------------------------------------------------------------------
-- Politica de lectura
-- ----------------------------------------------------------------------------
drop policy if exists "Lectura de reservas propias" on public.reservas;

create policy "Lectura de reservas propias"
  on public.reservas
  for select
  to authenticated
  using (cliente_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Ajuste de la politica de insercion
-- ----------------------------------------------------------------------------
-- La politica de 0003 no decia nada sobre `cliente_id`, porque hasta ahora esa
-- columna no la escribia nadie. Desde que la app la rellena hay que acotarla:
-- sin esto, cualquiera con la anon key podria insertar una reserva con el
-- cliente_id de otra persona, y esa reserva le apareceria a ella en "mis
-- reservas" gracias a la politica de arriba.
--
-- Se permiten dos casos y ninguno mas:
--   · cliente_id NULL  -> reserva de invitado, como hasta ahora.
--   · cliente_id = auth.uid() -> la persona se la atribuye a si misma.
--
-- Para `anon`, auth.uid() es NULL: la comparacion da NULL (no verdadero), asi
-- que un visitante sin sesion solo puede insertar con cliente_id NULL.
drop policy if exists "insercion publica de reservas" on public.reservas;

create policy "insercion publica de reservas"
  on public.reservas
  for insert
  to anon, authenticated
  with check (
    estado = 'pendiente'
    and nullif(btrim(cliente_nombre), '') is not null
    and nullif(btrim(cliente_email), '') is not null
    and (cliente_id is null or cliente_id = auth.uid())
  );

-- Sigue sin haber UPDATE ni DELETE para nadie: cancelar o reprogramar todavia
-- no esta implementado, y abrirlo antes de tiempo dejaria a cualquiera con
-- sesion modificando sus propias filas sin reglas de negocio que lo acoten.

notify pgrst, 'reload schema';
