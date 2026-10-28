# Tasks

Orden por dependencia real: esquema → auditoría → tipos → front → QA. Cada
tarea tiene un solo dueño y toca una sola ruta. El contrato está en
`design.md`; los escenarios, en `specs/perfil-cliente/spec.md` y
`specs/cumpleanos-clientas/spec.md`. La verificación la ejecuta nv-qa.

## 1. Base de datos

- [x] 1.1 **(nv-supabase)** Migración nueva (siguiente número libre en
  `supabase/migrations/`; hoy `0020`) con `actualizar_mi_perfil` exactamente
  como la firma, los privilegios y la tabla de validación de `design.md`, más
  rollback comentado (`drop function`). No crea ni modifica políticas,
  columnas ni triggers.
  Criterios:
  - Con sesión de clienta, `('Ana Pérez', '+56912345678', '1990-03-04')` deja
    la fila con esos valores y `rol`, `email`, `profesional_id`, `creado_en`
    iguales a antes.
  - Cada fila de la tabla de validación produce `P0001` con su mensaje literal
    y la fila (y `user_metadata`) sin cambios.
  - Con la anon key la llamada falla por permisos.
  - `select policyname from pg_policies where tablename = 'perfiles' and cmd in ('UPDATE', 'ALL')`
    devuelve solo «El personal gestiona los perfiles»: no reaparece la
    política propia.
  - Tras la llamada, `raw_user_meta_data` tiene las tres claves nuevas y
    conserva las previas; `raw_app_meta_data` no cambia.
  - Antes de escribir la migración, comprobar en el proyecto que el dueño de
    la función puede actualizar `auth.users.raw_user_meta_data`. Si no puede,
    detenerse y reportar (ver «Supuesto a verificar» en `design.md`).
  Depende de: nada.

- [ ] 1.2 **(nv-rls-auditor)** Auditar 1.1: `security definer` con
  `search_path` fijo; la función solo escribe las tres columnas y solo la fila
  de `auth.uid()`; no hay forma de pasarle otro id; `execute` revocado a
  `public` y `anon`; la escritura en `auth.users` solo toca
  `raw_user_meta_data` de esa cuenta y no dispara `perfil_al_cambiar_cuenta`;
  0017 sigue vigente.
  Criterio: reporte sin hallazgos bloqueantes, o hallazgos devueltos a
  nv-supabase.
  Depende de: 1.1.

## 2. Tipos

- [ ] 2.1 **(nv-contracts)** `Functions.actualizar_mi_perfil` en
  `frontend/src/shared/types/supabase.ts` con los `Args` y `Returns` de
  `design.md`.
  Criterios:
  - `supabase.rpc('actualizar_mi_perfil', { p_nombre: 'x', p_telefono: '' })`
    sin `p_fecha_nacimiento` no compila.
  - Pasar `p_rol` o cualquier argumento extra no compila.
  - `npx tsc --noEmit -p tsconfig.app.json` en verde.
  Depende de: 1.1.

## 3. Frontend

- [ ] 3.1 **(nv-frontend)** `/perfil` con la sesión real, según «Comportamiento
  de `/perfil`» de `design.md`: lectura de la fila propia de `perfiles`
  reutilizando `Usuario` y su mapper, guardado por la función, normalización
  del teléfono, validación con los mismos mensajes que la base, correo
  bloqueado, refresco de la sesión tras guardar, «Mi cuenta» del encabezado
  apuntando a `/perfil` con sesión real. Retira de la página la dependencia de
  `currentUser` de `AppState`, la tarjeta de puntos y el botón de imágenes, y
  borra lo que quede sin uso.
  Criterios (tests de Vitest donde sea lógica pura; el resto, escenarios del
  requisito «Pantalla "Mi perfil" con la sesión real»):
  - El límite de 120 del nombre cuenta caracteres como la base
    (`char_length`, puntos de código), no unidades UTF-16: un nombre de 120
    emojis se acepta en el front.
  - La normalización del teléfono da los resultados de la lista de ejemplos de
    `design.md`, válidos e inválidos, uno por caso.
  - Con nombre vacío, nombre de 121 caracteres o teléfono inválido, no se
    llama a la función (el doble del repositorio registra 0 llamadas).
  - Dos pulsaciones seguidas de «Guardar cambios» producen 1 llamada.
  - Si la función devuelve arreglo vacío, se muestra error, no éxito.
  - Error `P0001` muestra su mensaje; otro error muestra el genérico; en los
    dos casos no hay toast de éxito y el formulario conserva lo escrito.
  - Fallo al cargar muestra «Reintentar», que vuelve a leer.
  - Sin sesión, una vez cargada la sesión, termina en `/login`; durante la
    carga no redirige.
  - `tsc -p tsconfig.app.json`, `npm run build` y `npm run lint` en verde.
  Depende de: 2.1. No se integra antes de que 1.2 cierre sin hallazgos
  bloqueantes.

## 4. Verificación

- [ ] 4.1 **(nv-qa)** Ejecutar todos los escenarios de
  `specs/perfil-cliente/spec.md` y el escenario nuevo de
  `specs/cumpleanos-clientas/spec.md` contra una base con 1.1 aplicada y el
  front de 3.1, incluidos: UPDATE directo con `rol = 'admin'` (0 filas),
  borrar teléfono y cumpleaños y después cambiar el correo (no reaparecen),
  dos pestañas, sesión expirada al guardar, teléfono heredado sin formato, y
  nombre con 120/121 caracteres y emojis.
  Criterio: reporte con pasos de reproducción por cada fallo; cero fallos
  abiertos para cerrar el cambio.
  Depende de: 1.2, 3.1.

## 5. Cierre

- [ ] 5.1 **(nv-pm)** Tras 4.1 sin fallos, `/opsx:archive`.
  Depende de: 4.1.
