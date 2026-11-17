# Spec Delta

## Purpose
Preparación del dataset de capturas de Instagram para recomendar diseños:
qué se ignora en Git, cómo se saca la muestra, qué se etiqueta y con qué
shape, cómo se compara con el pipeline de forma, cómo se agregan las
etiquetas en reglas y cómo se guardan las copias en un bucket privado. No
expone ninguna imagen.

## ADDED Requirements

### Requirement: Datos fuera del control de versiones
El repositorio SHALL ignorar la carpeta `datasets/` de la raíz, todo archivo `*.zip` y todo archivo `*.xlsx`, y MUST NOT ignorar los archivos de `services/vision/datasets/`.

#### Scenario: Zips y carpeta de la raíz
- **WHEN** se ejecuta `git check-ignore` sobre `insta-dataset.zip`, `datasets/Nail.zip`, `datasets/cualquier/foto.jpg` y `cualquier/ruta/hoja.xlsx`
- **THEN** los cuatro salen ignorados

#### Scenario: Etiquetas versionables
- **WHEN** se ejecuta `git check-ignore` sobre `services/vision/datasets/README.md` y sobre un archivo de etiquetas nuevo dentro de `services/vision/datasets/`
- **THEN** ninguno sale ignorado, y `git status` no muestra ningún archivo ya versionado como borrado

### Requirement: Muestra reproducible
La extracción de la muestra SHALL elegir 100 imágenes distintas por sha256 con la semilla `20261117`, SHALL escribirlas en un directorio nuevo y vacío fuera del repositorio con el nombre `<sha256>.<extension original>`, y SHALL registrar la lista de los 100 sha256 en la ficha del dataset. MUST negarse a escribir dentro del repositorio o en un directorio no vacío, MUST rechazar entradas del zip con ruta absoluta o con `..`, y MUST comprobar el tamaño descomprimido declarado antes de escribir. No SHALL ejecutar nada de lo que contiene el zip.

#### Scenario: Determinista
- **WHEN** se ejecuta dos veces la extracción sobre el mismo zip en dos directorios nuevos
- **THEN** los dos directorios contienen los mismos 100 archivos, con el mismo nombre y contenido

#### Scenario: Directorio dentro del repo
- **WHEN** el destino está dentro del repositorio o ya contiene archivos
- **THEN** la extracción termina con error y no escribe nada

#### Scenario: Entrada peligrosa
- **WHEN** el zip contiene una entrada `../fuera.jpg` o `/tmp/x.jpg`
- **THEN** esa entrada no se escribe y aparece contada como rechazada en el resumen, sin su nombre

#### Scenario: Duplicados exactos
- **WHEN** dos entradas del zip tienen el mismo sha256
- **THEN** cuentan como una sola imagen para la muestra y para los conteos

### Requirement: Registro de etiquetas
Cada imagen etiquetada SHALL tener un registro con el shape `EtiquetaImagen` de `design.md`, en un archivo versionado. Un validador SHALL rechazar el archivo si algún registro viola el shape o sus invariantes, si un sha256 se repite, o si aparece cualquier campo extra. `bien_hecha` MUST NOT guardarse: se calcula desde `calidad`.

#### Scenario: Imagen no apta
- **WHEN** un registro tiene `apta: false` y `motivo_no_apta: "sin_unas_visibles"`
- **THEN** el validador lo acepta solo si `forma`, `diseno` y `calidad` son `null` y `categorias` es `[]`

#### Scenario: Con diseño sin categoría
- **WHEN** un registro tiene `diseno: "con_diseno"` y `categorias: []`, o 4 categorías, o una categoría repetida
- **THEN** el validador lo rechaza

#### Scenario: Sin diseño con esmalte evaluado
- **WHEN** un registro tiene `diseno: "sin_diseno"` y `calidad.esmalte_parejo: true`
- **THEN** el validador lo rechaza

#### Scenario: Campo extra
- **WHEN** un registro trae `archivo`, `usuario` o `nota`
- **THEN** el validador lo rechaza

#### Scenario: Bien hecha calculada
- **WHEN** los criterios son `true, true, true, true` / `true, false, null, true` / `true, null, true, true`
- **THEN** `bien_hecha` vale `true` / `false` / `null`

### Requirement: Comparación con el pipeline de forma
Para cada imagen de la muestra, el arnés existente SHALL ejecutar el análisis real del servicio y comparar `forma_predominante` con la `forma` etiquetada a ojo. El informe SHALL dar: imágenes con mano detectada, imágenes con `forma_predominante`, la matriz de confusión entre la forma a ojo (incluidas `otra_forma` y `no_determinable`) y la del pipeline (incluido «sin forma» y «no detectado»), y el acuerdo en las 3 formas fiables. El informe por imagen SHALL quedar fuera del repositorio; solo los conteos agregados pasan a la ficha.

