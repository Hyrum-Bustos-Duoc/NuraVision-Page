# Ficha: arthitaya/nail-dataset (Kaggle)

> **Uso temporal.** Decision del responsable del proyecto del 2026-10-29 para
> las tareas de la Gantt «Recoleccion y etiquetado del dataset» (Sprint 2,
> solo documentacion) y «Separacion del dataset y modelo base» (Sprint 3, la
> separacion). Este dataset **no entrena `forma` ni `estado`**: sus clases son
> condiciones clinicas de la una. **Desde el 2026-11-12 entrena
> `estado_clinico`** (decision del dueno, `openspec/changes/reporte-clinico-unas`),
> solo con las carpetas renombradas y la particion por series de la seccion 10.
> La licencia sigue sin aclarar (seccion 1).

## 1. Origen

| Campo | Valor |
|---|---|
| URL | https://www.kaggle.com/datasets/arthitaya/nail-dataset |
| Autor en Kaggle | `arthitaya` |
| Version | 2, publicada el 2021-11-30 |
| Fecha de descarga | 2026-10-29 |
| Archivo | `archive.zip`, 4.223.639 bytes, 540 archivos |
| sha256 del zip | `294e0f82408cd31f1af88ed6b6633c81f950253be78bc5809474f3f0064a0424` |
| Licencia | **"Unknown"** segun Kaggle. No hay permiso explicito de uso ni de redistribucion |
| Procedencia de las fotos | No declarada. Por lo observado (seccion 4), son recortes de imagenes de la web y de material clinico, no fotos tomadas para este dataset |

Por la licencia, las imagenes **no se suben al repositorio** ni se
redistribuyen. Si se versiona `particion.json`: contiene solo nombres de
archivo publicos, clase, sha256, lado menor y particion. No incluye pixeles
ni datos de personas que no esten ya en el nombre de archivo de Kaggle, que es
generico (`normal (12).jpg`).

## 2. Clases y conteos

9 carpetas de 60 fotos cada una, 540 en total. Todas son JPEG validos (hay
una con extension `.JPG`, que se acepta porque el formato se detecta por el
contenido). No hay duplicados exactos por sha256.

| Carpeta | Que es (descripcion, no diagnostico) | Fotos |
|---|---|---|
| `beau_s line` | Surco transversal en la lamina (linea de Beau) | 60 |
| `black line` | Banda longitudinal oscura | 60 |
| `clubbing` | Una abombada, punta del dedo ensanchada (acropaquia) | 60 |
| `mees_ line` | Banda transversal blanca (linea de Mees) | 60 |
| `normal` | Una sin alteracion visible | 60 |
| `onycholysis` | Despegamiento de la lamina (onicolisis) | 60 |
| `other` | Mezcla: hongos, psoriasis, distrofias, hematomas, **y tambien unas con esmalte o nail art** | 60 |
| `terry_s nail` | Lamina blanquecina con banda distal oscura (una de Terry) | 60 |
| `white spot` | Manchas blancas puntuales (leuconiquia) | 60 |

## 3. Resolucion

Lado menor en pixeles, medido sobre los 540 archivos:

| | min | p25 | mediana | p75 | max |
|---|---|---|---|---|---|
| Todo el dataset | 22 | 57 | 82 | 137 | 1201 |

Fotos que alcanzan cada minimo: 350 con >= 64, 150 con >= 128, 106 con >= 160
y **solo 48 con >= 224**, que es el minimo del producto (`config.toml`).

| Carpeta | min | mediana | max | >= 224 |
|---|---|---|---|---|
| `beau_s line` | 37 | 115 | 439 | 9 |
| `black line` | 38 | 95 | 717 | 2 |
| `clubbing` | 33 | 62.5 | 373 | 3 |
| `mees_ line` | 27 | 50.5 | 169 | **0** |
| `normal` | 50 | 122 | 334 | 10 |
| `onycholysis` | 50 | 101.5 | 491 | 7 |
| `other` | 22 | 83.5 | 1201 | 7 |
| `terry_s nail` | 32 | 70 | 427 | 6 |
| `white spot` | 37 | 76.5 | 252 | 4 |

