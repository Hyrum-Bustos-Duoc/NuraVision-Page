# Tasks

Orden por dependencia real: esquema → auditoría → tipos → front → QA. Cada tarea
tiene un solo dueño y toca una sola ruta. Los criterios están en
`specs/cumpleanos-clientas/spec.md`; aquí se indica cuáles le tocan.

## 1. Base de datos

- [x] 1.1 **(nv-supabase)** Migración `0016` (se aplica después de la `0015`
  de `abono-servicios-unas`; no comparten objetos): columna
  `perfiles.fecha_nacimiento date null` con su check y comentario de réplica;
  `sincronizar_perfil()` redefinida con la regla de validación de `design.md`
  sin cambiar nada más de lo que hace en 0010; triggers de 0010 con las mismas
  columnas; carga inicial; consulta de comprobación (`count(*)` y
  `count(fecha_nacimiento)` de `perfiles`); rollback comentado que restaura la
  función de 0010 y elimina la columna. Requisitos: «Réplica validada del
  cumpleaños en el alta», «Conservación del cumpleaños en actualizaciones de la
  cuenta», «Carga inicial de las cuentas existentes», «Rango válido ante
  escrituras directas».
  Depende de: nada.

- [x] 1.2 **(nv-rls-auditor)** Auditar 1.1: que ningún valor de `user_metadata`
  haga fallar el alta (incluidos `'1990-02-30'`, `'99999-01-01'` y tipos no
  string), que la función siga con `security definer` y `search_path` fijo, que
  no cambie ninguna política ni privilegio de `perfiles`, y que la lectura de
  `fecha_nacimiento` quede como la tabla «Quién lee el dato» de `design.md`.
  Requisito: «Lectura restringida
  del cumpleaños». Criterio: reporte sin hallazgos bloqueantes, o hallazgos
  devueltos a nv-supabase.
  Depende de: 1.1.

- [x] 1.3 **(nv-supabase)** Migración `0017_perfiles_sin_autoedicion.sql`:
  borra la política «Correccion del perfil propio» de 0010, sin tocar la
  lectura propia ni la política del personal. Requisito: «Rango válido ante
  escrituras directas» (escenarios de la clienta). Ver decisión en `design.md`.
  Depende de: 1.1.

- [x] 1.4 **(nv-rls-auditor)** Auditar 0017: la clienta afecta 0 filas al
  actualizar su perfil, el personal sigue escribiendo `nombre`, `telefono` y
  `rol`, y el alta y la sincronización siguen escribiendo. Criterio: reporte sin
  hallazgos bloqueantes.
  Depende de: 1.3.

## 2. Contrato

- [x] 2.1 **(nv-contracts)** `perfiles.fecha_nacimiento` en
  `frontend/src/shared/types/supabase.ts` según la tabla de contrato de
  `design.md` (Row `string | null`; Insert/Update opcional), con comentario de
  origen y de que es réplica validada. Criterio:
  `npx tsc --noEmit -p tsconfig.app.json` falla si un consumidor trata
  `Row.fecha_nacimiento` como `string` sin comprobar `null`.
  Depende de: 1.2, 1.4.

## 3. Frontend

- [x] 3.1 **(nv-frontend)** `fechaNacimiento` en el dominio y el mapper de
  `usuarios` (tolerando columna ausente → `null`), cálculo del próximo
  cumpleaños según `design.md` con tests unitarios de todos los escenarios del
  requisito «Filtro de próximos cumpleaños» (fechas fijas, sin depender del día
  en que corre el test, incluido uno con `TZ=America/Santiago` a las 22:30), y en
  el panel de usuarios: cumpleaños en cada fila y el filtro «Próximos
  cumpleaños (n)» con su estado vacío, contador sujeto a rol y búsqueda, y la
  etiqueta de días visible en las filas de la ventana con el filtro apagado. `DatosPerfil` no cambia. Requisitos:
  «Cumpleaños en la lista de usuarios del panel», «Filtro de próximos
  cumpleaños». Criterio adicional: `tsc -p tsconfig.app.json`, `npm run build`
  y `npm run lint` en pass.
  Depende de: 2.1.

## 4. Verificación

- [ ] 4.1 **(nv-qa)** Casos desde todos los escenarios de
  `specs/cumpleanos-clientas/spec.md`: altas con metadatos inválidos (crear
  cuentas con `signUp` y comprobar que no fallan), lectura con anon key, con
  sesión de clienta, de profesional sin `es_staff` y de personal, UPDATE directo
  fuera de rango del personal, UPDATE de la clienta sobre su fila (0 filas), y
  el panel con reloj fijado en las fechas de los escenarios
  (cambio de año, 29 de febrero, 22:30 en Chile). Criterio: reporte con pasos de
  reproducción de cada fallo; sin fallos abiertos para cerrar el cambio.
  Depende de: 3.1.

## Preguntas abiertas

1. **Ventana de «Próximos cumpleaños».** El dueño no la fijó. Recomendación
   (se usa si no responde): 30 días, porque cubre un mes completo hacia delante
   desde cualquier día. Alternativa: 7 días, si el saludo se prepara con una
   semana. No bloquea: cambiarla es un número y un texto en 3.1.

## Fuera de alcance

- Envío automático de saludos o cupones, y descuento automático: sin
  infraestructura de correo programado ni regla de negocio definida
  (ver `proposal.md`).
- Editar el cumpleaños tras el registro: `Profile.tsx` no está conectado a la
  cuenta real (guardar solo muestra un toast); requiere su propio cambio.
- Pedir el cumpleaños al crear cuentas desde el panel (`admin-cuentas`): no se
  pidió.
