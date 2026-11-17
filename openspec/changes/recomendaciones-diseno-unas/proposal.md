# Proposal

## Why

Hoy `/analisis-ia` le dice a la clienta qué forma tienen sus uñas, pero no qué
hacer con ese dato. No tiene forma de saber qué diseños suelen usarse con esa
forma, y el estudio tampoco tiene un criterio basado en datos para sugerirlo.

Sabremos que el problema está resuelto cuando, después de un análisis con
resultado, la clienta pulse «Ver recomendaciones de diseño» y vea hasta 3
categorías de diseño calculadas a partir del dataset etiquetado para su forma
(o, si su forma no es fiable, las más frecuentes en general), con un aviso de
que son orientativas. No verá ninguna imagen del dataset ni nada del reporte
clínico en ese bloque.

El tamaño real del cambio: toca la configuración del repositorio, los datos y
el arnés de `services/vision`, Supabase (bucket nuevo y, según Q1, una tabla),
`services/api` (según Q1), el frontend de `analisis` y QA. Además requiere
etiquetar a ojo unas 2.435 imágenes. **No es un cambio pequeño.** Se corta en
cuatro rebanadas que se entregan por separado (ver `design.md`, «Rebanadas»).

### Premisas del encargo que hay que corregir

1. **`datasets/` sin anclar en `.gitignore` ignoraría `services/vision/datasets/`.**
   Esa carpeta ya está versionada (FICHA e índice de `kaggle_nail`), y es justo
   donde se versionarán las etiquetas nuevas (decisión 5). La regla debe ser
   `/datasets/` (solo la carpeta de la raíz). `*.zip` y `*.xlsx` sí pueden ser
   globales: hoy ningún `.zip` ni `.xlsx` está versionado (comprobado con
   `git ls-files` el 2026-11-17).
2. **Que la clienta autorice guardar las capturas no da derechos sobre ellas.**
   Son capturas de Instagram: los diseños son de otras manicuristas y pueden
   aparecer usernames y rostros de terceros. La clienta puede autorizar lo que
   hace el estudio, pero no ceder derechos que no tiene. Además, el etiquetado
   visual por Claude (decisión 1) envía cada imagen a un servicio de IA
   externo, y eso también debe estar autorizado por escrito (tarea U.1). Por
   eso **ninguna imagen del dataset se muestra a clientas**, ni completa ni
   recortada (decisión 6 de `design.md`).
3. **Almendra y stiletto nunca llegan a la recomendación.** La forma
   predominante del análisis solo cuenta las formas fiables
   (`services/api/app/vision/unas.py`, `_forma_predominante`), y
   `almendra`/`stiletto` siempre son `forma_fiable = false`
   (`etiquetas-forma.md` §4). Las afinidades de esas dos formas se calculan,
   pero hoy ninguna clienta las recibe: verá la recomendación general. Es
   probable que esas dos formas sean muy frecuentes en el nail art de Instagram,
   así que la parte más rica del dataset es la que hoy no se puede servir.
   Arreglarlo exige mejorar la forma, no este cambio.
4. **Subir las imágenes a Supabase no está en el camino crítico.** La
   recomendación sale de las etiquetas (versionadas), no de las imágenes. La
   subida es una rebanada independiente: si se retrasa, la clienta recibe
   igual las recomendaciones.
5. **El pipeline de forma no está validado para estas fotos.** MediaPipe
   detecta manos, no uñas, y en primeros planos de dedos detecta entre el 1 % y
   el 55 % según el dataset (`preparacion-modelo.md` §4). La regla de forma se
   revisó solo con uñas naturales. Se espera que la comparación de la muestra
   dé muchos «no detectado» y desacuerdos. Ese número es lo que dice cuánto
   confiar en la forma con la que se pide la recomendación.
6. **Hay formas de Instagram que no están entre las 5 clases.** La bailarina
   (coffin) es frecuente en nail art. Se etiqueta `otra_forma` y queda fuera de
   la afinidad, en vez de forzarla a una clase.
7. **Hay un precedente que va en contra de la recomendación de Q1.**
   `preparacion-modelo.md` §7.7 deja anotado «Reglas de recomendación (servicio
   y diseño) en Supabase». Q1 recomienda JSON versionado y explica qué cambió:
   las reglas de este cambio son una estadística derivada de etiquetas
   versionadas, no reglas editoriales, y nadie pidió editarlas desde el panel.

## Decisiones del dueño (Hyrum Bustos, recibidas el 2026-11-17)

No se rediscuten aquí:

1. Etiquetado: muestra de 100 imágenes extraídas en un directorio nuevo fuera
   del repo; etiquetado visual por Claude, comparado con el pipeline en la
   muestra; el usuario valida la muestra y luego se escala al resto.
2. Etiquetas por imagen: `con_diseno`/`sin_diseno`; «bien hecha» con 4
   criterios (esmalte parejo, cutícula sin manchas, bordes limpios, forma
   simétrica); categoría de diseño (lista cerrada en `design.md`); forma de
   uña (5 clases).
3. Relación forma↔diseño por frecuencias/afinidad por clase de forma, usadas
   para recomendar.
4. UI: botón aparte «Ver recomendaciones de diseño» tras el análisis, con aviso
   de que es orientativo. No se mezcla con el reporte clínico.
5. Dataset y zips en `.gitignore` (carpeta de datasets, `*.zip`, `*.xlsx`);
   solo se versionan los archivos de etiquetas.