La resolucion depende de la clase (mediana 50 en `mees_ line` frente a 122 en
`normal`). Un modelo entrenado aqui puede aprender "foto borrosa y chica"
como senal de la clase en lugar de la una. Es un atajo, no un acierto.

## 4. Calidad observada

Revision visual de las 540 fotos en hojas de contacto, el 2026-10-29.

- **Son recortes de una sola una**, casi siempre centrada y de cerca. No hay
  manos completas, ni fondos, ni varias unas por foto. El producto recibira
  fotos de manos tomadas con un movil: la distribucion es otra.
- **Origen web y clinico**: se ven marcas de agua de bancos de imagenes,
  flechas y anotaciones de libros de texto (`mees_ line`, `terry_s nail`) y
  fondos de tela quirurgica.
- **Casi-duplicados frecuentes**: la misma foto aparece varias veces
  recortada, desplazada o con otro encuadre (series visibles en `clubbing`,
  `normal`, `black line`, `terry_s nail`, `mees_ line`). La deduplicacion del
  pipeline solo detecta copias identicas byte a byte, asi que estas series
  **no se detectan**. Una comparacion con hash perceptual (dHash de 64 bits,
  distancia <= 4) encontro 31 pares candidatos, 14 de ellos entre train y
  val/test. Al revisarlos, algunos son la misma una (p. ej. una serie de
  `clubbing` repartida entre train y val) y otros son falsos positivos. Es
  decir, el hash no sirve para agrupar de forma automatica, pero hay fuga real.
- **Etiquetas mezcladas en `other`**: contiene patologias diversas junto a
  unas con esmalte negro, glitter y nail art. No es una clase coherente.
- **Muchas fotos con poca nitidez** por ampliacion de miniaturas, sobre todo
  en `clubbing`, `mees_ line` y `terry_s nail`.

## 5. Sesgos visibles

- **Tono de piel**: predominan claramente las pieles claras y rosadas. Hay
  pocas fotos de tonos medios u oscuros, concentradas en algunas clases (p. ej.
  `black line`, `terry_s nail`, `mees_ line`). Es una estimacion visual: no se
  anotaron tonos (escala Monk) foto por foto. Esto confunde tono de piel con
  clase: un modelo podria asociar piel oscura a ciertas condiciones.
- **Una sola fuente de estilo por clase**: cada clase parece venir de un
  conjunto distinto de paginas web, con su propia iluminacion y encuadre.
  Esto facilita atajos (color de fondo, marca de agua, tamano).
- **Sin esmalte, salvo en `other`**: el producto atiende un salon de unas,
  donde el esmalte es lo habitual.
- **Sin metadatos** de persona, dispositivo ni consentimiento. Dos fotos de la
  misma persona pueden quedar en particiones distintas sin que se pueda detectar.

## 6. Por que no sirve tal cual para el producto

1. **Las clases son clinicas.** `forma` y `estado` son observacion estetica,
   no diagnostico (ver `../../README.md`, seccion 5), y `config.py` rechaza
   estas clases en esas tareas, tambien con su nombre en ingles. Desde el
   2026-11-12 entrenan, renombradas, la tarea aparte `estado_clinico`, con
   lista cerrada y abstencion (seccion 10). El riesgo de fondo no cambio: el
   dataset no sostiene un dispositivo medico.
2. **No cubre ninguna clase del producto**: `forma` (almendra, cuadrada,
   ovalada, redonda, stiletto) no aparece, y `estado` (cuidada,
   cuticula_descuidada, quebradiza_o_descamada, esmalte_deteriorado) tampoco.
3. **La resolucion no alcanza**: 48 fotos de 540 llegan a 224 px.
4. **La distribucion no coincide**: son recortes clinicos de la web, y el
   producto recibira fotos de manos con movil.
5. **La licencia no esta aclarada**: no permite un uso comercial seguro.

### Que podria aprovecharse (propuestas, sin implementar)

- `normal` (60 fotos) como ejemplos de «una sin alteracion visible», para
  revisar a mano y quizas etiquetar como `cuidada` o con su `forma`. Antes
  hay que aclarar la licencia, y solo 10 de esas fotos alcanzan 224 px.
