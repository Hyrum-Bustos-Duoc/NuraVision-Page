# Proposal

## Why

La administradora no puede saber cómo va el estudio desde el panel. El
Dashboard y la Analítica muestran cifras que **no salen de la base**: las dos
pantallas calculan todo sobre el estado de prototipo (`useAppState()`, datos
semilla generados en el navegador) y sobre un «hoy» fijo, `TODAY_ISO =
'2026-09-01'`. Por eso el encabezado dice «1 de septiembre, 2026» todos los
días, la tarjeta dice «Septiembre 2026» en octubre, y ninguna reserva real
(las de `public.reservas`, que el panel de reservas ya lista) aparece en un
solo número.

El intento anterior no resolvió esto: `0397033` (2026-09-12) y `feb83de`
(2026-09-12) pasaron las cifras de valores fijos a cálculos «desde las
reservas», pero las reservas eran las del estado semilla, porque entonces el
panel todavía no leía Supabase (eso llegó el 2026-09-29 con `5489d30`, y solo
para usuarios, profesionales y servicios). Las fórmulas y las pantallas de
aquel intento siguen valiendo y definen el alcance; lo que falta es la fuente.

Ítem del Gantt: Sprint 4, «Dashboard e indicadores administrativos»
(2026-10-21 a 2026-10-29; NURA-30, NURA-31, NURA-32).

**Cómo sabremos que está resuelto:** con una base que tenga reservas reales,
cada número del Dashboard y de la Analítica coincide con una consulta SQL
sobre `reservas`, `servicios`, `profesionales` y `perfiles`, y «hoy» y «este
mes» son los de Chile en la fecha en que se abre la página.

## What Changes

- Una función de base de datos de solo lectura devuelve, para un rango de
  fechas, los agregados que las dos pantallas ya muestran. Solo responde al
  personal del estudio (`es_staff()`); a cualquier otra sesión le devuelve
  error, no ceros.
- El Dashboard muestra, sobre datos reales y la fecha de Chile: reservas del
  mes, reservas de hoy y cuántas quedan por atender, clientas registradas,
  tasa de cancelación del mes, evolución de los últimos 7 meses, los 5
  servicios más solicitados y las 8 reservas más recientes con sus filtros.
- La Analítica muestra, sobre datos reales y el rango elegido: reservas,
  ingresos estimados, clientas distintas, tasa de cancelación, evolución
  mensual, servicios más solicitados, atenciones por profesional y catálogo
  por categoría. Los presets se calculan desde el «hoy» de Chile.
- Las dos pantallas dejan de depender de `useAppState()` y de `TODAY_ISO`, y
  ganan estados de carga, error con reintento y vacío.

No se agrega ningún KPI nuevo.

## Decisiones (2026-10-29)

Detalle y alternativas en `design.md`.

1. **Agregar en SQL, no en el navegador.** Traer las filas choca con el
   límite de filas por respuesta de PostgREST (1.000 por defecto en Supabase):
   «Este año» de un estudio con algunos miles de reservas se truncaría **sin
   error** y los totales serían falsos. Además, contar en el navegador obliga
   a descargar nombre, correo y teléfono de toda la clientela para producir
   números.
2. **Función `security invoker` con comprobación explícita de `es_staff()`**,
   ni `security definer` ni vista. La RLS de 0006/0010 ya deja al personal leer
   todo lo necesario, así que no hace falta saltarla. La comprobación explícita
   es la que importa: sin ella, una clienta que llamara a la función recibiría
   agregados de **sus propias** reservas (la RLS de 0004 se las deja ver) sin
   ningún error.
3. **«Hoy» y los rangos los calcula el navegador con `hoyEnElEstudio()`**
   (America/Santiago) y se pasan como fechas. La función no lee el reloj.
4. **Ingreso estimado = suma del precio acordado de las reservas no
   canceladas del rango.** Precio acordado = el de la variante guardada en la
   reserva (0011/0019) o, si no hay variante, el `precio_base` vigente del
   servicio. No es dinero cobrado: se rotula «Ingresos estimados».
5. **Qué estados cuentan en cada cifra** está fijado en el contrato de
   `design.md`; en resumen, las canceladas cuentan para el total y la tasa de
   cancelación, y no cuentan para ingresos, servicios, profesionales ni
   «reservas hoy».

## Fuera de alcance

- **Ingresos cobrados** (abonos autorizados en `pagos`). Solo existen desde
  Webpay (0018) y solo cubren el abono; mostrarlos como ingresos subestimaría
  todo lo que se paga en el estudio.
- **Marcar reservas como `completada`.** Ninguna pantalla lo hace hoy; los
  indicadores lo leen si existe, pero no lo producen.
- **Congelar el precio de las reservas sin variante.** `reservas` no tiene
  columna de precio (0011); arreglarlo es un cambio de esquema propio.
- Indicadores de la tienda (pedidos), comparación con el período anterior,
  exportar a CSV, actualización en vivo y ocupación de agenda: nadie los pidió.
- Retirar los datos semilla del resto de la app: otras pantallas aún los usan.