#### Scenario: Informe completo
- **WHEN** se ejecuta la comparación sobre la muestra de 100
- **THEN** la suma de cada fila de la matriz es igual al número de imágenes aptas con esa forma a ojo, y la suma total más las no aptas da 100

#### Scenario: Sin mano
- **WHEN** el análisis de una imagen responde `no_concluyente` con `sin_mano`
- **THEN** cuenta en la columna «no detectado» y su etiqueta a ojo no cambia

#### Scenario: Salida dentro del repo
- **WHEN** se indica una salida dentro del repositorio
- **THEN** el arnés se niega, igual que hoy

### Requirement: Agregación en reglas
La agregación SHALL producir, a partir del archivo de etiquetas, un artefacto `ReglasDiseno` según las definiciones de `design.md` (qué imágenes cuentan, `n ≥ 5`, `N(f) ≥ 20`, ranking, máximo 3, sin `otro`). El resultado SHALL ser el mismo byte a byte para el mismo archivo de etiquetas. `version` SHALL incluir los primeros 12 hex del sha256 del archivo de etiquetas.

#### Scenario: Soporte mínimo
- **WHEN** en etiquetas sintéticas `cuadrada` tiene 25 imágenes con diseño y `pedreria_3d` aparece en 4
- **THEN** `pedreria_3d` no está en la lista de `cuadrada`

#### Scenario: Forma con pocas imágenes
- **WHEN** `stiletto` tiene 19 imágenes con diseño, todas con `francesa`
- **THEN** la lista de `stiletto` es `[]` y esas 19 imágenes cuentan en `general`

#### Scenario: Otro y formas fuera de clase
- **WHEN** 30 imágenes tienen solo la categoría `otro` y 10 tienen `forma: otra_forma`
- **THEN** `otro` no aparece en ninguna lista y las 10 cuentan en `general` pero no en `por_forma`

#### Scenario: Ranking y empate
- **WHEN** en `ovalada` `francesa` y `glitter` tienen la misma frecuencia y `glitter` mayor afinidad
- **THEN** `glitter` va antes que `francesa`

### Requirement: Bucket privado de referencias
Las migraciones SHALL crear un bucket `referencias-diseno` privado, con límite de 1 MB por objeto y solo `image/jpeg`. Ninguna política SHALL permitir a `anon` ni a `authenticated` (incluido el personal) listar, leer, firmar URL, subir, reemplazar ni borrar objetos de ese bucket. La migración SHALL tener rollback.

#### Scenario: Cliente anónimo
- **WHEN** con la clave anónima se lista el bucket, se descarga `insta/<sha256>.jpg` o se pide una URL firmada
- **THEN** las tres operaciones fallan o devuelven una lista vacía

#### Scenario: Personal autenticado
- **WHEN** una cuenta con `es_staff()` verdadero intenta las mismas operaciones y además subir un archivo
- **THEN** todas fallan

#### Scenario: Objeto grande o de otro tipo
- **WHEN** con la clave de servicio se sube un JPEG de 1,5 MB o un PNG
- **THEN** Storage lo rechaza

### Requirement: Copias comprimidas
La subida SHALL considerar solo las imágenes con `apta: true` en el archivo de etiquetas (las no aptas pueden ser memes, rostros o promociones y no aportan nada a las reglas), SHALL convertir cada una a JPEG de calidad 80 con el lado mayor ≤ 1080 px, corrigiendo la orientación EXIF y sin ningún metadato (EXIF, XMP, GPS), y SHALL subirla como `insta/<sha256>.jpg`. Antes de subir nada SHALL calcular el total de las copias y MUST abortar sin subir ninguna si supera 500 MB. Volver a ejecutarla MUST NOT duplicar ni volver a subir objetos que ya existen. La clave de servicio SHALL leerse de una variable de entorno y MUST NOT aparecer en la salida ni en logs.

#### Scenario: Sin metadatos
- **WHEN** se sube una imagen con EXIF y GPS
- **THEN** la copia descargada con la clave de servicio no tiene EXIF, XMP ni GPS, y su lado mayor es ≤ 1080 px

#### Scenario: Tope superado
- **WHEN** el total calculado de las copias es 501 MB
- **THEN** la subida termina con error antes de enviar el primer objeto

#### Scenario: Reejecución
- **WHEN** se ejecuta la subida dos veces seguidas
- **THEN** la segunda no sube ningún objeto y el número de objetos del bucket no cambia
