-- ============================================================================
-- NuraVision · 0011 · Variantes de servicio
-- ============================================================================
-- Algunos servicios no tienen un precio unico: depende de algo que hay que
-- preguntarle a la clienta antes de reservar. "¿Largo del cabello?" o "¿Retiro
-- de unias externo?" cambian lo que se cobra, y hasta ahora el catalogo solo
-- sabia de un `precio_base` por servicio.
--
-- Se resuelve con dos columnas jsonb: la pregunta y sus opciones en `servicios`,
-- y lo que se eligio en `reservas`.
--
-- ----------------------------------------------------------------------------
-- POR QUE JSONB Y NO DOS TABLAS
-- ----------------------------------------------------------------------------
-- Lo normalizado seria `servicio_variantes` y `variante_opciones`. Se descarta a
-- conciencia: las opciones no se consultan por su cuenta, no se filtran, no se
-- agregan y no las referencia nada mas. Siempre se leen con su servicio y se
-- pintan juntas. Dos tablas mas significarian dos joins en el flujo de reserva y
-- dos migraciones cada vez que el estudio quiera un campo nuevo, a cambio de una
-- integridad que aqui no se usa.
--
-- El precio es la excepcion, y por eso la fila de `reservas` guarda una COPIA y
-- no una referencia (ver mas abajo).
--
-- ----------------------------------------------------------------------------
-- UNA SOLA PREGUNTA POR SERVICIO
-- ----------------------------------------------------------------------------
-- `variantes` es un objeto, no una lista de preguntas. Es lo que se pidio —"una
-- pregunta antes de elegir al profesional"— y lo que cubre los dos ejemplos
-- reales del estudio. Si algun dia hicieran falta varias, la columna pasaria a
-- ser una lista y el cambio queda confinado al mapper y a esta restriccion; no
-- se adelanta ahora porque obligaria a complicar el formulario del panel y el
-- paso de la reserva por una necesidad que no existe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- servicios.variantes
-- ----------------------------------------------------------------------------
-- Forma esperada:
--
--   {
--     "pregunta": "¿Largo del cabello?",
--     "opciones": [
--       { "id": "corto", "etiqueta": "Corto",  "precio": 15000 },
--       { "id": "largo", "etiqueta": "Largo",  "precio": 20000 }
--     ]
--   }
--
-- EL PRECIO DE CADA OPCION ES EL PRECIO FINAL, NO UN RECARGO. Es como lo planteo
-- el estudio ("Corto: $15.000", "Largo: $20.000") y es lo que menos se presta a
-- error: quien lo configura escribe lo que la clienta va a pagar, sin tener que
-- sumar mentalmente sobre `precio_base`.
--
-- `precio_base` no desaparece ni queda en contradiccion: sigue siendo el precio
-- de los servicios sin variantes, y para los que las tengan es el valor con el
-- que el catalogo puede anunciar un "desde".
--
-- NULL significa "este servicio no pregunta nada", que es el caso de los 17 que
-- ya existen. La columna es nullable a proposito: un objeto vacio obligaria a
-- distinguir "sin variantes" de "variantes a medio configurar" en cada lectura.
alter table public.servicios
  add column if not exists variantes jsonb;

comment on column public.servicios.variantes is
  'Pregunta y opciones de precio, o NULL si el servicio no pregunta nada. '
  'El precio de cada opcion es el FINAL, no un recargo sobre precio_base.';

-- ----------------------------------------------------------------------------
-- La restriccion, y por que esta escrita asi
-- ----------------------------------------------------------------------------
-- Lo que impide: una variante a medio configurar. Una pregunta sin opciones
-- dejaria el flujo de reserva en un callejon sin salida —una pantalla que pide
-- elegir y no ofrece nada—, y eso es peor que no tener variantes.
--
-- DOS DETALLES QUE NO SON ESTILO:
--
-- 1. Cada `jsonb_typeof(...)` va envuelto en `coalesce`. Si la clave no existe,
--    `variantes -> 'opciones'` es NULL, `jsonb_typeof(NULL)` es NULL, y una
--    comparacion con NULL da NULL: una restriccion que evalua a NULL SE
--    CONSIDERA SATISFECHA. Sin el coalesce, un objeto sin `opciones` pasaria.
--
-- 2. La lista vacia se descarta comparando con `'[]'::jsonb` y no con
--    `jsonb_array_length(...) > 0`. Esa funcion LANZA UN ERROR si el argumento no
--    es una lista, y el orden de evaluacion de un AND no esta garantizado: un
--    valor mal formado podria reventar la comprobacion en vez de fallarla.
--    Comparar dos jsonb nunca lanza.
--
-- La forma de cada opcion —que tenga etiqueta y un precio numerico— no se
-- comprueba aqui: serian varias lineas de SQL por campo. La validan las reglas
-- del dominio al escribir y el mapper al leer, que descarta las opciones
-- incompletas en vez de dejar que lleguen a la pantalla.
alter table public.servicios
  drop constraint if exists servicios_variantes_bien_formadas;

