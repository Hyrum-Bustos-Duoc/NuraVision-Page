# Spec Delta

## Purpose
Que la administradora vea los indicadores del estudio calculados sobre las
reservas, servicios, profesionales y clientas reales de la base, con la fecha
de Chile, y que nadie fuera del personal pueda obtenerlos.

## ADDED Requirements

### Requirement: Indicadores agregados solo para el personal
La base SHALL ofrecer `indicadores_panel(p_desde, p_hasta)` que devuelve el
objeto definido en `design.md` y MUST rechazar con `42501` toda llamada cuya
sesión no cumpla `es_staff()`, sin devolver datos parciales.

#### Scenario: Personal del estudio
- **WHEN** una sesión con `es_staff = true` llama con `('2026-10-01', '2026-10-31')`
- **THEN** recibe el objeto con todas sus claves y `reservas` igual a `select count(*) from reservas where fecha between '2026-10-01' and '2026-10-31'`

#### Scenario: Clienta con reservas propias
- **WHEN** una clienta con 3 reservas en octubre de 2026 llama con `('2026-10-01', '2026-10-31')`
- **THEN** recibe error `42501` y ningún dato, no un objeto con `reservas = 3`

#### Scenario: Profesional sin es_staff
- **WHEN** una profesional sin `es_staff` llama con cualquier rango válido
- **THEN** recibe error `42501`

#### Scenario: Sin sesión
- **WHEN** se llama con la anon key sin sesión
- **THEN** la llamada falla por permiso y no devuelve datos

### Requirement: Rango de fechas válido
La función MUST rechazar con `22023` y `hint = 'rango_invalido'` un rango con
algún extremo nulo o con `p_desde > p_hasta`. Un rango de un solo día SHALL
ser válido.

#### Scenario: Rango invertido
- **WHEN** el personal llama con `('2026-10-29', '2026-10-01')`
- **THEN** recibe `22023` con `hint = 'rango_invalido'`

#### Scenario: Un solo día
- **WHEN** el personal llama con `('2026-10-29', '2026-10-29')`
- **THEN** recibe las reservas con `fecha = 2026-10-29` y `por_mes` con un único elemento `2026-10`

### Requirement: Definición de cada agregado
Cada clave SHALL calcularse como fija la tabla de `design.md`: las canceladas
cuentan en `reservas`, `por_estado`, `por_mes` y `clientas_distintas`, y MUST
NOT contar en `ingresos_estimados`, `por_servicio` ni `por_profesional`.

#### Scenario: Cancelada excluida de ingresos y rankings
- **WHEN** el rango contiene una reserva confirmada de $20.000 y una cancelada de $30.000 del mismo servicio y profesional
- **THEN** `reservas = 2`, `por_estado.cancelada = 1`, `ingresos_estimados = 20000`, y ese servicio y esa profesional aparecen con `reservas = 1`

#### Scenario: Precio de la variante manda sobre el precio base
- **WHEN** una reserva no cancelada tiene `detalles_extra.variante.precio = 25000` y su servicio `precio_base = 18000`
- **THEN** aporta 25000 a `ingresos_estimados`

#### Scenario: Reserva sin variante
- **WHEN** una reserva no cancelada no tiene `detalles_extra.variante` y su servicio tiene `precio_base = 18000`
- **THEN** aporta 18000 a `ingresos_estimados`

#### Scenario: Variante con precio no numérico
- **WHEN** una reserva tiene `detalles_extra.variante.precio = "abc"`
- **THEN** la función no falla y la reserva aporta el `precio_base` de su servicio

#### Scenario: Misma clienta con y sin cuenta
- **WHEN** el rango tiene dos reservas con `cliente_email` `Ana@Mail.cl` y ` ana@mail.cl` (una con `cliente_id`, otra sin)
- **THEN** `clientas_distintas = 1`

#### Scenario: Clientas registradas no dependen del rango
- **WHEN** hay 96 perfiles con `rol = 'cliente'` y se llama con un rango sin reservas
- **THEN** `clientas_registradas = 96` y `reservas = 0`

#### Scenario: Meses sin reservas
- **WHEN** el personal llama con `('2026-04-01', '2026-10-31')` y mayo de 2026 no tiene reservas
- **THEN** `por_mes` tiene 7 elementos de `2026-04` a `2026-10` en orden, y el de `2026-05` es `{ "reservas": 0, "canceladas": 0 }`

#### Scenario: Rango vacío
- **WHEN** el rango no tiene reservas
- **THEN** todos los contadores son 0, `por_estado` trae las 4 claves en 0, y `por_servicio` y `por_profesional` son listas vacías

