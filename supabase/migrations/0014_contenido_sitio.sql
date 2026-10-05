-- ============================================================================
-- NuraVision · 0014 · Contenido editable del sitio
-- ============================================================================
-- Los textos y las fotos de la portada, la barra de anuncios, el footer y el
-- inicio de sesion pasan a editarse desde Panel -> Contenido.
--
--   · contenido_sitio   UNA fila (id = 1) con todo el contenido en `datos`.
--   · bucket contenido  fotos subidas desde el panel. Publico para leer.
--
-- POR QUE UN SOLO JSONB Y NO UNA COLUMNA POR TEXTO:
-- Son ~80 textos de interfaz que cambian juntos, se leen juntos en cada visita
-- y no se consultan por partes. Una columna por texto obligaria a una
-- migracion cada vez que el diseño agrega una frase. El frontend completa con
-- sus valores por defecto lo que falte en `datos`, asi que una fila vacia
-- (`'{}'`) muestra el sitio tal como estaba antes de esta migracion.
--
-- Es aditiva y reaplicable.
-- ============================================================================

create table if not exists public.contenido_sitio (
  -- Una sola fila. El check impide que aparezca una segunda que nadie lee.
  id              smallint primary key default 1,
  datos           jsonb not null default '{}'::jsonb,
  actualizado_en  timestamptz not null default now(),
  -- Quien guardo por ultima vez. Sin FK, como reservas.cliente_id.
  actualizado_por uuid,

  constraint contenido_sitio_una_fila check (id = 1),
  constraint contenido_sitio_es_objeto check (jsonb_typeof(datos) = 'object'),
  -- Tope de prudencia: las fotos van al bucket, aqui solo viajan sus URL. Un
  -- documento de 200 KB ya seria texto pegado por error.
  constraint contenido_sitio_tamano check (pg_column_size(datos) <= 200000)
);

comment on table public.contenido_sitio is
  'Textos y URL de fotos editables del sitio. Una fila (id = 1). El frontend '
  'completa con sus valores por defecto lo que falte.';

insert into public.contenido_sitio (id, datos)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Sello de quien y cuando guardo: lo pone la base, no el navegador.
create or replace function public.sellar_contenido_sitio()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists contenido_sitio_sello on public.contenido_sitio;
create trigger contenido_sitio_sello
  before insert or update on public.contenido_sitio
  for each row execute function public.sellar_contenido_sitio();

-- ----------------------------------------------------------------------------
-- RLS y permisos
-- ----------------------------------------------------------------------------
alter table public.contenido_sitio enable row level security;

drop policy if exists "Lectura publica del contenido" on public.contenido_sitio;
create policy "Lectura publica del contenido"
  on public.contenido_sitio for select
  to anon, authenticated
  using (true);

drop policy if exists "El personal edita el contenido" on public.contenido_sitio;
create policy "El personal edita el contenido"
  on public.contenido_sitio for update
  to authenticated
  using (public.es_staff())
  with check (public.es_staff());

-- Supabase concede ALL por defecto en cada tabla nueva: se parte de cero.
-- Sin INSERT ni DELETE: la fila ya existe y no se borra.
revoke all on public.contenido_sitio from anon, authenticated;
grant select on public.contenido_sitio to anon, authenticated;
grant update (datos) on public.contenido_sitio to authenticated;

-- ----------------------------------------------------------------------------
-- Fotos: bucket `contenido`
-- ----------------------------------------------------------------------------
-- Publico para leer (las fotos se muestran a cualquier visitante). Solo
-- imagenes y hasta 5 MB: el panel ya las comprime antes de subirlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contenido', 'contenido', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "El personal sube fotos de contenido" on storage.objects;
create policy "El personal sube fotos de contenido"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'contenido' and public.es_staff());

drop policy if exists "El personal reemplaza fotos de contenido" on storage.objects;
create policy "El personal reemplaza fotos de contenido"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'contenido' and public.es_staff())
  with check (bucket_id = 'contenido' and public.es_staff());

drop policy if exists "El personal borra fotos de contenido" on storage.objects;
create policy "El personal borra fotos de contenido"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'contenido' and public.es_staff());

notify pgrst, 'reload schema';
