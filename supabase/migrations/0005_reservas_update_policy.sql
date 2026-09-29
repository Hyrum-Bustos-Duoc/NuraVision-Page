-- ============================================================================
-- NuraVision · 0005 · Cancelar y reprogramar la reserva propia
-- ============================================================================
-- Hasta ahora `reservas` no aceptaba UPDATE de nadie: cancelar y reprogramar
-- vivian solo en el estado local del navegador, asi que no cambiaban nada de
-- verdad. Esta migracion los lleva a la base.
--
-- La regla de fondo es la misma de 0004: cada quien toca solo lo suyo,
-- `cliente_id = auth.uid()`. Pero "lo suyo" no basta como unica condicion, y
-- aqui se explica por que se acota mas.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Que columnas puede tocar la clientela
-- ----------------------------------------------------------------------------
-- Los privilegios por defecto de un proyecto Supabase conceden UPDATE sobre
-- TODAS las columnas. Sin esta correccion, alguien con sesion podria cambiar
-- el `servicio_id` de su reserva a uno mas caro ya tomado, moverla a otra
-- profesional, o reescribir el `codigo` con el de otra persona.
--
-- Postgres permite acotar el permiso por columna, que es exactamente lo que
-- hace falta: solo se pueden modificar el estado y el bloque horario.
--
-- `cliente_id` queda fuera a proposito: sin eso, y aunque la politica exija
-- `cliente_id = auth.uid()` en ambos lados, alguien podria... no regalarsela a
-- otra persona (WITH CHECK lo impide), pero si dejar la columna en un estado
-- que no corresponde. Es mas simple no dejar tocarla.
revoke update on public.reservas from anon, authenticated;

grant update (estado, fecha, hora_inicio, hora_fin)
  on public.reservas to authenticated;

-- `anon` se queda sin UPDATE de ningun tipo: quien reserva sin cuenta no tiene
-- como demostrar que la reserva es suya, y su `cliente_id` es NULL.

-- ----------------------------------------------------------------------------
-- Politica de actualizacion
-- ----------------------------------------------------------------------------
drop policy if exists "Actualizacion de reservas propias" on public.reservas;

create policy "Actualizacion de reservas propias"
  on public.reservas
  for update
  to authenticated

  -- QUE FILAS se pueden tocar: las propias, y solo mientras siguen vivas.
  -- Una reserva ya cancelada o completada no se reabre desde el navegador;
  -- revivir una hora pasada no es una accion de la clientela.
  using (
    cliente_id = auth.uid()
    and estado in ('pendiente', 'confirmada')
  )

  -- EN QUE PUEDEN QUEDAR. Aqui esta lo que no es evidente:
  --
  -- `estado` NO puede quedar en 'confirmada' ni en 'completada'. 0003 decidio
  -- que nadie se auto-confirma una hora —confirmar es decision del estudio— y
  -- una politica de UPDATE sin esta condicion desharia esa decision por la
  -- puerta de atras: bastaria con "reprogramar" poniendo estado='confirmada'.
  --
  -- Por eso reprogramar devuelve la reserva a 'pendiente', que ademas es lo
  -- correcto: cambiar el bloque obliga al estudio a confirmarlo de nuevo.
  with check (
    cliente_id = auth.uid()
    and estado in ('pendiente', 'cancelada')
  );

-- ----------------------------------------------------------------------------
-- Lo que esta migracion NO resuelve
-- ----------------------------------------------------------------------------
-- No impide reprogramar a una fecha pasada ni a un bloque que ya tiene otra
-- persona. La disponibilidad se calcula hoy en el navegador, y replicarla aqui
-- pide una restriccion de exclusion sobre (profesional_id, fecha, rango) mas
-- una validacion contra `disponibilidad`. Queda pendiente y a la vista: por
-- ahora la unica defensa contra un solapamiento es la interfaz.
--
-- Tampoco hay DELETE para nadie. Cancelar deja la fila con estado 'cancelada',
-- que es lo que el estudio necesita para su historial; borrarla perderia el
-- registro de que esa hora existio.

notify pgrst, 'reload schema';
