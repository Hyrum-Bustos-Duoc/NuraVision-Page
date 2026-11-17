# Preparación de datos y modelo para el análisis de uñas

Fecha: 2026-11-10. Módulo: `services/vision`.

Este documento deja por escrito qué se revisó, qué se midió y qué se preparó
para el análisis de uñas con MediaPipe y redes neuronales, y cómo repetirlo.
Todo lo que figura como resultado se obtuvo ejecutando los scripts de
`services/vision/preparacion/`. Lo que no se hizo está marcado como tal.

> Observación estética orientativa. No es un diagnóstico médico.

## 1. Estado en una línea

Hay datos para **detectar la mano** y para **segmentar la uña**, pero no hay
ninguna foto etiquetada con las clases del producto (`forma`, `estado`) y
**no se ha entrenado ningún modelo**. Los zips recibidos no traen pesos
entrenados: son solo imágenes y anotaciones.

## 2. Qué se recibió

`datasets.zip` (470 MB) contiene cinco zips. Ninguno trae README de origen ni
licencia, salvo el de Roboflow. Se identifican por el nombre del archivo.

| Zip | Contenido | Tarea | Útil para el producto |
|---|---|---|---|
| `archive (1).zip` | `NailSegmentationDatasetV2`: 7.012 fotos de 640 px con su máscara PNG | Segmentar la uña | **Sí**, es el más valioso |
| `archive.zip` | 52 fotos de dedos en primer plano con máscara (la carpeta viene repetida dos veces) | Segmentar la uña | Poco: son muy pocas |
| `Nails.v1i.tensorflow.zip` | 2.374 fotos de 640 px con cajas, clases `anemic_nail`, `anemic_toung`, `non_anemic_tounge` | Detectar anemia | No |
| `archive (2).zip` | 3.835 fotos de 416 px en 6 carpetas clínicas (melanoma acral lentiginoso, acropaquia, onicogrifosis, pitting, dedo azul, uña sana) | Clasificar condiciones clínicas | No |
| `data.zip` | 250 fotos de dedos de lado con nivel de hemoglobina (`metadata.csv`) | Estimar hemoglobina | No |

Por qué los tres últimos no sirven para `forma` ni `estado`: sus clases son
condiciones clínicas, no cuidado cosmético, y el proyecto las excluye a
propósito (`config.toml`, guarda de términos clínicos). Además, `data.zip`
asocia cada foto con un dato de salud de una persona, así que es sensible.

## 3. Problemas encontrados en los datos

Revisados con scripts, no a ojo:

- **`NailSegmentationDatasetV2`**
  - El CSV llama `valid` a la partición que en disco se llama `val`. Un
    script que siga el CSV al pie de la letra pierde la validación completa.
  - El CSV tiene 7.025 filas pero hay 7.012 fotos: 13 rutas aparecen dos veces.
  - 168 máscaras están vacías (la uña no está marcada).
  - 155 fotos son idénticas a otra (mismo sha256), y **49 de esos grupos
    cruzan particiones**. Es decir, parte del test ya se vio al entrenar.
  - Las fotos parecen tener aumentos (giros con bordes negros), así que
    quedan casi-duplicados que el sha256 no detecta.
- **`archive (2).zip`**: las fotos son exportaciones de Roboflow con varias
  versiones aumentadas (ruido, giros) de cada original. Hay entre 164 y 257
  originales por clase en train. La validación comparte originales con train
  (por ejemplo, las 6 de `blue_finger` también están en train), así que esa
  validación no mide generalización.
- **`Nails.v1i.tensorflow.zip`**: solo 322 fotos originales en train, cada una
  con unas 7 versiones. Muchas anotaciones de `anemic_nail` son la imagen
  completa (`0,0,640,640`) y no la uña.

## 4. ¿Funciona MediaPipe con estas fotos?

Parcialmente. Se midió cuántas fotos de cada grupo tienen una mano detectada
con `hand_landmarker` (modelo float16 oficial, confianza mínima 0,3).
Muestra al azar de 60 fotos por grupo, semilla 1, una sola corrida:

| Grupo | Con mano detectada |
|---|---|
| `NailSegmentationDatasetV2` (manos completas) | 28/60 (46 %) |
| `archive.zip` (primer plano de dedos) | 29/52 (55 %) |
| `data.zip` (dedos de lado) | 1/60 (1 %) |
| `archive (2).zip` (clínico) | 0/60 (0 %) |
| `Nails.v1i.tensorflow.zip` | 3/60 (5 %) |

Cómo leerlo:

- MediaPipe detecta **manos**, no uñas. Sirve cuando la foto muestra la mano
  abierta o buena parte de ella. Con solo la punta del dedo o con fotos
  clínicas muy ampliadas no detecta casi nada.
- El 46 % del dataset de segmentación no mide cómo se comportará con fotos de
  clientas: ese dataset tiene giros, bordes negros y recortes que una foto
  tomada con el celular no tiene. **No se probó con fotos reales de clientas**
  y es lo primero que conviene medir.
