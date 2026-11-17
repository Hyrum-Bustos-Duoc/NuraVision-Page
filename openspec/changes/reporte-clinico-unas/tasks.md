# Tasks

El orden sigue las dependencias reales: contrato → entrenamiento e inferencia
→ servicio → frontend → QA. Cada tarea tiene un solo dueño y toca una sola ruta.
Los criterios detallados son los escenarios de `specs/`. Aquí se indica qué
requisitos cubre cada tarea. La verificación la ejecuta nv-qa (6.1), no quien
implementa.

**Nada de este cambio limpia, particiona ni entrena `Nail.zip`.** Esos pasos
son del usuario (sección 0) y se ejecutan sobre las herramientas que dejan
listas las secciones 2 a 5.

## 0. Tareas del usuario (no las ejecuta ningún agente)

- [ ] U.1 **(usuario)** Aclarar la licencia de `Nail.zip`. El origen ya está
  confirmado: su sha256 coincide con Kaggle `arthitaya/nail-dataset` v2 (FICHA
  §1). La licencia allí es «Unknown».
  Criterio: la FICHA registra, con fecha, la licencia comprobada o la decisión
  explícita de usarlo solo en la demo académica.
  Bloquea: U.9.

- [ ] U.2 **(usuario)** Normalizar: renombrar las carpetas a los ids de
  `design.md` y aplicar la respuesta a Q2.
  Criterio: `python -m entrenamiento dividir --tarea estado_clinico` ya no
  falla por nombres de carpeta.
  Depende de: 2.1.

- [ ] U.3 **(usuario)** Revisar los casi-duplicados (con la ayuda de 2.4 si
  Q3 = a) y escribir el archivo `archivo,serie` **fuera del repositorio**.
  Criterio: cada par candidato revisado tiene una decisión: misma serie o
  distinta.
  Depende de: U.2 (y de 2.4 si aplica).

- [ ] U.4 **(usuario)** Generar la partición por series y revisar los conteos
  y rechazos por clase antes de usar la GPU.
  Depende de: 2.2, U.3.

- [ ] U.5 **(usuario)** Entrenar `estado_clinico` en Colab, revisar
  `comparativa.md` (M1–M4) y copiar el modelo exportado a la carpeta de
  modelos del servicio.
  Depende de: 2.3, U.4, 4.1.

- [ ] U.6 **(usuario)** Reunir 30–50 fotos de celular **con consentimiento
  escrito** de cada persona, guardarlas fuera del repositorio, anotarlas
  (opcional) y ejecutar el arnés. Sin modelo, el arnés ya mide la cobertura de
  MediaPipe; las métricas H1 y H2 requieren U.5.
  Depende de: 2.5.

- [ ] U.7 **(usuario)** Conseguir que una profesional revise los textos
  clínicos y cambie el estado de revisión a `revisado`, con su nombre,
  profesión y fecha.
  Depende de: 3.2.

- [ ] U.8 **(usuario)** Confirmar la retención de las fotos del arnés
  (propuesta: 2026-12-18) y conseguir una revisión legal del tratamiento del
  resultado clínico como dato de salud antes de cualquier uso con clientas
  reales.

- [ ] U.9 **(usuario)** Decidir si se habilita el modelo para clientas reales.
  Requisitos: M1–M4 y H1–H3 cumplidos (o umbrales cambiados por escrito en
  Q4), U.1, U.7 y U.8 resueltos. Mientras tanto, el modelo no se instala en un
  entorno al que accedan clientas.
  Depende de: U.5, U.6, U.7, U.8.

- [ ] U.10 **(usuario)** Decidir Q6 de `design.md` (abierta el 2026-11-12):
  si la guarda de entrenamiento rechaza los nombres de clase no ASCII para
  cerrar el hueco de los homoglifos, o se acepta como deuda conocida.
  Criterio: la decisión queda escrita con fecha en Q6. Si es «a», se abre una
  tarea de nv-vision con su escenario.
  No bloquea nada de lo entregado.

- [ ] U.11 **(usuario)** Decidir Q7 de `design.md` (abierta el 2026-11-12):
  si una salida del modelo con probabilidades negativas en clases no elegidas
  pasa a `clasificacion_fallida` o sigue dando `ok` sin aviso como hoy.
  Criterio: la decisión queda escrita con fecha en Q7. Si es «a», se abre una
  tarea de nv-vision con su escenario.
  No bloquea nada de lo entregado.

