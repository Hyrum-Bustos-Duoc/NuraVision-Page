# Tasks

Orden por dependencia real: repositorio → contrato → datos → esquema →
auditoría RLS → servicio → frontend → QA. Cada tarea tiene un solo dueño y toca
una sola ruta. Los criterios detallados son los escenarios de `specs/`; aquí se
indica qué requisitos cubre cada tarea. La verificación la hace nv-qa (9.1), no
quien implementa.

Las tareas marcadas **pending_decision** esperan una respuesta de
`design.md` → Open Questions. Todo lo demás está listo para empezar.

## 0. Tareas del usuario (no las ejecuta ningún agente)

- [x] U.1 **(usuario)** Conseguir la autorización escrita de la clienta, con
  fecha, que cubra: guardar copias en Supabase en un bucket privado, procesar
  las imágenes con un servicio de IA externo para etiquetarlas, y no
  publicarlas. Registrar fecha y alcance en la ficha del dataset (sin datos
  personales de la clienta).
  Criterio: la ficha tiene la fecha y el alcance. Sin esto no se envía ninguna
  imagen a Claude ni se sube ninguna a Storage.
  Bloquea: 3.2, 3.5, U.5.
  Registro 2026-11-17: el usuario autorizó explícitamente en la sesión manipular
  las fotos de Instagram y declaró que las fotos de manos fueron autorizadas por
  sus titulares y entregadas por la clienta. Falta adjuntar el documento de la
  clienta a la ficha del dataset cuando exista.

- [x] U.2 **(usuario)** Responder Q1–Q5 de `design.md`, con fecha.
  Bloquea: Q1 → 4.2, 5.2, 6.1, 7.1, 8.2; Q5 → 3.5. Q2 y Q3 no bloquean (3.4
  usa la recomendación y cambiar la respuesta es una regla y su test). Q4 →
  U.5.
  Respondido el 2026-11-17: Q1 = a (reglas en JSON versionado en el repo; la tabla
  en la base queda como alternativa futura, descartada por ahora), Q2 = a, Q3 = a,
  Q4 = a (retención hasta 2026-12-18), Q5 = a (≥85/100).

- [ ] U.3 **(usuario)** Validar la muestra: revisar las 100 etiquetas, corregir
  las que no comparta (cada corrección marca `etiquetado_por: "usuario"`) y
  leer el informe de comparación con el pipeline.
  Criterio: la ficha registra el acuerdo por campo (forma, diseño, cada
  categoría, cada criterio de calidad) y la decisión de escalar según Q5. Si
  la decisión es no escalar, se reconsidera el plan B de `proposal.md`.
  Depende de: 3.2, 3.3.

- [ ] U.4 **(usuario)** Revisar el artefacto de reglas completo antes de
  publicarlo: las 3 categorías de cada forma, si difieren entre formas (riesgo
  de Q3) y los textos `nombre`/`descripcion` de cada categoría.
  Criterio: aprobado con fecha en la ficha, o Q3 cambiada.
  Depende de: 3.4 ejecutada con las etiquetas de 3.5.

- [ ] U.5 **(usuario)** Ejecutar la subida a Storage con la clave de servicio
  en una variable de entorno, comprobar en el dashboard que el uso total del
  proyecto queda bajo 1 GB y anotar en la ficha el total subido y la fecha de
  borrado según Q4.
  Depende de: U.1, U.2 (Q4), 3.6, 5.1.

## 1. Contrato

- [ ] 1.1 **(nv-contracts)** Revisar el contrato de `design.md`
  (`EtiquetaImagen`, `ReglasDiseno`, `RecomendacionesDiseno`): nullability,
  enums, invariantes de la regla de selección, compatibilidad con `Forma` del
  análisis y error `forma_invalida` con el shape `{codigo, detalle}` existente.
  Criterio: informe «aprobado» o lista de correcciones devuelta a nv-pm.
  Ninguna de 3.4, 4.2, 6.1 ni 8.1 empieza con correcciones pendientes.
  Depende de: nada.

## 2. Repositorio

- [ ] 2.1 **(nv-devops)** Ignorar `/datasets/` (anclado a la raíz), `*.zip` y
  `*.xlsx`, con el comentario del motivo, igual que las demás entradas del
  `.gitignore`.
  Requisito: «Datos fuera del control de versiones».
  Depende de: nada.

## 3. Datos (`services/vision`)