alter table public.servicios
  add constraint servicios_variantes_bien_formadas
    check (
      variantes is null
      or (
        coalesce(jsonb_typeof(variantes), '') = 'object'
        and coalesce(btrim(variantes ->> 'pregunta'), '') <> ''
        and coalesce(jsonb_typeof(variantes -> 'opciones'), '') = 'array'
        and variantes -> 'opciones' <> '[]'::jsonb
      )
    );

-- ----------------------------------------------------------------------------
-- reservas.detalles_extra
-- ----------------------------------------------------------------------------
-- Forma esperada:
--
--   {
--     "variante": {
--       "pregunta": "¿Largo del cabello?",
--       "opcionId": "largo",
--       "etiqueta": "Largo",
--       "precio": 20000
--     }
--   }
--
-- ES UNA COPIA, NO UNA REFERENCIA, Y AHI ESTA LO IMPORTANTE. Guardar solo
-- `opcionId` seria lo natural viniendo de un esquema normalizado, pero las
-- opciones viven dentro del servicio y el estudio las va a editar: cambiar el
-- precio de "Largo" reescribiria el precio de todas las reservas pasadas, y
-- borrar una opcion dejaria reservas apuntando a algo que ya no existe.
--
-- Lo agrave un hecho del esquema actual: `reservas` NO TIENE COLUMNA DE PRECIO.
-- Hoy el precio de una reserva se recalcula leyendo `servicios.precio_base`, asi
-- que ya arrastra ese problema para todos los servicios. Para los que tengan
-- variantes, esta copia es lo unico que deja constancia de lo que se acordo.
--
-- Queda pendiente —y no es esta migracion— darle a `reservas` su propio precio
-- total. Mientras no lo tenga, el historial de un servicio sin variantes sigue
-- mostrando el precio de hoy y no el del dia de la reserva.
--
-- Se llama `detalles_extra` y lleva la variante bajo una clave en vez de ser la
-- variante directamente: es una bolsa para lo que acompania a una reserva, y asi
-- lo que venga despues (una nota, una alergia) cabe al lado sin migrar nada.
alter table public.reservas
  add column if not exists detalles_extra jsonb;

comment on column public.reservas.detalles_extra is
  'Datos extra de la reserva. La clave `variante` guarda una COPIA de la opcion '
  'elegida (pregunta, etiqueta y precio), no una referencia: el servicio puede '
  'cambiar sus opciones y la reserva debe conservar lo acordado.';

-- Misma cautela que arriba con los NULL. Solo se exige que sea un objeto: su
-- contenido es abierto por diseno.
alter table public.reservas
  drop constraint if exists reservas_detalles_extra_es_objeto;

alter table public.reservas
  add constraint reservas_detalles_extra_es_objeto
    check (
      detalles_extra is null
      or coalesce(jsonb_typeof(detalles_extra), '') = 'object'
    );

-- ----------------------------------------------------------------------------
-- Privilegios
-- ----------------------------------------------------------------------------
-- `servicios.variantes` la escribe el panel, que ya tiene UPDATE completo sobre
-- la tabla por 0010: no hace falta conceder nada.
--
-- `reservas` es otra cosa. 0005 acoto el UPDATE a cuatro columnas por nombre
-- —`estado`, `fecha`, `hora_inicio`, `hora_fin`— justamente para que una clienta
-- no pudiera reescribir cualquier campo de su reserva. `detalles_extra` NO se
-- agrega a esa lista, y es deliberado: se escribe UNA VEZ, en el INSERT que crea
-- la reserva, y despues es el registro de lo que se acordo. Si se pudiera
-- editar, dejaria de servir para eso.
--
-- El INSERT ya esta concedido desde 0003, y la politica de 0004 sigue decidiendo
-- quien puede crear una reserva y con que valores.

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Las columnas son nullable y nadie las ha escrito todavia, asi que los 17
-- servicios deben salir con `variantes` en NULL. Que la cuenta de "con
-- variantes" sea 0 es el resultado correcto: significa que ningun servicio
-- estandar se rompio.
select
  count(*)                                        as servicios,
  count(variantes)                                as con_variantes,
  count(*) filter (where variantes is null)       as sin_variantes
from public.servicios;

notify pgrst, 'reload schema';