6. Imágenes en Supabase Storage: bucket privado, copias comprimidas, con
   cuidado del límite de 1 GB del plan gratuito y mitigación documentada para
   usernames y rostros de terceros.
7. Queda abierto (Q1): reglas como JSON versionado o como tabla en la base.

## What Changes

- **Repositorio**: `.gitignore` ignora `/datasets/`, `*.zip` y `*.xlsx` sin
  dejar de versionar `services/vision/datasets/`.
- **Dataset `instagram_disenos`**: ficha con origen, autorización, derechos,
  privacidad y retención; muestra reproducible de 100 imágenes fuera del
  repositorio; etiquetas por imagen con la clave sha256 (sin nombres de archivo
  ni usernames); comparación con el pipeline de forma usando el arnés que ya
  existe.
- **Agregación**: un proceso determinista convierte las etiquetas en el
  artefacto de reglas (frecuencia y afinidad por forma, hasta 3 categorías por
  forma y una lista general).
- **Storage**: bucket privado `referencias-diseno` sin ninguna política para
  `anon` ni `authenticated`, con copias comprimidas sin metadatos y un tope de
  500 MB para todo el dataset.
- **Servicio de recomendaciones**: dado solo el nombre de una forma (nunca una
  imagen), devuelve el contrato `RecomendacionesDiseno` de `design.md`. Dónde
  vive depende de Q1.
- **UI**: un botón «Ver recomendaciones de diseño» en el resultado del
  análisis, independiente del reporte clínico, que carga las recomendaciones al
  pulsarlo y muestra aviso, base («para tu forma» o «en general») y hasta 3
  categorías, sin imágenes ni números.

## Capabilities

### New Capabilities
- `recomendaciones-diseno`: el contrato, la regla de selección por forma con
  respaldo general, la degradación sin reglas y el bloque de la UI.
- `etiquetado-disenos`: el ignorado del repositorio, la muestra, el esquema de
  etiquetas, la comparación con el pipeline, la agregación y el bucket privado.

### Modified Capabilities
<!-- No hay specs previas del análisis IA en openspec/specs/. -->

## Alternativas descartadas

- **Recomendaciones escritas a mano por el estudio** (5 formas × 3 diseños).
  Resuelve el mismo problema de la clienta con mucho menos costo y sin riesgo
  de derechos. No se elige porque el dueño decidió que la recomendación salga
  del dataset (decisiones 1–3). Queda escrita porque sigue siendo el plan B si
  la validación de la muestra (U.3) sale mal.
- **Recomendaciones dentro de la respuesta de `POST /vision/analizar` o del
  reporte clínico.** La decisión 4 lo prohíbe en la UI, y en el contrato no
  hace falta: la recomendación solo necesita la forma, no la foto. Así, la
  petición de recomendaciones no transporta ningún dato biométrico.
- **Enviar la foto o los recortes al servicio de recomendaciones.** Multiplica
  el manejo de un dato biométrico sin ganar nada: la forma ya viene calculada.
- **Recomendar con una forma no fiable** (la más frecuente contando almendra y
  stiletto). `etiquetas-forma.md` §4 muestra que esas formas salen casi siempre
  de uñas naturales vistas de lado: recomendar diseños de stiletto a una uña
  corta fotografiada de lado es el error que hay que evitar.
- **Recomendación por uña.** Las 5 uñas de una mano salen con formas distintas
  por el ángulo, no porque lo sean. Se recomienda por la forma predominante.
- **Bucket público o miniaturas recortadas a las uñas visibles para clientas.**
  El recorte no quita el problema de derechos sobre el diseño ajeno, y recortar
  bien exige detectar la uña, que en estos primeros planos falla
  (premisa 5): cada recorte habría que revisarlo a mano. Se reconsidera solo
  con imágenes propias del estudio.
- **Mostrar porcentajes** («el 70 % de las uñas cuadradas lleva francesa»).
  Sale de una muestra de Instagram con sesgo de tendencia y se leería como
  fuerza de la recomendación. El número viaja en el contrato y no se pinta.
- **Etiquetar la forma con el pipeline** en vez de a ojo. Ver premisa 5: la
  regla no está validada para uñas esculpidas y MediaPipe detecta poco en
  primeros planos. El pipeline solo se compara (decisión 1).
- **Nombre de archivo original como clave de las etiquetas.** Los nombres de
  las capturas pueden llevar usernames o fechas. La clave es el sha256.
- **Entrenar ahora un clasificador de diseño.** Nadie pidió reconocer el diseño
  que lleva la clienta; la recomendación solo usa su forma.
- **`datasets/` sin anclar en `.gitignore`.** Premisa 1.
- **Umbral de soporte, número de recomendaciones o ranking configurables.** Hay
  un solo valor pedido para cada uno; se fijan en `design.md`.

## Impact

- Raíz: `.gitignore`.
- `services/vision`: ficha y etiquetas del dataset nuevo, muestra, extensión
  del arnés para comparar la forma, agregación y subida a Storage.
- `supabase/migrations`: bucket privado `referencias-diseno` y, si Q1 = b, la
  tabla o función de reglas.
- `services/api/app` (fuera de `vision/`), solo si Q1 = a: el servicio de
  recomendaciones.
- `frontend/src/modules/analisis`: tipos, resolución del contrato y bloque de
  recomendaciones.
- `frontend/src/shared/types/supabase.ts`, solo si Q1 = b.
- No cambia `POST /vision/analizar` ni el reporte clínico.
- Ninguna dependencia nueva prevista. Si la compresión necesitara una, la
  declara la tarea 3.6.