- Ejemplos negativos para un detector de "esto es una una / esto no es apto",
  en el pipeline de inferencia. Es decir, usar las clases clinicas para
  aprender a responder `no_concluyente` y recomendar revision profesional,
  nunca para nombrar la condicion.
- Banco de pruebas de robustez: una foto clinica no deberia recibir una
  respuesta confiada del modelo estetico.

Cada propuesta requiere una decision del responsable antes de implementarse.

## 7. Particion (Sprint 3)

Parametros en `particion.toml`: semilla `20261029`, 70/15/15 estratificado
por clase, con el mismo algoritmo que el producto (`datos.dividir`) y
verificada con `datos.verificar` (ninguna foto, por ruta ni por sha256, esta
en dos particiones; huella intacta).

**Decision de resolucion**: se particionan las 540 fotos sin filtrar
(`lado_minimo = 1`), y cada entrada guarda su `lado_menor`. Cualquier filtro
posterior (224 del producto u otro) es un subconjunto de esta particion, asi
que una foto de test nunca pasa a train al cambiar el minimo. Particionar
directamente con 224 es imposible: `mees_ line` no tiene ninguna foto que
llegue y `black line` tiene 2, y `dividir` exige 3 por clase.

Huella: `145ccd4e79e9…` (completa en `particion.json`).

| Particion | Por clase | Total | Con lado menor >= 224 |
|---|---|---|---|
| train | 42 | 378 | 37 |
| val | 9 | 81 | 7 |
| test | 9 | 81 | 4 |

Fotos con lado menor >= 224 por clase (train / val / test):

| Carpeta | train | val | test |
|---|---|---|---|
| `beau_s line` | 6 | 2 | 1 |
| `black line` | 1 | 0 | 1 |
| `clubbing` | 1 | 1 | 1 |
| `mees_ line` | 0 | 0 | 0 |
| `normal` | 8 | 2 | 0 |
| `onycholysis` | 6 | 0 | 1 |
| `other` | 6 | 1 | 0 |
| `terry_s nail` | 6 | 0 | 0 |
| `white spot` | 3 | 1 | 0 |

Con el minimo de 224, val y test quedan casi vacios: **no hay evaluacion
posible** en esa resolucion. Con 9 fotos por clase en test, cada foto mueve
el recall de su clase 11 puntos, y los casi-duplicados de la seccion 4 inflan
cualquier metrica. Esta particion cumple la tarea de separacion, pero sus
numeros no sirven como evidencia de calidad de un modelo.

## 8. Reproducir

Descarga (requiere cuenta de Kaggle y aceptar sus terminos):

```bash
# Con la CLI de Kaggle, o desde la web con "Download".
kaggle datasets download -d arthitaya/nail-dataset   # la CLI lo llama nail-dataset.zip; la web, archive.zip
shasum -a 256 archive.zip    # esperado: 294e0f82...0064a0424 (ver seccion 1)
unzip archive.zip -d kaggle-nail                      # crea kaggle-nail/Nail/<clase>/
```

Kaggle puede volver a generar el zip y cambiar su sha256 sin cambiar las
fotos. En ese caso la comprobacion valida es la de cada foto: la particion
regenerada debe tener la misma `huella`.

Particion, desde `services/vision/` (no necesita TensorFlow):

```bash
python -m entrenamiento.externo \
  --ficha datasets/kaggle_nail/particion.toml \
  --dataset /ruta/a/kaggle-nail/Nail \
  --salida datasets/kaggle_nail
git diff --stat datasets/kaggle_nail/particion.json   # sin cambios = reproducida
```

El 2026-10-29 se ejecuto dos veces y se obtuvieron dos `particion.json`
identicos byte a byte (sha256 `8eca1e74…`).

## 9. Privacidad y retencion

| Que | Donde | Retencion |
|---|---|---|
| Imagenes (zip y descomprimido) | Solo en la maquina o el Drive de quien las use. Nunca en el repo | Hasta que se reemplace por un dataset propio. Propuesta: borrar al cierre del semestre (2026-12-18), **pendiente de confirmar** |
| `particion.json`, esta ficha | Repositorio | Mientras el dataset siga en uso. Al retirarlo se borra la carpeta y se actualiza el indice |