- [ ] 3.1 **(nv-vision)** Ficha del dataset `instagram_disenos` en el índice de
  `services/vision/datasets` (origen, sha256 del zip, conteo, autorización
  según U.1, derechos de terceros, política de datos de `design.md`) y la
  extracción reproducible de la muestra.
  Requisito: «Muestra reproducible».
  Criterio adicional: la ficha lista los 100 sha256 y los rechazos por motivo,
  sin nombres de archivo. Los tests usan un zip sintético con entradas
  `../`, absolutas y duplicadas, nunca el zip real.
  Depende de: 2.1.

- [ ] 3.2 **(nv-vision)** Etiquetar a ojo las 100 imágenes de la muestra con
  las definiciones de `design.md` y el validador del registro.
  Requisito: «Registro de etiquetas».
  Criterio adicional: el archivo versionado pasa el validador; los tests del
  validador cubren cada escenario del requisito con registros sintéticos.
  Depende de: 1.1, 3.1, U.1.

- [ ] 3.3 **(nv-vision)** Ampliar el arnés existente con la anotación de forma
  por sha256 y la matriz de acuerdo; ejecutarlo sobre la muestra y pasar los
  conteos agregados a la ficha.
  Requisito: «Comparación con el pipeline de forma».
  Criterio adicional: los tests actuales del arnés siguen pasando sin cambios.
  Depende de: 3.2.

- [ ] 3.4 **(nv-vision)** Agregación de etiquetas en el artefacto
  `ReglasDiseno`, con los textos de las 7 categorías recomendables. Primera
  ejecución con las etiquetas de la muestra; se vuelve a ejecutar tras 3.5.
  Requisito: «Agregación en reglas».
  Criterio adicional: tests con etiquetas sintéticas para cada escenario; la
  salida pasa la misma validación que hará el consumidor (6.1 o 4.2).
  Depende de: 1.1, 3.2. Q2 y Q3 con su recomendación.

- [ ] 3.5 **(nv-vision)** **pending_decision (Q5, U.3)** Etiquetar el resto del
  dataset con los mismos criterios (`lote: "resto"`), extrayendo en un
  directorio nuevo fuera del repo.
  Requisitos: «Muestra reproducible» (reglas de extracción) y «Registro de
  etiquetas».
  Criterio adicional: todo sha256 distinto del zip tiene un registro, y la
  ficha da los conteos por forma, diseño, categoría y `bien_hecha`.
  Depende de: U.3.

- [ ] 3.6 **(nv-vision)** Copias comprimidas y subida idempotente al bucket,
  solo de las imágenes aptas. Si para hablar con Storage hiciera falta una
  dependencia nueva, se declara; la preferencia es la librería estándar.
  Requisito: «Copias comprimidas».
  Criterio adicional: los tests usan un Storage simulado; ninguno necesita la
  clave real.
  Depende de: 3.5, 4.1.

## 4. Supabase (SQL: solo nv-supabase)

- [ ] 4.1 **(nv-supabase)** Migración del bucket privado `referencias-diseno`
  (1 MB, solo `image/jpeg`), sin políticas para `anon` ni `authenticated`, con
  rollback y el comentario de por qué no tiene ninguna política.
  Requisito: «Bucket privado de referencias».
  Depende de: nada.

- [ ] 4.2 **(nv-supabase)** **pending_decision (Q1 = b)** Tabla de reglas con
  lectura anónima, función que aplica la regla de selección de `design.md` y
  devuelve `RecomendacionesDiseno`, y la migración de datos desde el artefacto
  de 3.4, con rollback.
  Requisitos: «Contrato de recomendaciones» y «Degradación sin reglas».
  Depende de: 1.1, 3.4, U.2.

## 5. Auditoría RLS (solo lectura)

- [ ] 5.1 **(nv-rls-auditor)** Auditar el bucket contra el proyecto real,
  incluidas las políticas de `storage.objects` creadas desde el dashboard sin
  filtrar por bucket (advertencia de la migración 0014).
  Requisito: escenarios «Cliente anónimo» y «Personal autenticado».
  Criterio: informe con la lista de políticas de `storage.objects` y el
  resultado de cada operación con la clave anónima y con una cuenta de
  personal. Con un hallazgo, 3.6 no se ejecuta.
  Depende de: 4.1.

- [ ] 5.2 **(nv-rls-auditor)** **pending_decision (Q1 = b)** Auditar la tabla
  y la función de 4.2: lectura anónima solo de reglas, ninguna escritura desde
  `anon` ni `authenticated`.
  Depende de: 4.2.

## 6. Servicio (`services/api/app`, fuera de `vision/`)