## 1. Contrato

- [x] 1.1 **(nv-contracts)** Revisar el contrato de `design.md` contra
  `services/api/app/vision/esquemas.py` y
  `frontend/src/modules/analisis/domain/analisis.types.ts`: nullability,
  enums, invariantes de `Clinico` y compatibilidad con respuestas sin
  `clinico`.
  Criterio: un informe con «aprobado» o con la lista de correcciones devuelta
  a nv-pm. Ninguna de las tareas 3.2 ni 5.1 empieza con correcciones
  pendientes.
  Depende de: nada.

## 2. Entrenamiento y datos (`services/vision`)

- [x] 2.1 **(nv-vision)** Guarda clínica por tarea, tarea `estado_clinico` en
  `config.toml` (9 ids, `revision_profesional` con las 7 clases de señal) y
  lado mínimo por tarea según Q2.
  Requisitos: «Guarda clínica por tarea» y «Lado mínimo por tarea».
  Criterio adicional: los tests actuales de la guarda y de las fichas externas
  siguen pasando. Solo cambia el que cuenta las tareas por defecto.
  Depende de: 1.1.

- [x] 2.2 **(nv-vision)** Partición por series en `dividir` y `verificar`.
  `comparar` reproduce la misma partición, y el cuaderno de Colab permite
  elegir `estado_clinico` y pide el archivo de series.
  Requisito: «Partición por series».
  Depende de: 2.1.

- [x] 2.3 **(nv-vision)** Métricas con abstención, calibración de
  `umbral_sin_senales`, exportación de `tarea` y `umbral_sin_senales`, y
  veredicto M1–M4 en `comparativa.md`.
  Requisito: «Métricas con abstención y umbral de sin señales».
  Criterio adicional: la tabla de casos de la decisión 5 da el mismo motivo
  aquí que en 3.2.
  Depende de: 2.2.

- [x] 2.4 **(nv-vision)** `pending_decision` (Q3). Informe de casi-duplicados
  candidatos.
  Requisito: «Informe de casi-duplicados candidatos».
  Depende de: 2.1.

- [x] 2.5 **(nv-vision)** Arnés de fotos reales. Usa el análisis del servicio
  tal cual, sin copiarlo, y no incluye ninguna foto en los tests: estos usan
  imágenes sintéticas.
  Requisito: «Arnés de fotos reales».
  Depende de: 3.2.

- [x] 2.6 **(nv-vision)** Verificar en su página de origen los datasets
  candidatos (`nail-disease-multilabel`, `nail-diseases-2`,
  `NailDiseaseClf` y los que aparezcan) y registrarlos en el índice de
  `datasets/`. Si una página no responde, la tarea pasa a U.1 para que la
  revise el usuario a mano.
  Requisito: «Registro de datasets candidatos».
  Depende de: nada.

- [x] 2.7 **(nv-vision)** Actualizar la documentación que hoy afirma lo
  contrario:
  - README de `services/vision` §5: la fila de clases clínicas pasa a
    reflejar la decisión del 2026-11-12, cuya razón técnica sigue en pie, y se
    añade la fila de la lista cerrada.
  - README de `services/vision` §2: la opción `TAREA`.
  - FICHA de `kaggle_nail`: queda declarado que `Nail.zip` es este dataset,
    que entrena `estado_clinico` solo con la partición por series, la tabla de
    carpeta → id y que el `particion.json` existente no se usa para entrenar.
  - Índice de `datasets/`.
  - `preparacion-modelo.md` §7.
  Criterio: ningún documento de `services/vision` afirma ya que el dataset «no
  entrena ninguna tarea» ni que el proyecto excluye toda clase clínica, sin
  matizarlo.
  Depende de: 2.3.

