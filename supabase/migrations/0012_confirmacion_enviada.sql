-- ============================================================================
-- NuraVision · 0012 · Constancia de la confirmacion enviada
-- ============================================================================
-- Una columna, y no es un detalle de registro: es lo que hace que la Edge
-- Function `enviar-confirmacion-reserva` se pueda exponer sin convertirse en un
-- problema.
--
-- ----------------------------------------------------------------------------
-- QUE PROBLEMA RESUELVE
-- ----------------------------------------------------------------------------
-- La funcion se invoca desde el navegador, asi que cualquiera con la anon key
-- —que viaja dentro del bundle y es publica por diseno— puede llamarla. Sin
-- memoria de lo ya enviado, una misma reserva se podria pedir mil veces y el
-- estudio acabaria mandando mil correos a la direccion de una clienta. No hace
-- falta mala intencion: basta un reintento en bucle.
--
-- Con esta columna el envio es IRREPETIBLE. La funcion la reclama con un UPDATE
-- condicional —`where confirmacion_enviada_en is null`— antes de llamar al
-- proveedor: si no le toca ninguna fila, alguien se le adelanto y no envia nada.
-- Eso ademas la vuelve idempotente, que es imprescindible para poder invocarla
-- desde el frontend Y desde un webhook de la base sin duplicar correos.
--
-- ----------------------------------------------------------------------------
-- POR QUE UNA MARCA DE TIEMPO Y NO UN BOOLEAN
-- ----------------------------------------------------------------------------
-- Un `enviada boolean` responde "si". Esto responde "cuando", que es lo que hace
-- falta cuando una clienta dice que no recibio nada: se puede comparar con la
-- hora de la reserva y con los registros del proveedor. Y el caso "no enviada"
-- se sigue leyendo igual de bien, como NULL.
--
-- ----------------------------------------------------------------------------
-- LO QUE ESTA COLUMNA NO ES
-- ----------------------------------------------------------------------------
-- No es un acuse de recibo. Dice que el proveedor acepto el envio, no que el
-- correo llegara ni que se leyera: eso solo lo sabe el proveedor, por sus
-- webhooks. Aqui significa "ya se intento, y con exito segun su API".
-- ============================================================================

alter table public.reservas
  add column if not exists confirmacion_enviada_en timestamptz;

comment on column public.reservas.confirmacion_enviada_en is
  'Cuando el proveedor de correo acepto la confirmacion. NULL = no se ha '
  'enviado. La Edge Function la reclama con un UPDATE condicional para que el '
  'envio no se pueda repetir. No es un acuse de recibo.';

-- ----------------------------------------------------------------------------
-- Privilegios: ninguno nuevo
-- ----------------------------------------------------------------------------
-- La columna la escribe UNICAMENTE la Edge Function, con la service_role key,
-- que salta las politicas. NO se agrega a la concesion por columnas de 0005
-- —`estado`, `fecha`, `hora_inicio`, `hora_fin`— y eso es deliberado: si una
-- clienta pudiera ponerla en NULL, volveria a habilitar el envio y la proteccion
-- contra la repeticion no serviria de nada.
--
-- Leerla si esta permitido por las politicas de SELECT que ya existen (0004,
-- 0006, 0007), que es lo que deja al panel del estudio ver si el correo salio.

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Ninguna reserva existente tiene confirmacion: la columna nace en NULL y nadie
-- la ha escrito. `pendientes` debe ser igual a `reservas`.
select
  count(*)                                                    as reservas,
  count(confirmacion_enviada_en)                              as confirmadas,
  count(*) filter (where confirmacion_enviada_en is null)     as pendientes
from public.reservas;

notify pgrst, 'reload schema';
