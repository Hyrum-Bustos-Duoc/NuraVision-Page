# Tasks

Orden por dependencia real: esquema → auditoría → tipos → front → QA. Cada
tarea tiene un solo dueño y toca una sola ruta. Los criterios están en
`specs/indicadores-panel/spec.md`; aquí se indica cuáles le tocan.

Prerrequisito externo: `hoyEnElEstudio()` y `sumarMeses()` llegan a `develop`
con `fix/agenda-profesional-real`. 3.1 y 3.2 no empiezan sin eso.

## 1. Base de datos

- [ ] 1.1 **(nv-supabase)** Migración `0022` con la función
  `indicadores_panel` exactamente según el contrato de `design.md`:
  `security invoker`, `stable`, `search_path` fijo, comprobación de
  `es_staff()` antes de leer nada (`42501`), validación del rango (`22023`,
  `hint 'rango_invalido'`), `execute` revocado a `public` y `anon` y concedido a
  `authenticated`, comentario de la función con las limitaciones del ingreso
  estimado (decisión 3), consulta de comprobación y rollback comentado.
  Requisitos: «Indicadores agregados solo para el personal», «Rango de fechas
  válido», «Definición de cada agregado» (todos sus escenarios, ejecutados en
  una base local con datos de prueba y la salida pegada en el reporte).
  Depende de: nada.

- [ ] 1.2 **(nv-rls-auditor)** Auditar 1.1: que sea `security invoker`, que la
  comprobación de `es_staff()` ocurra antes de cualquier lectura, que anon,
  clienta y profesional sin `es_staff` reciban error y no agregados filtrados
  por su RLS, que no cambie ninguna política ni privilegio de tabla, y que el
  cast de `variante.precio` no pueda lanzar con datos sucios. Criterio: reporte
  sin hallazgos bloqueantes, o hallazgos devueltos a nv-supabase.
  Depende de: 1.1.

## 2. Contrato

- [ ] 2.1 **(nv-contracts)** Entrada `indicadores_panel` en `Functions` de
  `frontend/src/shared/types/supabase.ts` con el shape TypeScript de
  `design.md` y comentario de origen (0022, solo personal). Criterio:
  `npx tsc --noEmit -p tsconfig.app.json` falla si un consumidor lee una clave
  que no está en el contrato o pasa `p_desde` como número.
  Depende de: 1.2.

## 3. Frontend

- [ ] 3.1 **(nv-frontend)** Dashboard sobre datos reales: lectura de
  `indicadores_panel` (dos llamadas, ver «Fechas» en `design.md`), las cuatro
  tarjetas, evolución y top 5, encabezado con la fecha real, y «Reservas
  recientes» reutilizando el listado de gestión del módulo `admin` limitado a 8
  filas y con los 4 estados reales. Estados de carga, error con reintento y
  vacío. Sin `useAppState` ni `TODAY_ISO` en la página. Tests unitarios con
  reloj fijo de los escenarios de «Fecha del estudio en las pantallas»
  (incluido `TZ=America/Santiago` a las 22:30) y de las fórmulas del front
  (tasa con 0 reservas, por atender). Requisitos: «Fecha del estudio en las
  pantallas», «Dashboard sobre datos reales», «Reservas recientes del
  Dashboard». Criterio adicional: `tsc -p tsconfig.app.json`, `npm run build`,
  `npm run lint` y `npm test` en pass, con la salida pegada.
  Depende de: 2.1.

- [ ] 3.2 **(nv-frontend)** Analítica sobre datos reales: presets desde la
  fecha de Chile, `indicadores_panel` con el rango elegido (sin llamada si el
  rango está invertido), las cuatro métricas con «Ingresos estimados», evolución,
  top 6 servicios, atenciones por profesional, y «Catálogo por categoría» sobre
  la lista real de servicios. Estados de carga, error con reintento y vacío.
  Sin `useAppState` ni `TODAY_ISO` en la página. Reutiliza la lectura de la
  función que deja 3.1. Tests unitarios de los presets con reloj fijo.
  Requisitos: «Fecha del estudio en las pantallas», «Analítica sobre datos
  reales». Criterio adicional: igual que 3.1.
  Depende de: 3.1.

## 4. Verificación

- [ ] 4.1 **(nv-qa)** Casos desde todos los escenarios de
  `specs/indicadores-panel/spec.md`: llamadas a la función con anon key, sesión
  de clienta con reservas propias, profesional y personal; rangos invertido, de
  un día y que cruzan año; datos sucios en `detalles_extra`; las dos pantallas
  con reloj fijado (22:30 del 2026-10-31 en Chile, 2027-01-15, dispositivo en
  `Europe/Madrid`), con red caída y con base vacía; y comparación de cada cifra
  con su consulta SQL directa. Criterio: reporte con pasos de reproducción de
  cada fallo; sin fallos abiertos para cerrar el cambio.
  Depende de: 3.2.

## Preguntas abiertas

1. **¿«Ingresos» incluye las reservas pendientes y futuras del rango?**
   Recomendación (se usa si nadie responde): sí, todas las no canceladas, con
   el rótulo «Ingresos estimados», porque ninguna pantalla marca reservas como
   completadas y cualquier filtro más estricto daría 0 en producción.
   Alternativa: solo `confirmada` y `completada`. No bloquea: cambiarlo es una
   condición en 1.1 y el texto del rótulo.

## Fuera de alcance

Ver `proposal.md`: ingresos cobrados por Webpay, marcar `completada`, congelar
el precio de reservas sin variante, indicadores de la tienda, comparación con
el período anterior, CSV, tiempo real, índice por `fecha` (sin medición que lo
pida) y retirar los datos semilla del resto de la app.