- [x] 2.8 **(nv-vision)** Corrección tras la segunda pasada de QA
  (2026-11-12): la guarda rechaza los nombres que **contienen** un nombre
  clínico, tras la normalización de la decisión 2 de `design.md`, con palabra
  entera para los nombres cortos o ambiguos y los equivalentes de las carpetas
  de Kaggle y las raíces `onych`/`oniquia`.
  Requisito: «Guarda clínica por tarea» (escenarios «Nombre compuesto que
  contiene un id clínico», «Separadores y caracteres invisibles», «Variantes
  de las carpetas de Kaggle y raíces clínicas» y «Palabras cortas dentro de
  otra palabra»).
  Evidencia: commit `25bd6c4`, con tests de la guarda que recorren además las
  clases reales de `forma` y `estado`.
  Fuera de esta tarea: el límite de los homoglifos (Q6, U.10).
  Depende de: 2.1.

## 3. Inferencia (`services/api/app/vision`)

- [x] 3.1 **(nv-vision)** Spike para decidir el motor de ejecución (Q1).
  Exportar MobileNetV3Small y EfficientNetB0 con la cabeza aleatoria y semilla
  fija, por el mismo camino de exportación (no hace falta entrenar), y
  comparar con Keras sobre 20 entradas sintéticas. Si se recurre a una
  dependencia nueva, confirmar que tiene rueda para Python 3.14.
  Criterio: diferencia absoluta máxima de probabilidades ≤ 1e-3 en las dos
  arquitecturas con el motor elegido, con la salida pegada en el informe. Si
  no hay ninguno sin dependencia nueva que lo cumpla, el informe lo dice y
  propone la dependencia.
  Depende de: nada.

- [x] 3.2 **(nv-vision)** Esquema según el contrato, carga y validación del
  modelo clínico y del archivo de textos, reglas de abstención, entrada
  idéntica a la del entrenamiento, borrador de los textos (estado
  `pendiente`) y logs sin datos clínicos. Los tests usan un clasificador falso,
  porque no hay modelo entrenado.
  Requisitos: «Bloque clínico por uña», «Degradación sin modelo clínico»,
  «Reglas de abstención», «Textos clínicos editables» y «Privacidad del
  resultado clínico» (la parte del servicio).
  Corrección tras QA (2026-11-12), ya implementada: las alternativas excluyen
  también `sin_senales` (escenarios «Sin señales nunca es alternativa» y
  «Siempre dos alternativas»), y un `etiquetas.json` con valores que no son
  texto deja el modelo sin cargar en vez de tumbar el arranque (escenario
  «Etiquetas que no son texto»).
  Depende de: 1.1, 3.1.

- [x] 3.3 **(nv-vision)** Corrección tras la segunda pasada de QA
  (2026-11-12): el esquema de `Clinico` rechaza `sin_senales` como
  alternativa (además de `otra`, la predicha y un número distinto de 2), y la
  carga del clasificador trata un JSON anidado en exceso como modelo
  inutilizable en vez de tumbar el arranque.
  Requisitos: escenarios «El esquema rechaza alternativas prohibidas» y «JSON
  del modelo anidado en exceso».
  Evidencia: commit `469a8d8`, con tests de entradas inválidas (etiquetas,
  metadatos, textos y probabilidades límite) en el servicio.
  Fuera de esta tarea: probabilidades negativas en clases no elegidas (Q7,
  U.11).
  Depende de: 3.2.

## 4. Servicio (`services/api/app`, fuera de `vision/`)

- [x] 4.1 **(nv-fastapi)** Cargar el clasificador clínico al arrancar, igual
  que el segmentador (opcional; su fallo no tumba el servicio), y añadir
  `clasificador_clinico_cargado` a `/salud`. Actualizar la sección de
  contrato del README del API.
  Requisitos: «Estado del clasificador en salud» y «Degradación sin modelo
  clínico» (arranque).
  Depende de: 3.2.

## 5. Frontend

- [x] 5.1 **(nv-frontend)** Tipos del contrato en el dominio de `analisis`
  (unión discriminada de `design.md`) y una función pura que derive el
  resumen por mano y trate `clinico` ausente como no disponible, con tests
  Vitest.
  Requisito: «Contenido del bloque expandido» (resumen).
  Depende de: 1.1.

- [x] 5.2 **(nv-frontend)** Botón «Ver reporte clínico» y bloque expandible
  dentro del resultado, con el patrón accesible de `EditorCarrusel`, y tests de
  componente.
  Requisitos: «Reporte tras un botón», «Contenido del bloque expandido» y
  «Privacidad del resultado clínico» (la parte del navegador).
  Criterio adicional: los tests actuales de `ResultadoUnas` siguen pasando sin
  cambios.
  Depende de: 5.1.