Aunque sean publicas, son fotos de dedos de personas reales. Se aplican las
mismas reglas que a las fotos propias: nunca en logs, ni en el notebook, ni en
mensajes de error.

## 10. Uso en `estado_clinico` (desde el 2026-11-12)

`datasets/Nail.zip` (en la raiz del repositorio, **sin ignorar en git**) es
este dataset: su sha256 coincide byte a byte con el de la seccion 1
(comprobado el 2026-11-12, `openspec/changes/reporte-clinico-unas/proposal.md`).

Antes de entrenar, el equipo renombra las carpetas a los ids de la tarea
(tarea U.2). `dividir` falla con los nombres originales:

| Carpeta en el zip | id de `estado_clinico` | Sale del servicio |
|---|---|---|
| `beau_s line` | `linea_beau` | si |
| `black line` | `linea_oscura` | si |
| `clubbing` | `acropaquia` | si |
| `mees_ line` | `linea_mees` | si |
| `normal` | `sin_senales` | si |
| `onycholysis` | `onicolisis` | si |
| `terry_s nail` | `una_terry` | si |
| `white spot` | `mancha_blanca` | si |
| `other` | `otra` | **no**: el servicio responde no concluyente |

- **Solo con la particion por series.** `python -m entrenamiento dividir
  --tarea estado_clinico ... --series CSV` exige un archivo `archivo,serie`
  que agrupe los casi-duplicados de la seccion 4 (lo escribe el equipo, tarea
  U.3, con la ayuda de `entrenamiento/casi_duplicados.py`). Sin el, no
  particiona.
- **El `particion.json` de la seccion 7 no se usa para entrenar.** Es
  aleatorio por foto y tiene fuga real entre series (seccion 4). Queda como
  registro de la separacion del Sprint 3.
- **Lado minimo de 64 px** para esta tarea (Q2, pendiente de confirmar):
  quedan unas 350 fotos, `mees_ line` con 18 (seccion 3), antes de quitar
  casi-duplicados.
- Con esos numeros, las metricas sirven para impedir habilitar un modelo malo,
  no para demostrar que uno es bueno (M1-M4 en `design.md`).

## 11. Entrenamiento de `estado_clinico` (2026-11-17)

> Senal orientativa para consultar con un profesional. **No es un diagnostico
> medico** ni un dispositivo medico validado. Las metricas de abajo se midieron
> sobre recortes web de una sola una; no dicen como se comporta con fotos de
> celular (eso lo mide el arnes, tarea U.6). La licencia sigue «Unknown» (U.1):
> el modelo no se habilita para clientas (U.9).

### Datos

| Zip | Decision | Motivo |
|---|---|---|
| `Nail.zip` (este dataset) | **Usado**, solo fotos con lado menor >= 64 (`config.toml`, Q2 a): 350 de 540 | Unico con clases que mapean a la lista cerrada (seccion 10) |
| `FingerHealth.zip` (= `archive (2).zip`) | Descartado | Incluye melanoma (no se usa ni como `otra`). Sumar sus clases compatibles **empeoro** el F1 macro OOF sobre Kaggle de 0,541 a 0,451 (regresion logistica sobre embeddings EfficientNetB0, CV 5 pliegues por serie): el modelo aprende la fuente (aumentos de Roboflow), no la una |
| `NailSegmentationDatasetV2.zip`, `archive.zip` | Descartados | Mascaras de segmentacion, sin etiqueta de senal |
| `Nails.v1i.tensorflow.zip` | Descartado | Anemia, cajas de deteccion |
| `data.zip` | Descartado | Hemoglobina por paciente: dato de salud, sin etiqueta de senal |

Tambien se midio sumar las 190 fotos de < 64 px solo a train: F1 OOF 0,551 ->
0,518. No se usan.

### Limpieza, series y particion

1. `entrenamiento/preparar_clinico.py` renombra las carpetas (tabla de la
   seccion 10) y escribe el archivo de series. Ningun sha256 repetido.
2. **Series por similitud de embeddings** (EfficientNetB0 ImageNet, coseno >=
   0,80 dentro de la clase, transitivo), solo entre las fotos validas. dHash
   (seccion 4) no sirve aqui: con <= 4 dio 595 pares, 447 entre clases
   distintas. Resultado: 350 fotos en 223 series; la mayor, 15 fotos de
   `sin_senales` (varias subseries de fotos de stock encadenadas: agrupa de
   mas, que es el lado seguro).
