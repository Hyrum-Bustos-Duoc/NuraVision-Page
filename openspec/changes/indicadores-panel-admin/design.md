# Design

## Contrato de datos (se fija antes que las tareas)

Cruza SQL y TypeScript. No hay capa Python (`services/api/` no existe).

### Función

```
public.indicadores_panel(p_desde date, p_hasta date) returns jsonb
```

- `language sql` o `plpgsql`, `stable`, **`security invoker`**, con
  `search_path = ''`. Toda tabla y toda función propia van calificadas con
  `public.`.
  - Se descartó `public, pg_temp` (el de `es_staff()` en 0006). Aunque las
    funciones lleven `pg_catalog.`, los operadores sin calificar (`=` sobre
    `estado_reserva`, `<>`, `->`) se resolverían contra uno plantado en
    `public`. Con la ruta vacía solo se busca en `pg_catalog`.
  - Decisión de implementación aceptada por nv-rls-auditor el 2026-10-29.
- `execute` revocado a `public` y `anon`; concedido a `authenticated`.
- Migración **`0022`** (0020 y 0021 están tomadas por ramas sin integrar; esta
  no comparte objetos con ellas).

| Caso | Resultado |
|---|---|
| `es_staff()` falso (anon, clienta, profesional) | Error `42501`, mensaje «Solo el personal del estudio puede ver los indicadores.» No devuelve datos parciales. |
| `p_desde` o `p_hasta` nulos, o `p_desde > p_hasta` | Error `22023`, `hint = 'rango_invalido'`. |
| Rango sin reservas | Objeto completo con ceros, `por_mes` con un elemento por mes en 0, listas `por_servicio` y `por_profesional` vacías. |

### Objeto devuelto (JSON, exacto)

```json
{
  "desde": "2026-04-01",
  "hasta": "2026-10-31",
  "reservas": 214,
  "por_estado": { "pendiente": 12, "confirmada": 30, "completada": 150, "cancelada": 22 },
  "ingresos_estimados": 4820000,
  "clientas_distintas": 131,
  "clientas_registradas": 96,
  "por_mes": [
    { "mes": "2026-04", "reservas": 25, "canceladas": 3 },
    { "mes": "2026-05", "reservas": 0, "canceladas": 0 }
  ],
  "por_servicio": [
    { "servicio_id": 3, "nombre": "Manicure semipermanente", "reservas": 61 }
  ],
  "por_profesional": [
    { "profesional_id": 2, "nombre": "Berenice", "reservas": 80 }
  ]
}
```

Todas las claves están siempre presentes. Todos los números son enteros.

| Clave | Definición sobre `reservas r` con `r.fecha between p_desde and p_hasta` |
|---|---|
| `desde`, `hasta` | Eco de los parámetros, `'YYYY-MM-DD'`. |
| `reservas` | `count(*)`, **todos** los estados. |
| `por_estado` | Conteo por `r.estado`; las 4 claves del enum `estado_reserva` siempre, con 0 si no hay. `sum(por_estado) = reservas`. |
| `ingresos_estimados` | `round(sum(precio_acordado))` de las reservas con `estado <> 'cancelada'`, en CLP. `precio_acordado` = `(r.detalles_extra->'variante'->>'precio')::numeric` **solo si** `jsonb_typeof(...) = 'number'`; si no, `servicios.precio_base` del servicio de la reserva. 0 si no hay. |
| `clientas_distintas` | `count(distinct lower(btrim(r.cliente_email)))`, todos los estados. Cuenta igual a quien reservó con y sin cuenta. |
| `clientas_registradas` | `count(*)` de `perfiles` con `rol = 'cliente'`. **No depende del rango.** |
| `por_mes` | Un elemento por cada mes calendario que toca el rango, del primero al último, en orden cronológico, incluidos los meses con 0. `mes` = `'YYYY-MM'`; `reservas` = todos los estados; `canceladas` = las de estado `cancelada` (las cuenta también `reservas`). |
| `por_servicio` | Servicios con al menos una reserva **no cancelada** en el rango; `reservas` = esas reservas. Orden: `reservas` desc, `nombre` asc, `servicio_id` asc. Sin límite (el catálogo tiene decenas de servicios). Incluye servicios inactivos. |
| `por_profesional` | Igual que `por_servicio`, por `profesional_id`, con `profesionales.nombre`. |

Los ids viajan como número (son `bigint` en SQL); el dominio del front los
convierte a texto como ya hace el módulo `admin` (`String(row.id)`).

### TypeScript (`frontend/src/shared/types/supabase.ts`, sección `Functions`)

```ts
indicadores_panel: {
  Args: { p_desde: string; p_hasta: string }
  Returns: {
    desde: string
    hasta: string
    reservas: number
    por_estado: Record<EstadoReserva, number>
    ingresos_estimados: number
    clientas_distintas: number
    clientas_registradas: number
    por_mes: { mes: string; reservas: number; canceladas: number }[]
    por_servicio: { servicio_id: number; nombre: string; reservas: number }[]
    por_profesional: { profesional_id: number; nombre: string; reservas: number }[]
  }
}
```

### Cálculos que hace el front con ese objeto (no van a SQL)

| Cifra | Fórmula |
|---|---|
| Tasa de cancelación | Analítica: `por_estado.cancelada / reservas * 100`; Dashboard: `canceladas / reservas` del último `por_mes`. 1 decimal; `0.0%` si el denominador es 0. |
| Reservas hoy | Llamada con `(hoy, hoy)`: `reservas - por_estado.cancelada`. |
| Por atender hoy | Misma llamada: `por_estado.pendiente + por_estado.confirmada`. |
| Top N servicios | Primeros N de `por_servicio` (Dashboard 5, Analítica 6, como hoy). |