- Consecuencia de diseño: el sistema tiene que tener un camino explícito para
  "no se detectó una mano". Debe devolver `no_concluyente` y pedir otra foto,
  no inventar un resultado.

## 5. Preparación del dataset de segmentación

Script: `preparacion/preparar_segmentacion.py`. Solo usa la librería estándar
salvo la verificación opcional, que usa OpenCV.

Reglas aplicadas, en este orden:

1. Se corrige `valid` → `val` y se descartan las filas repetidas del CSV.
2. Se descartan las máscaras vacías.
3. Se agrupan las fotos por sha256. De cada grupo se conserva **una** copia,
   en la partición más protegida (test, luego val, luego train), para que nada
   de lo que se evalúa haya estado en el entrenamiento.
4. Se escribe un manifiesto JSON (sin imágenes): ruta, máscara, sha256 y
   partición.

Resultado sobre las 7.025 filas del CSV:

| Partición | Pares conservados |
|---|---|
| train | 5.333 |
| val | 669 |
| test | 687 |
| **Total** | **6.689** |

Descartes: 168 máscaras vacías, 13 filas repetidas del CSV, 155 duplicados.
Después de limpiar, ningún sha256 aparece en dos particiones. La
verificación con 300 pares al azar (decodificar, redimensionar, binarizar) no
encontró problemas.

### Normalización prevista

| | Imagen | Máscara |
|---|---|---|
| Tamaño | 256 × 256 | 256 × 256 |
| Interpolación | bilineal | vecino más cercano (no inventa grises) |
| Valores | RGB 0–255 | binaria: 255 → 1, el resto → 0 (umbral 127) |

El clasificador de `forma` y `estado` usa 224 px (`config.toml`) porque así
vienen los pesos de ImageNet. Son dos modelos distintos con dos tamaños
distintos, no es una inconsistencia.

### Lo que esta limpieza no resuelve

- Los casi-duplicados (la misma foto girada o con ruido) siguen repartidos
  entre particiones, así que las métricas de test saldrán algo optimistas.
  Habría que usar un hash perceptual o agrupar por foto original, y el
  dataset no trae ese dato.
- No se conoce el origen ni la licencia de estos zips. Las fotos no deben
  subirse al repositorio ni redistribuirse hasta aclararlo.

## 6. Entrenamiento

**Se entrenó un solo modelo, el segmentador de uñas, y es pequeño a propósito.**
Lo que existe y lo que falta:

| Pieza | Estado |
|---|---|
| Clasificador de `forma` y `estado` (`entrenamiento/`, MobileNetV3Small y EfficientNetB0) | Código listo y con tests. Falta el dataset con las clases del producto. |
| Segmentador de uñas | Entrenado el 2026-11-10 (ver abajo). Es un bosque aleatorio de píxeles de OpenCV, no una red neuronal. Una U-Net con estos mismos recortes debería segmentar mejor, pero requiere GPU y no cabía en el plazo de la demo. |
| Detección de mano | No requiere entrenar: es MediaPipe tal cual. |
| Etiquetas de `forma` | Calculadas desde las máscaras con una regla geométrica. Solo `cuadrada`, `redonda` y `ovalada` son fiables. Ver [etiquetas-forma.md](etiquetas-forma.md). |

### Segmentador de uñas (el modelo que sí se entrenó)

Para decirle al cliente la forma de su uña hay que saber dónde está la uña
dentro del recorte. El servicio hace lo siguiente con cada dedo estirado:

1. MediaPipe da los 21 puntos de la mano y se recorta la punta del dedo, girada
   para que el dedo mire arriba (`app/vision/unas.py`).
2. El segmentador clasifica cada píxel del recorte (96×96) como "uña" o
   "no uña". Usa 19 rasgos por píxel: color en Lab, color suavizado, diferencia
   con el color típico del recorte, bordes, textura y posición. La posición pesa
   mucho porque el recorte siempre queda alineado con el dedo.
3. Se limpia el mapa de probabilidad y se queda con una sola uña. Si no cumple
   (área entre 2 % y 50 % del recorte, sin tocar el borde, contorno razonablemente
   convexo) se descarta y esa uña sale con `forma = null`, sin inventar nada.
4. Sobre la máscara se mide el aspecto (largo/ancho) y la punta (ancho del
   extremo / ancho máximo), y una regla da la forma (`app/vision/forma.py`).

**Datos de entrenamiento.** `recortes_segmentacion.py` repite el paso 1 sobre el
dataset NailSegmentationDatasetV2 usando la *misma* función de recorte del
servicio, y recorta la máscara con la misma matriz, para que el modelo vea en el
entrenamiento lo mismo que verá en producción. De 3000 fotos de train, 500 de
val y 600 de test salieron 3649, 400 y 443 recortes válidos (los demás se
descartan: sin mano, dedo doblado, uña cortada por el borde, dedo vecino dentro
del recorte).

**Entrenamiento.** `entrenar_segmentador.py` toma 200 píxeles por recorte (mitad
dentro de la uña y mitad fuera): 729 800 píxeles × 19 rasgos. 40 árboles,
profundidad 14. Tarda unos 160 s en un portátil y el XML pesa 75 MB.