3. `python -m entrenamiento dividir` (sin cambios) con semilla 20261027:
   huella `b91057db6870`. Por la serie de 15, test de `sin_senales` queda con
   19 fotos y train con 22.

| Clase | train | val | test |
|---|---|---|---|
| linea_beau | 33 | 7 | 9 |
| linea_oscura | 33 | 7 | 7 |
| acropaquia | 21 | 4 | 4 |
| linea_mees | 12 | 3 | 3 |
| onicolisis | 33 | 9 | 8 |
| una_terry | 22 | 6 | 7 |
| mancha_blanca | 22 | 5 | 7 |
| sin_senales | 22 | 8 | 19 |
| otra | 26 | 6 | 7 |

### Busqueda de hiperparametros

`python -m entrenamiento.busqueda_clinica buscar`: CV de 5 pliegues
estratificada y agrupada por serie sobre train+val (279 fotos); metricas sobre
las predicciones fuera de pliegue (OOF). La epoca se elige con la curva media de
log loss OOF. Base congelada con embeddings cacheados; 44 corridas, tabla
completa en `busqueda.md` de la salida. Resumen:

| Etapa | Que se vario | Mejor F1 macro OOF | Rango |
|---|---|---|---|
| 1 | 5 arquitecturas x {0, 8} vistas aumentadas | MobileNetV3Small, 0 vistas: 0,632 | 0,577 (MobileNetV3Large, 0) - 0,632 |
| 2 | LR {1e-3, 3e-4} x dropout {0,2, 0,5} x suavizado {0, 0,1} x pesos de clase, sobre MobileNetV3Small con 0 y 8 vistas | dropout 0,5, suavizado 0,1, pesos, LR 1e-3, 0 vistas, 38 epocas: **0,665** | 0,607 - 0,665 |
| 3 | Fine-tuning: ultimas {20, 40} capas x LR {1e-5, 1e-4}, hasta 15 epocas | 0,665 (20 capas, 1e-5, 1 epoca) | 0,641 - 0,665 |

Ganadora: **MobileNetV3Small, cabeza Dropout 0,5 + Dense, base congelada, sin
aumento, Adam 1e-3, suavizado 0,1, pesos de clase, 38 epocas**. El fine-tuning
no se usa: gano por 0,0002, dentro del ruido (`margen_fine_tuning`). Las
diferencias entre arquitecturas (<= 0,055) tambien son del orden del error
estandar del F1 con 279 fotos (~0,03): la eleccion es razonable, no un hecho.

### Calibracion y umbrales (en OOF, nunca en test)

- Temperatura t = 0,745 (el modelo estaba **subconfiado**, efecto del
  suavizado y el dropout). ECE OOF 0,121 -> 0,046; en test 0,163 -> 0,130.
  La temperatura va dentro de los pesos de la Dense (W/t, b/t): el `.tflite`
  sigue siendo base + Dense softmax.
- `umbral_no_concluyente` = 0,687 (precision OOF de las aceptadas 0,905,
  cobertura OOF 0,45). `umbral_sin_senales` = 0,687: en OOF ningun falso
  `sin_senales` supero el umbral general.

### Resultados en test (71 fotos, una sola lectura)

Modelo entregado: `.tflite` **float16**, mismas predicciones que Keras en test
(F1 identico; max|dif| de probabilidad 0,022).

| Metrica | Valor |
|---|---|
| Accuracy | 0,718 (IC 95 % Wilson 0,605-0,810) |
| Precision macro | 0,761 |
| Recall macro | 0,675 |
| F1 macro | 0,678 |
| F1 macro OOF (referencia) | 0,665 |

| Clase | n | Precision | Recall | F1 |
|---|---|---|---|---|
| linea_beau | 9 | 0,60 | 0,67 | 0,63 |
| linea_oscura | 7 | 0,70 | 1,00 | 0,82 |
| acropaquia | 4 | 0,67 | 0,50 | 0,57 |
| linea_mees | 3 | 1,00 | 0,33 | 0,50 |
| onicolisis | 8 | 1,00 | 0,50 | 0,67 |
| una_terry | 7 | 0,75 | 0,86 | 0,80 |
| mancha_blanca | 7 | 0,50 | 0,86 | 0,63 |
| sin_senales | 19 | 0,83 | 0,79 | 0,81 |
| otra | 7 | 0,80 | 0,57 | 0,67 |

