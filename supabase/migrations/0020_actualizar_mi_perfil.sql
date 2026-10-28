-- ============================================================================
-- NuraVision · 0020 · Una cuenta corrige sus propios datos personales
-- ============================================================================
-- Contrato en openspec/changes/perfil-editable-cliente/ (decisiones del
-- 2026-10-28). Implementa EP01-HU02 «Actualización de perfil».
--
-- Aditiva: una funcion y sus privilegios. NO crea ni modifica politicas,
-- columnas ni triggers. 0017 sigue vigente: el UPDATE directo de una clienta
-- sobre `perfiles` afecta 0 filas, y esta funcion es la unica via por la que
-- corrige su fila.
--
-- POR QUE UNA FUNCION security definer Y NO UNA POLITICA (proposal.md):
--   · La politica de 0010 tal cual reabre el hallazgo que cerro 0017.
--   · La politica limitada que esbozo 0017 congela columnas comparandolas con la
--     fila guardada: es una lista negra, y cada columna nueva de `perfiles`
--     quedaria editable por la clienta si nadie se acuerda de sumarla. Tampoco
--     valida formatos.
--   · `grant update (nombre, telefono, fecha_nacimiento)` le quitaria al panel
--     la escritura de `rol`: clientela y personal son el mismo `authenticated`.
--   · Ademas hay que escribir `auth.users.raw_user_meta_data` en la misma
--     transaccion (abajo), y ninguna politica de `perfiles` puede hacerlo.
-- La funcion es una lista blanca: nombra las tres columnas que escribe.
--
-- POR QUE TAMBIEN raw_user_meta_data: `sincronizar_perfil()` (0010/0016), al
-- correr por un cambio de correo o de app_metadata, rellena `telefono` vacio y
-- `fecha_nacimiento` null desde user_metadata. Sin la copia, un dato que la
-- clienta borro reapareceria. Y el encabezado, el panel de la profesional y la
-- reserva leen nombre y telefono de la sesion (user_metadata). Escribir solo
-- `perfiles` y dejar user_metadata al navegador son dos escrituras sin
-- transaccion: descartado en proposal.md.
--
-- Supuesto comprobado antes de escribir (2026-10-28, Supabase local, Postgres
-- 17.6, imagen de la CLI 2.118.0): `auth.users` es de `supabase_auth_admin`,
-- `postgres` no es superusuario y aun asi tiene UPDATE sobre la tabla y sobre
-- `raw_user_meta_data`. El dueño de esta funcion es quien la crea (`postgres`
-- en el SQL Editor y en `db push`).
--
-- Sin `create or replace` a proposito: si la funcion ya existe es que alguien
-- la creo a mano, y conviene que falle en vez de pisarla en silencio.
-- ============================================================================

-- Errores para la clienta con errcode P0001 y mensaje listo para mostrar
-- (convencion de 0013). Los mensajes de nombre y fecha son identicos a los de
-- `registrar.usecase.ts` a proposito. Cualquier `raise` revierte todo lo
-- escrito antes en la llamada, asi que ningun rechazo deja nada a medias.
--
-- No recibe id: la fila es siempre la de auth.uid(). Pedirlo seria invitar a
-- pasar el de otra persona.
create function public.actualizar_mi_perfil(
  p_nombre           text,
  p_telefono         text,
  p_fecha_nacimiento date
)
  returns table (
    nombre           text,
    telefono         text,
    fecha_nacimiento date
  )
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  -- Recorta el mismo conjunto que String.prototype.trim del front
  -- (`validarPerfilPropio`), para que front y base acepten y guarden lo mismo:
  -- \t \n \v \f \r, espacio, NBSP, U+1680, U+2000..U+200A, U+2028, U+2029,
  -- U+202F, U+205F, U+3000 y U+FEFF. Lista explicita y no `\s`/[[:space:]]
  -- en una regex: esas clases dependen del locale del servidor, y la lista no.
  -- `btrim(text)` a secas solo quita ' ': un nombre de solo tab o NBSP pasaba.
  v_nombre   text := pg_catalog.btrim(
                       coalesce(p_nombre, ''),
                       E'\t\n\u000b\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'::text
                     );
  -- Sin btrim: la base no normaliza el telefono. Lo normaliza el front y aqui
  -- solo se rechaza lo que no sea canonico. '' y no null: mismo criterio que
  -- 0010, `telefono` puede ser NOT NULL en produccion.
  v_telefono text := coalesce(p_telefono, '');
