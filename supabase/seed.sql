-- ============================================================================
-- NuraVision · Datos de Estudio Nura
-- ============================================================================
-- Refleja el catálogo y el equipo reales del estudio, de modo que un proyecto
-- Supabase recién creado quede igual que el que está en uso.
--
-- Se aplica DESPUÉS de todas las migraciones: `abono` viene de 0015.
--
-- ----------------------------------------------------------------------------
-- ⚠  ATENCIÓN: la primera instrucción BORRA el contenido de las tablas que
--    puebla. Es para poder re-ejecutar el seed sin acumular duplicados en una
--    base de desarrollo. NO lo ejecutes contra datos que te importen.
--    `reservas` NO se toca: las reservas de clientes no son datos de ejemplo.
-- ----------------------------------------------------------------------------
truncate table
  public.disponibilidad,
  public.profesional_servicios,
  public.profesionales,
  public.servicios
restart identity cascade;

-- ----------------------------------------------------------------------------
-- Servicios
-- ----------------------------------------------------------------------------
-- `categoria` es texto libre y el frontend la normaliza: acepta tanto estas
-- formas de presentación ('Estilismo' → cabello, 'Uñas' → unas,
-- 'Estética' → piel) como los ids del dominio en minúsculas. Una categoría
-- vacía cae en el valor por defecto del mapper.
--
-- `abono` va explícito porque el truncate de arriba se lleva el relleno que
-- hace 0015, y `db reset` corre este seed DESPUÉS de las migraciones. Los
-- valores son los de la fórmula de 0015 (30 % del precio, al millar): si se
-- cambia un precio de uñas aquí, hay que recalcular su abono.
insert into public.servicios
  (nombre, categoria, descripcion, duracion_minutos, precio_base, abono, activo)
values
  ('Corte de Pelo',         'Estilismo', 'Corte personalizado según estilo y tipo de cabello.',    60, 20000,     0, true),
  ('Peinado',               'Estilismo', 'Peinados para eventos o uso diario.',                    60, 25000,     0, true),
  ('Brushing',              'Estilismo', 'Secado y modelado profesional con cepillo.',             60, 15000,     0, true),
  ('Coloración',            'Estilismo', 'Tinta completa o retoque de raíz (requiere 2 horas).',   60, 45000,     0, true),
  ('Tratamiento Capilar',   'Estilismo', 'Nutrición e hidratación profunda del cabello.',          60, 30000,     0, true),

  ('Manicura Completa',     'Uñas',      'Limpieza, limado y cuidado de cutículas.',               60, 18000,  5000, true),
  ('Esmaltado Tradicional', 'Uñas',      'Esmaltado de secado al aire.',                           60, 12000,  4000, true),
  ('Esmaltado Permanente',  'Uñas',      'Esmaltado de larga duración con secado LED.',            60, 22000,  7000, true),
  ('Esculpido de Uñas',     'Uñas',      'Extensión en gel o acrílico (requiere 2 horas).',        60, 38000, 11000, true),

  ('Tratamiento Facial',    'Estética',  'Limpieza e hidratación facial profunda.',                60, 35000,     0, true),
  ('Depilación',            'Estética',  'Depilación en zonas a elección.',                        60, 15000,     0, true),
  ('Cejas y Pestañas',      'Estética',  'Perfilado de cejas y/o lifting de pestañas.',            60, 18000,     0, true),
  ('Maquillaje',            'Estética',  'Maquillaje profesional para eventos.',                   60, 30000,     0, true),

  -- Sin categoría: así está en el proyecto real, y ejercita el valor por
  -- defecto del mapper de categorías.
  ('manicure rapida',       null,        null,                                                     30, 15000,  5000, true);

-- ----------------------------------------------------------------------------
-- Equipo
-- ----------------------------------------------------------------------------
insert into public.profesionales (nombre, especialidad, avatar_url, activo)
values
  ('Berenice',  'Estilista & Colorista Senior',       'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300', true),
  ('Nicol',     'Estilista & Especialista en Cortes', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300', true),
  ('Viviana',   'Estilista & Peinados',               'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=300', true),
  ('Dominique', 'Estilista & Tratamientos Capilares', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300', true),
  ('Nashtia',   'Manicurista & Nail Art',             'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300', true),
  ('Barbara',   'Manicurista & Gel X / Soft Gel',     'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300', true),
  ('Tiare',     'Especialista en Depilación',         'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300', true),
  ('Paula',     'Especialista en Cejas & Mirada',     'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300', true);

-- ----------------------------------------------------------------------------
-- Vínculos profesional ↔ servicio
-- ----------------------------------------------------------------------------
-- La asignación es POR ÁREA, no por la sub-especialidad de cada una: las
-- cuatro estilistas ofrecen los cinco servicios de Estilismo, y las dos
-- manicuristas los cinco de uñas. La sub-especialidad queda registrada en la
-- columna `especialidad` y sirve para afinar esto más adelante.
--
-- Se resuelve por nombre y no por id, así el seed no depende de qué valores
-- entregue la secuencia.
--
-- ⚠  'Tratamiento Facial' y 'Maquillaje' quedan SIN asignar: no corresponden a
--    ninguna de las cuatro áreas del equipo (Estilismo, Manicura, Depilación,
--    Cejas). Mientras siga así, esos dos servicios aparecen en el catálogo
--    pero no se pueden reservar, porque no hay con quién.
insert into public.profesional_servicios (profesional_id, servicio_id)
select p.id, s.id
from public.profesionales p
join public.servicios s on (
  -- Estilismo
  (p.nombre in ('Berenice', 'Nicol', 'Viviana', 'Dominique') and s.categoria = 'Estilismo')
  -- Manicura: incluye el servicio sin categoría, que es de uñas por su nombre
  or (p.nombre in ('Nashtia', 'Barbara') and (s.categoria = 'Uñas' or s.nombre = 'manicure rapida'))
  -- Depilación
  or (p.nombre = 'Tiare' and s.nombre = 'Depilación')
  -- Cejas
  or (p.nombre = 'Paula' and s.nombre = 'Cejas y Pestañas')
);

-- ----------------------------------------------------------------------------
-- Disponibilidad semanal
-- ----------------------------------------------------------------------------
-- Horario estándar del estudio: lunes a sábado, de 10:00 a 19:00, en bloque
-- único (sin colación declarada).
--
-- dia_semana: 0 = domingo … 6 = sábado, el mismo índice que Date.getDay().
-- Aquí van 1..6, es decir lunes a sábado; el domingo queda cerrado.
insert into public.disponibilidad (profesional_id, dia_semana, hora_inicio, hora_fin)
select p.id, d.dia, '10:00'::time, '19:00'::time
from public.profesionales p
cross join generate_series(1, 6) as d(dia);

-- ----------------------------------------------------------------------------
-- Resumen
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.servicios)             as servicios,
  (select count(*) from public.profesionales)         as profesionales,
  (select count(*) from public.profesional_servicios) as vinculos,
  (select count(*) from public.disponibilidad)        as bloques_horario,
  (select count(*) from public.servicios s
    where not exists (
      select 1 from public.profesional_servicios ps where ps.servicio_id = s.id
    ))                                                as servicios_sin_profesional;