Matriz de confusion (filas = real, columnas = predicha, en el orden de la
tabla): `[[6,1,0,0,0,1,0,1,0], [0,7,0,0,0,0,0,0,0], [1,0,2,0,0,0,0,1,0],
[1,0,0,1,0,1,0,0,0], [1,1,0,0,4,0,0,1,1], [0,1,0,0,0,6,0,0,0],
[1,0,0,0,0,0,6,0,0], [0,0,1,0,0,0,3,15,0], [0,0,0,0,0,0,3,0,4]]`. Sin
abstencion, 3 fotos con senal (una de ellas `acropaquia`) salen como
`sin_senales`.

**Incidente de cuantizacion (declarado).** La seleccion automatica eligio
primero `int8` dinamica: paso el criterio de entonces sobre train+val (F1 -0,004,
argmax igual en 99,6 %) pero movia probabilidades hasta 0,685, y en test su F1
cayo a 0,599. Se corrigio el criterio (`max_dif_probabilidad = 0.05`, con test
en `tests/test_busqueda_clinica.py`) y se entrega float16, que es el mismo
modelo validado. Sus metricas de clasificacion salen de la misma y unica
lectura de test, pero **las de abstencion (M1-M4, cobertura) se calcularon
sobre las probabilidades int8** y estan pendientes para float16: con int8
dieron M1 = 0, M2 = 0, M3 = 1,00 (29 aceptadas), M4 = 0,35. Medirlas para
float16 exige leer test otra vez con el mismo modelo; decide el usuario.
Ademas, dos pruebas de humo del pipeline (un modelo de 3 epocas, F1 0,27)
evaluaron en test antes de la corrida real; ninguna decision salio de ellas.

### Tamano y latencia (CPU Apple M1)

| Variante | MB | Latencia mediana (1 una) | max\|dif\| vs Keras (train+val) |
|---|---|---|---|
| int8 dinamica | 1,15 | 1,71 ms | 0,685 (rechazada) |
| **float16** | **1,97** | 2,07 ms | 0,012 |
| float32 | 3,79 | 2,07 ms | 9e-6 |

944.313 parametros. Con `clinico.cargar` del servicio: carga, 9 probabilidades
que suman 1 y p50 2,06 ms / p95 2,22 ms por una
(`tests/test_modelo_clinico.py`, venv del API).

### Reproducir

```bash
# Python 3.14: venv en services/vision/.venv (ignorado), ver requirements.txt
python -I services/vision/entrenamiento/preparar_clinico.py --kaggle FUERA/Nail/Nail --salida FUERA/prep
cd services/vision
.venv/bin/python -m entrenamiento.busqueda_clinica buscar --dataset FUERA/prep --series FUERA/prep/series.csv --salida FUERA/art
.venv/bin/python -m entrenamiento.busqueda_clinica final  --dataset FUERA/prep --series FUERA/prep/series.csv --salida FUERA/art
cp FUERA/art/estado_clinico/exportado/{modelo.tflite,etiquetas.json,metadatos.json} ../api/models/estado_clinico/
```

`series.csv` sha256 `5e450084…`. Determinismo comprobado: las dos
ejecuciones de `final` de la prueba de humo dieron metricas identicas, el F1
OOF recalculado en `final` (0,66513) es identico al de la busqueda, y el
float16 reconvertido desde el SavedModel guardado reprodujo el mismo tamano
(1.974.932 bytes) y la misma fidelidad (max|dif| 0,0119). El `.tflite`
(1,97 MB) **no se versiona**: `services/api/.gitignore` excluye
`models/estado_clinico/` y el dataset no tiene licencia aclarada.

### Limites conocidos

- **Pocos datos.** 3 a 19 fotos por clase en test: el recall de
  `linea_mees` (n = 3) o `acropaquia` (n = 4) es una anecdota. **`linea_mees`
  (15 fotos en train+val) y `acropaquia` (25) no son fiables**; se proponen
  como candidatas a quitarse de la lista o a marcarse como no fiables hasta
  tener mas fotos (decision del dueno).