**Resultado medido** (IoU entre la máscara predicha y la del dataset, sobre
recortes que el modelo no vio):

| Partición | Recortes | IoU medio | IoU mediana | Rechazados por calidad |
|---|---|---|---|---|
| val | 400 | 0,519 | 0,529 | 1 |
| test | 443 | 0,535 | 0,550 | 0 |

Un IoU de 0,53 es mediocre. Alcanza para estimar si la uña es corta y ancha o
larga y angosta, pero no para trazar el borde con precisión. Hay que leerlo así
y no como "el modelo segmenta bien".

**Límites que conviene tener claros:**

- La forma sale de una regla con umbrales fijados a ojo, sobre una máscara
  aproximada. No es el juicio de una manicurista.
- Solo `cuadrada`, `redonda` y `ovalada` se marcan como fiables. `almendra` y
  `stiletto` se confunden con uñas vistas de lado (ver
  [etiquetas-forma.md](etiquetas-forma.md)).
- En las pruebas con fotos del dataset el resultado se inclina mucho hacia
  `redonda`. Es esperable: son uñas naturales, cortas y de baja resolución. No
  se ha validado con fotos de clientas ni con uñas esculpidas.
- El modelo se entrenó con fotos de baja resolución; con fotos de celular los
  rasgos de textura cambian y el IoU puede bajar.

Para la tarea `estado`, la clase `quebradiza_o_descamada` puede tener causas
médicas: el resultado debe acompañarse de la recomendación de consultar a un
profesional, como ya define `config.toml`.

## 7. Qué falta para tenerlo completo

1. **Fotos etiquetadas con las clases del producto.** Es lo único que no se
   puede conseguir con los zips actuales. Mínimo 100 por clase, ideal 150 a 200
   (ver `../README.md`), con variedad de luz, fondos y tonos de piel.
2. Probar MediaPipe con 30 a 50 fotos reales tomadas con celular.
3. Decidir la fuente de las fotos de uñas con esmalte y diseño para el
   recomendador de diseños (hoy no hay ninguna).
4. Aclarar licencia y origen de los zips recibidos.
5. ~~Endpoint de inferencia y pantalla de subida~~: hechos (`services/api` y
   `/analisis-ia`). Falta que el análisis diga el *estado* de la uña, que sigue
   sin modelo.
6. Reglas de recomendación (servicio y diseño) en Supabase, con su contrato
   de datos definido primero (ver `CLAUDE.md`, sección OpenSpec).

## 8. Cómo repetirlo

```bash
# Entorno aparte, no el del API
python3.14 -m venv .venv-prep && source .venv-prep/bin/activate
pip install mediapipe opencv-python-headless numpy
curl -LO https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

# Descomprimir cada zip en una carpeta nueva (nunca dentro del repo)
unzip datasets.zip -d ~/datos-unas && cd ~/datos-unas/datasets
unzip "archive (1).zip" -d seg_v2

# 1. Preparar el dataset de segmentación
python -I services/vision/preparacion/preparar_segmentacion.py \
    ~/datos-unas/datasets/seg_v2/NailSegmentationDatasetV2 \
    particion_seg.json --verificar 300

# 2. Medir MediaPipe
python -I services/vision/preparacion/probar_mediapipe.py hand_landmarker.task \
    "seg_V2=~/datos-unas/datasets/seg_v2/NailSegmentationDatasetV2/train/images/*.jpg"

# 3. Recortes de uña + máscara (entorno de preparación; importa app.vision.unas
#    del servicio, así que también necesita `pip install pydantic`)
python -I services/vision/preparacion/recortes_segmentacion.py \
    ~/datos-unas/datasets/seg_v2/NailSegmentationDatasetV2 \
    particion_seg.json hand_landmarker.task recortes.npz

# 4. Entrenar el segmentador y medir el IoU (val y test), con el venv del API
services/api/.venv/bin/python -I -u services/vision/preparacion/entrenar_segmentador.py \
    recortes.npz segmentador_unas.xml --por-recorte 200

# 5. Instalarlo (el XML pesa 75 MB y está en .gitignore: no se sube al repo)
cp segmentador_unas.xml services/api/models/
```

Sin el XML el servicio sigue detectando uñas, pero con `forma = null`. `/salud`
informa `segmentador_cargado`.

Los números de las secciones 4 y 5 deben coincidir con los de arriba. Si
cambian, cambió el dataset o la versión de MediaPipe.

## 9. Precauciones

- `datasets.zip` está en la raíz del repositorio **sin ignorar**: un
  `git add .` lo subiría (470 MB de fotos de manos). Hay que moverlo fuera del
  repo o añadirlo a `.gitignore` antes de cualquier commit.
- Las fotos de manos son dato biométrico y se guardan solo en el Drive del
  proyecto (`../README.md`, sección 1).
- `archive (2).zip` incluye melanoma. No debe usarse para ninguna clase del
  producto, ni siquiera de forma indirecta.