#### Scenario: Servicio inactivo con reservas
- **WHEN** un servicio con `activo = false` tiene reservas no canceladas en el rango
- **THEN** aparece en `por_servicio` con su nombre

### Requirement: Fecha del estudio en las pantallas
Las pantallas del panel SHALL calcular «hoy», el mes en curso y los presets de
rango con la fecha de America/Santiago, sea cual sea la zona del dispositivo, y
MUST NOT usar `TODAY_ISO` ni el estado de prototipo (`useAppState`).

#### Scenario: Noche en Chile
- **WHEN** el Dashboard se abre el 2026-10-31 a las 22:30 hora de Chile (2026-11-01 en UTC)
- **THEN** «Reservas hoy» cuenta las del 2026-10-31 y «Reservas del mes» es octubre de 2026

#### Scenario: Dispositivo en otra zona
- **WHEN** el navegador está en `Europe/Madrid` y en Chile son las 20:00 del 2026-10-29
- **THEN** el preset «Últimos 30 días» va de 2026-09-29 a 2026-10-29

#### Scenario: Cambio de año
- **WHEN** el Dashboard se abre el 2027-01-15 hora de Chile
- **THEN** la evolución muestra de julio de 2026 a enero de 2027 y el encabezado dice la fecha de ese día

### Requirement: Dashboard sobre datos reales
El Dashboard SHALL mostrar, desde `indicadores_panel`: reservas del mes en
curso, reservas de hoy no canceladas con cuántas están pendientes o
confirmadas («por atender»), clientas registradas, tasa de cancelación del mes
con un decimal (resaltada si supera 10%), evolución de los 7 meses que terminan
en el mes en curso y los 5 servicios con más reservas no canceladas en esos 7
meses. El encabezado y el rótulo del mes SHALL mostrar la fecha y el mes reales.

#### Scenario: Cifras coinciden con la base
- **WHEN** octubre de 2026 tiene 40 reservas, 4 canceladas, y hoy 2026-10-29 tiene 5 reservas (1 cancelada, 2 pendientes, 1 confirmada, 1 completada)
- **THEN** se ve «Reservas del mes» 40, «Tasa de cancelación» 10.0% sin resaltar, «Reservas hoy» 4 y «3 por atender»

#### Scenario: Error de carga
- **WHEN** la llamada a la función falla (red o `42501`)
- **THEN** se muestra el mensaje de error y un botón para reintentar, y no se muestran ceros como si fueran datos

#### Scenario: Cargando
- **WHEN** la función todavía no respondió
- **THEN** las tarjetas muestran un estado de carga y no un 0

### Requirement: Reservas recientes del Dashboard
El Dashboard SHALL listar como máximo las 8 reservas más recientes por `fecha`
y `hora_inicio` descendentes, filtrables por los 4 estados reales y por
profesional del equipo real, y la petición MUST NOT traer más de 8 filas.

#### Scenario: Filtro por estado
- **WHEN** se elige «Por confirmar» (el estado `pendiente`, con el mismo rótulo que el resto del panel)
- **THEN** solo aparecen reservas con estado `pendiente`, a lo más 8

#### Scenario: Sin resultados
- **WHEN** ninguna reserva cumple los filtros
- **THEN** la tabla muestra su mensaje vacío

#### Scenario: Tamaño de la petición
- **WHEN** la base tiene 2.000 reservas y se abre el Dashboard
- **THEN** la respuesta del listado contiene como máximo 8 filas

### Requirement: Analítica sobre datos reales
La Analítica SHALL mostrar, para el rango elegido y desde `indicadores_panel`:
reservas, «Ingresos estimados», clientas distintas, tasa de cancelación,
evolución mensual, los 6 servicios con más reservas no canceladas y todas las
profesionales con reservas no canceladas. «Catálogo por categoría» SHALL
contar los servicios reales (activos e inactivos) por la categoría que ya
muestra el catálogo. Con el rango invertido MUST NOT llamar a la función.

#### Scenario: Preset Este año
- **WHEN** hoy en Chile es 2026-10-29 y se elige «Este año»
- **THEN** se pide `('2026-01-01', '2026-10-29')` y la evolución muestra 10 meses, de enero a octubre

#### Scenario: Rango invertido
- **WHEN** en «Personalizado» se pone desde 2026-10-20 hasta 2026-10-01
- **THEN** se muestra «La fecha inicial debe ser anterior a la final.» y no se hace ninguna llamada

#### Scenario: Período sin reservas
- **WHEN** el rango elegido no tiene reservas
- **THEN** se muestra «Sin datos en este período»

#### Scenario: Error con reintento
- **WHEN** la llamada falla
- **THEN** se muestra el error y un botón de reintentar que repite la llamada con el mismo rango