- **Distribucion distinta del producto**: recortes web de una sola una, casi
  sin esmalte, frente a recortes de celular de 224 px.
- **Atajos posibles**: la resolucion y el estilo de la foto dependen de la
  clase (seccion 3). El modelo puede usar "foto chica y borrosa" como senal.
- **Sesgo de tono de piel** (seccion 5): no se pudo medir por subgrupo porque
  no hay anotacion Monk.
- **Fuga residual**: las series de embeddings no detectan dos fotos distintas
  de la misma persona.
- `otra` mezcla patologias con esmalte y nail art (seccion 4).

## 12. Ronda 2: robustez a fotos malas y abstencion (2026-11-17)

> Mismo dataset, misma particion (huella `b91057db6870`), mismas reglas de
> privacidad. Ninguna decision se tomo con test; test se leyo **una vez** al
> final (segunda lectura oficial, ver «Protocolo»). Las degradaciones se
> aplicaron **solo a copias de train+val** dentro de la CV.

### Diagnostico (modelo instalado, OOF de train+val)

- **Fotos fuera del modelo**: 190 de 540 (35 %) tienen lado menor < 64 px. Por
  clase: `linea_mees` 42/60, `acropaquia` 31, `mancha_blanca` 26,
  `una_terry` 25, `otra` 21, el resto 10-13.
- **Abstencion con las reglas del servicio** (279 fotos): `ok` 112 (40 %),
  `clase_otra` 34 (12 %), `confianza_baja` 133 (48 %); 65 de estas ultimas
  eran aciertos del argmax.
- **Riesgo-cobertura** (vista limpia): precision >= 0,80 -> cobertura 0,61;
  0,85 -> 0,51; 0,90 -> 0,40; 0,95 -> 0,17.
- Dentro de las fotos >= 64 px la cobertura no crece con la resolucion
  (0,43 / 0,32 / 0,41 / 0,50 en [64,80), [80,120), [120,224), >= 224).
- **El umbral calibrado solo en fotos limpias no protege las malas**: con el
  0,687 instalado, la precision de las aceptadas baja en 9 de 11 degradaciones
  (0,56 muy oscura, 0,65 poca luz de celular, 0,69 JPEG, 0,71 desenfoque
  fuerte) y aparecen 18 `sin_senales` aceptados sobre fotos con senal (7 de
  senales graves). Es decir: hoy el modelo inventa con fotos malas.

### Degradaciones (`entrenamiento/degradaciones.py`)

11 niveles fijos sobre el recorte de 224 (desenfoque 1,5 y 3; brillo x0,45 y
x0,25; x1,6; ruido 12; JPEG 15; resolucion 64 y 40 px; rotacion 15 con borde
replicado; poca luz de celular combinada). El aumento `degradacion` sortea
esas mismas familias con rangos continuos.

### Comparacion de aumentos (`busqueda_clinica robustez`)

Cabeza ganadora de la seccion 11, CV 5 pliegues por serie, media de 3 sorteos
de vistas; temperatura y umbral calibrados sobre la mezcla limpia + 11
degradadas, sin las de brillo < 40.

| Aumento | F1 OOF limpia | F1 OOF degradadas (media) | Cobertura mezcla | Peor precision por degradacion |
|---|---|---|---|---|
| ninguno (instalado) | 0,665 | 0,520 | 0,150 | 0,750 (poca luz) |
| geometrico | 0,657 (0,648-0,674) | 0,531 | 0,213 | 0,785 (poca luz) |
| **degradacion** | 0,643 (0,614-0,674) | 0,582 | 0,218 | 0,865 (sobreexpuesta) |

Regla (`elegir_aumento`): solo aumentos con precision >= 0,85 en cada
degradacion; entre ellos, mayor cobertura sin perder mas de 0,01 de F1 limpia.
**Esta regla se fijo despues de ver la CV y antes de leer test**: la primera
version (sin la exigencia por degradacion) elegia `geometrico`, que en poca luz
acierta 0,785 de lo que afirma. Tambien se paso de un sorteo a tres porque dos
sorteos del mismo aumento dieron F1 0,680 y 0,635.