- [ ] 6.1 **(nv-fastapi)** **pending_decision (Q1 = a)** Cargar el artefacto
  de reglas al arrancar (su fallo no tumba el servicio) y servir
  `GET /recomendaciones/diseno`. Actualizar el contrato en el README del API.
  Requisitos: «Contrato de recomendaciones» y «Degradación sin reglas».
  Criterio adicional: los tests de `POST /vision/analizar` siguen pasando sin
  cambios.
  Depende de: 1.1, 3.4, U.2.

## 7. Tipos de base

- [ ] 7.1 **(nv-contracts)** **pending_decision (Q1 = b)** Regenerar los tipos
  de `supabase.ts` con la tabla y la función de 4.2.
  Depende de: 4.2.

## 8. Frontend (`frontend/src/modules/analisis`)

- [ ] 8.1 **(nv-frontend)** Tipos del contrato en el dominio de `analisis`
  (unión discriminada de `design.md`) y el punto único que resuelve una
  respuesta cruda en `RecomendacionesDiseno` válido o `sin_datos`, con tests
  Vitest.
  Requisito: «Contenido del bloque de recomendaciones» (escenarios «Respuesta
  con forma rota» y «Aviso vacío»).
  Depende de: 1.1.

- [ ] 8.2 **(nv-frontend)** **pending_decision (Q1)** Obtener las
  recomendaciones: del servicio de la API (Q1 = a) o de la función de Supabase
  a través del cliente existente (Q1 = b), cancelable, con el error de red
  distinguido de `sin_datos`, y tests.
  Requisito: escenarios «La petición no lleva imagen» y «Error de red».
  Depende de: 8.1, U.2 (y 7.1 si Q1 = b).

- [ ] 8.3 **(nv-frontend)** Botón «Ver recomendaciones de diseño» y bloque, con
  el patrón accesible de `ReporteClinico`, y tests de componente.
  Requisitos: «Botón de recomendaciones de diseño» y «Contenido del bloque de
  recomendaciones».
  Criterio adicional: los tests actuales de `ResultadoUnas` y
  `ReporteClinico` siguen pasando sin cambios.
  Depende de: 8.1. Puede empezar con 8.2 simulado.

- [ ] 8.4 **(nv-frontend)** e2e de análisis con respuestas simuladas: base
  forma, general por `sin_forma`, general por `pocos_datos_forma`,
  `sin_datos`, error de red con reintento y análisis no concluyente sin botón.
  Requisito: «Botón de recomendaciones de diseño».
  Depende de: 8.2, 8.3.

## 9. Verificación

- [ ] 9.1 **(nv-qa)** Cubrir cada escenario de
  `specs/recomendaciones-diseno` y `specs/etiquetado-disenos`, con atención a:
  - el DOM y la red antes de pulsar el botón;
  - que la petición no lleve nada de la foto;
  - los dos bloques abiertos y cerrados en todas las combinaciones, y con
    teclado;
  - una foto nueva con la petición en curso;
  - artefactos de reglas vacíos, inválidos o con `otro`;
  - `localStorage`, `sessionStorage` y cookies tras abrir el bloque;
  - `git check-ignore` y `git status` tras 2.1;
  - el validador de etiquetas con registros con campos extra o un sha256
    repetido;
  - el bucket con clave anónima y con cuenta de personal.
  Depende de: 2.1, 3.3, 3.4, 5.1, 8.4, y 6.1 o 4.2 + 5.2.

- [ ] 9.2 **(nv-contracts)** Verificar que el productor (Pydantic si Q1 = a,
  SQL si Q1 = b), la agregación y el TypeScript implementados coinciden campo
  a campo con el contrato de `design.md`.
  Criterio: informe sin divergencias, o divergencias devueltas a su dueño.
  Depende de: 3.4, 8.1, y 6.1 o 4.2.

## Fuera de alcance

- Mostrar imágenes del dataset (completas o recortadas) a clientas o personal:
  derechos de terceros sin resolver (decisión 6 de `design.md`).
- Difuminar rostros y usernames: no cambia el riesgo si nada sale del bucket.
- Elegir la forma a mano cuando el análisis no la reconoce: nadie lo pidió; el
  respaldo general cubre el caso.
- Mejorar la fiabilidad de almendra y stiletto: es trabajo de la forma, no de
  este cambio (premisa 3 de `proposal.md`).
- Enlazar categorías con servicios o productos del catálogo: nadie lo pidió.
- `/salud` informando si hay reglas cargadas: el log ya dice por qué no se
  cargaron, y `sin_datos` lo hace visible en la UI.
- Detección automática de casi-duplicados: se marcan a ojo durante el
  etiquetado.
- Editar las reglas desde el panel: nadie lo pidió (relevante para Q1).