## Fechas

- `hoy = hoyEnElEstudio()` (`frontend/src/shared/lib/calendario.ts`, rama
  `fix/agenda-profesional-real`, se integra antes que este cambio). Junto con
  `sumarDias` / `sumarMeses` del mismo archivo, son las únicas fuentes de
  fecha. Nada de `new Date('YYYY-MM-DD')` ni `toISOString()`: el `rangeForPreset`
  actual usa los dos y en Chile corre el rango un día después de las 21:00.
- **Dashboard.** Mes en curso = mes de `hoy`. Dos llamadas en paralelo:
  1. `(primer día del mes de hoy − 6 meses, último día del mes de hoy)` →
     evolución de 7 meses y top 5 servicios; el **último** elemento de
     `por_mes` da «Reservas del mes» y su tasa de cancelación
     (`canceladas / reservas`); `clientas_registradas` también sale de aquí.
  2. `(hoy, hoy)` → reservas hoy y por atender.
  El mes en curso incluye los días que faltan: es lo que hace hoy la pantalla.
- **Analítica.** `hasta = hoy` en todos los presets. `30d`: `hoy − 30 días`;
  `3m` / `6m`: `sumarMeses(hoy, −3 / −6)`; `anio`: `YYYY-01-01` de `hoy`.
  `personalizado` parte del rango del preset que se estaba viendo (como hoy).
  Si `desde > hasta` el front **no llama** a la función y muestra el aviso que
  ya existe.

## Decisiones y alternativas descartadas

### 1. Agregar en SQL

| Opción | Por qué no |
|---|---|
| Traer filas de `reservas` y agregar en el navegador (lo que hace hoy sobre el estado semilla) | PostgREST corta en `max_rows` (1.000 por defecto en Supabase) sin error: con «Este año» y algunos miles de reservas los totales serían falsos y nada lo delataría. Paginar resolvería eso con N peticiones y descargando el contacto de toda la clientela para contar. |
| Una vista por cada gráfico | Las vistas no reciben el rango como parámetro: el filtro por fecha y el `group by` se aplicarían igual en el navegador, o habría que hacer una vista por mes/servicio/profesional y tres peticiones con el mismo problema de límite si el grupo crece. |

Volumen: cientos a pocos miles de reservas al año. Con eso un escaneo
secuencial de `reservas` es barato y **no se agrega índice por `fecha`**; si
algún día hace falta, se mide primero con `explain analyze`.

### 2. `security invoker` + comprobación de `es_staff()`

| Opción | Por qué no |
|---|---|
| `security definer` | Saltaría la RLS sin necesidad: 0006 (reservas), 0010 (perfiles, servicios, profesionales) ya dejan leer todo al personal. Un `definer` es superficie extra que nv-rls-auditor tiene que justificar cada vez. |
| Vista con `security_invoker = true` apoyada solo en RLS | La RLS **filtra, no rechaza**: una clienta vería agregados de sus propias reservas (0004) y la profesional los de su agenda (0007), con aspecto de indicadores válidos. Mismo problema con una función invoker **sin** la comprobación. |
| Rol `admin` de `perfiles.rol` | `perfiles.rol` es réplica (0010). Todas las políticas del personal usan `es_staff()` (JWT, `app_metadata`); usar otra fuente permitiría que ambas discrepen. |

### 3. Qué cuenta como ingreso

| Opción | Por qué no |
|---|---|
| Abonos autorizados en `pagos` (0018) | Solo existen desde Webpay y solo son el abono; el resto se paga en el estudio y no queda registrado. Subestimaría el ingreso en un orden de magnitud. |
| Solo reservas `completada` | Ninguna pantalla marca reservas como completadas (el panel solo confirma). La cifra sería 0 en producción. |
| Precio vigente del servicio para todas | Mentiría sobre las reservas con variante, que sí guardan el precio acordado (0019 lo fija la base desde el 2026-10-11). |

Elegido: precio acordado de las no canceladas, rotulado «Ingresos estimados».
Limitaciones conocidas, escritas en el comentario de la función: las reservas
sin variante usan el `precio_base` **actual**; las reservas con variante
anteriores a 0019 tienen el precio que mandó el navegador (la comprobación al
final de 0019 lista las sospechosas).

### 4. Estados

Las canceladas son reservas que existieron (el denominador de la tasa de
cancelación las necesita), pero no son atenciones: por eso cuentan en
`reservas`, `por_estado`, `por_mes` y `clientas_distintas`, y no en
`ingresos_estimados`, `por_servicio`, `por_profesional` ni «reservas hoy».
Cambio respecto del prototipo, que contaba todas en todas partes. Otro cambio
deliberado: el top 5 del Dashboard se calcula sobre los mismos 7 meses de la
evolución y no sobre todo el historial, para no pedir un rango sin límite.

### 5. Reservas recientes del Dashboard

Se reutiliza el listado del módulo `admin` (`useReservasGestion` /
`ReservaGestionRepository`, ya sobre Supabase con filtros por estado y
profesional). Hoy ese listado descarga **todas** las reservas; para la tabla
del Dashboard se piden como máximo 8, ordenadas como el panel de reservas
(`fecha` desc, `hora_inicio` desc). Los estados filtrables son los 4 del enum:
el `'en_curso'` del prototipo no existe en la base.

### 6. Catálogo por categoría

No pasa por la función: el catálogo es de lectura pública y la normalización
de `servicios.categoria` (texto libre, nullable) vive en el mapper del front
(`toCategoria`, que manda los `null` a la categoría por defecto). Se cuenta
sobre la lista de servicios que ya carga el panel (`useServiciosGestion`,
incluye inactivos). Duplicar esa normalización en SQL la desincronizaría.