Familias excluidas del aumento (exploracion, un sorteo): sin rotacion, F1 en
rotada 0,52 (con ella 0,61); sin brillo, F1 en muy oscura 0,42 (igual que sin
aumento). **La mejora no se transfiere entre familias**: una degradacion real
que no este en la lista no queda cubierta.

Descartado: TTA con volteo (F1 OOF 0,665 -> 0,641, duplica la latencia);
nitidez como compuerta (el ruido y el JPEG la suben; no separo fotos buenas de
malas); conjuntos conformales al 90 % (2,6 clases de media, 23 % de una sola).

### Candidato y segunda lectura de test

Candidato: MobileNetV3Small, misma cabeza, 8 vistas de `degradacion` (sorteo
0), 48 epocas, t = 0,819, umbral 0,823 (= umbral sin_senales), float16
(1,97 MB, max|dif| 0,027 contra Keras, 2,2 ms por una). En CV ese sorteo da F1
limpia 0,640 y peor precision 0,844 (sobreexpuesta), por debajo de la media de
los tres sorteos.

| Test (71 fotos) | Instalado (float16) | Candidato (float16) |
|---|---|---|
| Accuracy (IC 95 %) | 0,718 (0,605-0,810) | 0,789 (0,680-0,868) |
| Precision / Recall / F1 macro | 0,761 / 0,675 / 0,678 | 0,805 / 0,737 / 0,750 |
| ECE | 0,080 | 0,157 |
| `ok` con las reglas actuales (M4) | 31 (0,437) | 17 (0,239) |
| Precision de las `ok` (M3) | 0,968 | 1,000 |
| M1 / M2 | 0 / 0 | 0 / 0 |

La subida de F1 cabe en el ruido de 71 fotos y contradice la CV (0,640 frente
a 0,665): no se lee como mejora. Lo que el candidato cambia de verdad es que
**afirma menos en fotos limpias** (umbral 0,823 frente a 0,687) a cambio de
mantener ~0,90 de precision en fotos degradadas. Con las reglas propuestas
(compuerta de brillo, clases no fiables y «alguna senal», abajo), en test:
16 `ok` (16 correctas), 28 «alguna senal» (27 con senal real; la otra es `otra`),
27 abstenciones: 62 % de respuestas informativas frente al 44 % actual. Las M1-M4
del float16 instalado, pendientes desde la seccion 11, son las de esta tabla.

### Clases no fiables (`metricas.clases_no_fiables`)

`linea_mees` (`pocas_fotos`: 15 en train+val) y `acropaquia`
(`precision_baja`: el Wilson superior de la precision de sus aceptadas en OOF
queda bajo 0,90). Van en `metadatos.clases_no_fiables`. El servicio las lee
desde 2026-11-17, junto con `calidad_minima` y `umbral_alguna_senal`: no las
nombra nunca (ni como alternativa) y responde `clase_no_fiable` o
`senal_inespecifica`. Un `metadatos.json` sin esas claves (el modelo 0.1.0
instalado) conserva las reglas anteriores.

### Protocolo

- Test leido una vez, en dos procesos seguidos (`final` y un script de
  evaluacion de las reglas propuestas y del modelo instalado), sin decidir
  nada entre medio ni despues. Es la segunda lectura oficial.
- **Exposicion previa no oficial**: un script del modo primer plano
  (`primer_plano/a.csv` en el scratchpad, 2026-11-17 04:22) ya habia pasado
  las 71 fotos de test por el modelo instalado. Esta ronda no uso esos datos.
- Determinismo: dos corridas de `robustez` dieron resultados identicos campo
  por campo; `ninguno` reproduce la F1 OOF 0,66513 de la seccion 11.

### Reproducir

```bash
python -m entrenamiento.busqueda_clinica robustez --dataset FUERA/prep --series FUERA/prep/series.csv --salida FUERA/art
python -m entrenamiento.busqueda_clinica final    --dataset FUERA/prep --series FUERA/prep/series.csv --salida FUERA/art
```

(con `busqueda.json` de la seccion 11 copiado en `FUERA/art/estado_clinico/`).
