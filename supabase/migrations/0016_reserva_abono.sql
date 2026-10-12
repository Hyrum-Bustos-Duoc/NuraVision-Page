-- ============================================================================
-- NuraVision · 0016 · Abono de reserva
-- ============================================================================
-- El estudio quiere poder cobrar solo una sena al reservar —tipicamente $5.000—
-- en vez del precio completo, y decidirlo SERVICIO POR SERVICIO. Tiene sentido:
-- una hora de peluqueria de $40.000 que la clienta no cumple es una perdida de
-- agenda, y un abono pequeno la compromete sin empujarla a pagarlo todo por
-- adelantado.
--
-- Dos columnas en `servicios` y una en `pagos`.
--
-- ----------------------------------------------------------------------------
-- POR QUE TAMBIEN UNA COLUMNA EN `pagos`
-- ----------------------------------------------------------------------------
-- El comprobante tiene que decir tres cifras: el total del servicio, lo abonado
-- hoy y el saldo que queda por pagar en el local. `pagos.monto` solo sabe la
-- segunda.
--
-- El total se podria recalcular leyendo el servicio, y seria un error: el
-- estudio edita sus precios. Un comprobante de hace dos meses mostraria el
-- precio de hoy, y por tanto un saldo pendiente que nadie acordo. Es el mismo
-- razonamiento de 0011 al guardar una COPIA de la variante elegida en vez de su
-- id, y aqui pesa mas porque la cifra es una deuda.
--
-- Asi que `monto_total` guarda lo que el servicio costaba el dia del cobro. El
-- saldo es siempre `monto_total - monto`, y no cambia nunca.
--
-- ----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACION NO HACE
-- ----------------------------------------------------------------------------
-- No toca los privilegios. `servicios` ya tiene concedido UPDATE a nivel de
-- TABLA para `authenticated` desde 0010, acotado por la politica de `es_staff`,
-- de modo que las columnas nuevas son escribibles por el personal sin conceder
-- nada. `pagos` sigue sin escritura para nadie salvo las Edge Functions (0015).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- servicios.cobrar_abono
-- ----------------------------------------------------------------------------
-- NOT NULL con DEFAULT false: los 17 servicios que ya existen siguen cobrando
-- el precio completo sin tocarlos. Que esta funcion nazca apagada es lo unico
-- aceptable — encenderla sola cambiaria lo que se cobra.
alter table public.servicios
  add column if not exists cobrar_abono boolean not null default false;

comment on column public.servicios.cobrar_abono is
  'Si al reservar se cobra solo el abono (monto_abono) en vez del precio total.';

-- ----------------------------------------------------------------------------
-- servicios.monto_abono
-- ----------------------------------------------------------------------------
-- Pesos chilenos enteros, como el resto de los montos del esquema. $5.000 es el
-- valor que pidio el estudio y queda como DEFAULT para que activar la casilla
-- sin escribir nada haga algo sensato.
alter table public.servicios
  add column if not exists monto_abono integer default 5000;

comment on column public.servicios.monto_abono is
  'Abono a cobrar al reservar, en pesos. Solo se usa si cobrar_abono = true.';

-- Un abono de 0 o negativo haria que Transbank rechazara el cobro con un error
-- generico; mejor no dejar que se guarde.
alter table public.servicios
  drop constraint if exists servicios_monto_abono_positivo;

alter table public.servicios
  add constraint servicios_monto_abono_positivo
    check (monto_abono is null or monto_abono > 0);

-- ----------------------------------------------------------------------------
-- La restriccion que de verdad importa
-- ----------------------------------------------------------------------------
-- `monto_abono` es nullable, y UNA RESTRICCION QUE EVALUA A NULL SE CONSIDERA
-- SATISFECHA: `check (monto_abono > 0)` por si sola deja pasar un NULL sin
-- queja. Si eso ocurriera con `cobrar_abono = true`, la Edge Function se
-- quedaria sin monto que cobrar justo al confirmar una reserva.
--
-- Esta restriccion lo cierra: la columna puede ser NULL mientras el abono este
-- apagado —que es el caso de los 17 servicios actuales—, pero no puede estarlo
-- si esta encendido.
--
-- No se compara contra `precio_base`. Seria tentador exigir que el abono sea
-- menor, pero con variantes el precio final no esta en esa columna: un abono de
-- $15.000 puede ser menor que la opcion "Largo" y mayor que `precio_base`, y la
-- restriccion rechazaria algo legitimo. Que nunca se cobre mas que el total lo
-- garantiza la funcion de cobro, que toma el menor de los dos.
alter table public.servicios
  drop constraint if exists servicios_abono_necesita_monto;

alter table public.servicios
  add constraint servicios_abono_necesita_monto
    check (not cobrar_abono or monto_abono is not null);

-- ----------------------------------------------------------------------------
-- pagos.monto_total
-- ----------------------------------------------------------------------------
-- Lo que costaba el servicio el dia del cobro. NULL para los pagos del total,
-- donde no hay desglose que mostrar: el total ES `monto`.
alter table public.pagos
  add column if not exists monto_total integer;

comment on column public.pagos.monto_total is
  'Total del servicio el dia del cobro, cuando se pago solo un abono. El saldo '
  'pendiente es monto_total - monto. NULL si se cobro el total completo.';

-- Un total menor que lo cobrado describiria un saldo negativo, que no significa
-- nada. Se admite igual, porque el abono puede coincidir con el total.
alter table public.pagos
  drop constraint if exists pagos_total_no_menor_que_cobrado;

alter table public.pagos
  add constraint pagos_total_no_menor_que_cobrado
    check (monto_total is null or monto_total >= monto);

-- ----------------------------------------------------------------------------
-- Comprobacion
-- ----------------------------------------------------------------------------
-- Ningun servicio debe quedar con el abono activado: la columna nace en false.
-- Que `con_abono` sea 0 es el resultado correcto, y significa que nada cambio
-- para los servicios que ya existen.
select
  count(*)                                              as servicios,
  count(*) filter (where cobrar_abono)                  as con_abono,
  count(*) filter (where not cobrar_abono)              as cobran_total,
  count(*) filter (where monto_abono is null)           as sin_monto_definido
from public.servicios;

notify pgrst, 'reload schema';