begin
  if v_uid is null then
    raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.' using errcode = 'P0001';
  end if;

  if v_nombre = '' then
    raise exception 'Necesitamos tu nombre.' using errcode = 'P0001';
  end if;

  -- char_length cuenta puntos de codigo, no bytes: 120 emojis caben.
  if char_length(v_nombre) > 120 then
    raise exception 'El nombre admite hasta 120 caracteres.' using errcode = 'P0001';
  end if;

  -- `[0-9]` y no `\d`, por lo mismo que en 0016.
  if v_telefono <> '' and v_telefono !~ '^\+56[2-9][0-9]{8}$' then
    raise exception 'El teléfono debe ser un número chileno de 9 dígitos.' using errcode = 'P0001';
  end if;

  -- Mismo rango que el check de 0016; se comprueba aqui para dar el mensaje de
  -- la clienta en vez del 23514 del constraint.
  if p_fecha_nacimiento is not null
     and p_fecha_nacimiento not between date '1920-01-01' and current_date then
    raise exception 'La fecha de nacimiento no es válida.' using errcode = 'P0001';
  end if;

  -- Columnas calificadas con `p.`: los parametros de salida se llaman igual que
  -- las columnas, y sin calificar plpgsql no sabria cual es cual.
  update public.perfiles p
     set nombre           = v_nombre,
         telefono         = v_telefono,
         fecha_nacimiento = p_fecha_nacimiento
   where p.id = v_uid
  returning p.nombre, p.telefono, p.fecha_nacimiento
       into nombre, telefono, fecha_nacimiento;

  -- No inserta: crear la fila es del trigger de alta.
  if not found then
    raise exception 'No encontramos tu perfil. Escríbenos para revisarlo.' using errcode = 'P0001';
  end if;

  -- `||` mezcla y conserva las demas claves. Solo se toca raw_user_meta_data:
  -- `perfil_al_cambiar_cuenta` escucha `email` y `raw_app_meta_data`, asi que
  -- esta escritura no lo dispara. La fecha viaja como 'YYYY-MM-DD' o JSON null,
  -- la forma que lee `fecha_nacimiento_de_metadatos` (0016); to_char es strict,
  -- asi que una fecha null sigue llegando como JSON null.
  --
  -- `pg_catalog.` explicito en estas dos llamadas, y solo en ellas: pg_catalog
  -- se busca antes que `public`, pero eso solo protege cuando la funcion de
  -- pg_catalog coincide EXACTAMENTE con los tipos. Aqui no ocurre:
  --   · to_char no tiene version (date, text) en pg_catalog, solo (timestamp…)
  --     via cast implicito; una `public.to_char(date, text)` plantada ganaria.
  --   · jsonb_build_object es (variadic "any"); una
  --     `public.jsonb_build_object(text, text, text, text, text, text)` tiene
  --     mas coincidencias exactas y ganaria.
  -- Ambas correrian como el dueño de esta funcion. char_length(text) y los
  -- operadores usados si coinciden exactos en pg_catalog; coalesce no es una
  -- funcion sino sintaxis. btrim(text, text) tambien coincide exacto, pero va
  -- calificado igual porque su segundo argumento es un literal.
  update auth.users u
     set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
           || pg_catalog.jsonb_build_object(
                'nombre',           v_nombre,
                'telefono',         v_telefono,
                'fecha_nacimiento', pg_catalog.to_char(p_fecha_nacimiento::timestamp, 'YYYY-MM-DD')
              )
   where u.id = v_uid;

  return next;
end;
$$;

comment on function public.actualizar_mi_perfil(text, text, date) is
  'Unica via por la que una cuenta corrige su propia fila de perfiles (auth.uid()): '
  'reemplaza nombre, telefono y fecha_nacimiento, los copia a raw_user_meta_data '
  'en la misma transaccion y devuelve lo guardado. Errores P0001 para mostrar.';

-- Supabase concede execute a `anon` por privilegios por defecto, no solo via
-- `public`: hay que nombrarlo. Sin sesion la funcion ya fallaria por auth.uid(),
-- pero el permiso no debe depender de eso.
-- Dueño explicito: el supuesto de arriba (UPDATE sobre auth.users) es de
-- `postgres`. Si quien aplica es `postgres` no cambia nada; si es otro rol, falla
-- aqui en vez de dejar una funcion que revienta en el segundo UPDATE.
alter function public.actualizar_mi_perfil(text, text, date) owner to postgres;

revoke all on function public.actualizar_mi_perfil(text, text, date) from public, anon;
grant execute on function public.actualizar_mi_perfil(text, text, date) to authenticated;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Rollback (no se ejecuta; copiar a mano si hace falta revertir)
-- ----------------------------------------------------------------------------
-- No destruye datos: lo ya guardado en perfiles y en user_metadata se queda.
-- Antes de revertir, el front tiene que dejar de llamar a la funcion (o /perfil
-- fallara al guardar con "function not found").
--
--   drop function public.actualizar_mi_perfil(text, text, date);
--   notify pgrst, 'reload schema';