- [x] 5.3 **(nv-frontend)** Ampliar los e2e de análisis (`frontend/e2e`) con
  respuestas simuladas: con resultado clínico, sin modelo y sin el campo
  `clinico`.
  Requisito: «Reporte tras un botón».
  Depende de: 5.2.

- [x] 5.4 **(nv-frontend)** Corrección tras QA (2026-11-12): el punto único
  que resuelve el bloque clínico de cada uña trata un `ok` incompleto (sin
  `reporte`, sin `clase` de texto o sin lista de `alternativas`) como
  `no_concluyente` con `clasificacion_fallida`, con test Vitest.
  Requisito: escenario «Resultado ok incompleto».
  Evidencia: commit `f1d83b2`. La segunda pasada de QA lo amplió en 5.5.
  Depende de: 5.1.

- [x] 5.5 **(nv-frontend)** Corrección tras la segunda pasada de QA
  (2026-11-12): el punto único que resuelve el bloque clínico comprueba la
  forma completa de un `ok` y descarta el `ok` entero si una alternativa está
  rota o prohibida; el aviso vacío cae al aviso por defecto; los textos fijos
  de la pantalla dejan de hablar de «el estado» y dicen que el reporte
  reconoce solo algunas señales y no descarta nada.
  Requisitos: escenarios «Reporte con textos rotos», «Alternativa con forma
  rota», «Alternativa prohibida descarta el resultado entero», «Número de
  alternativas y clase desconocida no se validan en la UI», «Aviso clínico
  vacío» y el requisito «Textos de la pantalla de análisis».
  Evidencia: commit `fdd070c`, con tests Vitest de dominio y de componente y
  un e2e de un `ok` con reporte vacío que no deja la página en blanco.
  Depende de: 5.4.

## 6. Verificación

- [x] 6.1 **(nv-qa)** Cubrir cada escenario de `specs/reporte-clinico-unas` y
  `specs/entrenamiento-clinico`, con atención especial a:
  - un modelo instalado con etiquetas ajenas o dañado;
  - un clasificador que lanza una excepción en una sola uña;
  - `otra` con confianza 0,99;
  - los dos umbrales `null`;
  - logs capturados durante un análisis;
  - `localStorage` y `sessionStorage` después de abrir el reporte;
  - el contenido del DOM antes de pulsar el botón;
  - el teclado;
  - dos manos;
  - una foto nueva con el bloque abierto;
  - la regresión de la forma con y sin segmentador;
  - la huella de la partición de `forma` sin series.
  Estado (2026-11-12): **PASS en la tercera pasada**. La primera pasada
  encontró tres huecos (alternativas con `sin_senales`, arranque con
  `etiquetas.json` mal formado y `ok` sin `reporte`); la segunda, los
  corregidos en 2.8, 3.3 y 5.5. La tercera comprobó F1–F6 ejecutando casos
  (Vitest, Playwright, sondas Python y un fuzz de 51.784 vectores sobre
  `decidir`) y no halló fallos graves. Hallazgos menores de esa pasada:
  - corregidos el 2026-11-12: `key` duplicada con asociaciones repetidas en
    `ReporteClinico`, `RecursionError` al leer un TOML de textos muy anidado y
    un `.tflite` cuantizado (int8/uint8) que se cargaba como válido y fallaba
    en cada uña;
  - abiertos, sin bloquear: el backend acepta textos de solo espacios que el
    frontend rechaza (`min_length=1` no recorta), y la guarda de
    entrenamiento deja pasar plurales en español y sinónimos coloquiales de
    los ids (`manchas_blancas`, `lineas_oscuras`, `linea_negra`). Ambos
    dependen del contenido del TOML o de los nombres de carpeta, no de
    entradas de la clienta. Q6 y Q7 siguen siendo decisiones del usuario
    (U.10, U.11).
  Depende de: 2.3, 2.5, 2.8, 3.3, 4.1, 5.3, 5.5.

- [x] 6.2 **(nv-contracts)** Verificar que el Pydantic y el TypeScript
  implementados coinciden campo a campo (nombres, nullability, enums e
  invariantes) con el contrato de `design.md`.
  Criterio: un informe sin divergencias, o las divergencias devueltas a su
  dueño.
  Depende de: 3.2, 5.1.
