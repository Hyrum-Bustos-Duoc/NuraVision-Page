# services/vision: entrenamiento y evaluacion (NURA-105)

Este modulo entrena con transfer learning y compara dos modelos de vision para
unas: **forma** y **estado/cuidado**. Desde el 2026-11-12 tambien entrena una
tercera tarea, **`estado_clinico`**: una senal orientativa para consultar a un
profesional, con una lista cerrada de clases (ver la seccion 5). Solo cubre
entrenamiento y evaluacion. La inferencia en produccion va aparte, en
`services/api/app/vision/`, y debe normalizar las imagenes con la misma
funcion, `entrenamiento.datos.cargar_imagen`.

> Observacion estetica orientativa (forma, estado) o senal orientativa para
> consultar con un profesional (estado_clinico). No es un diagnostico medico.

Estado al 2026-10-27: la logica pura tiene tests y pasa. El entrenamiento con
TensorFlow todavia **no se ha ejecutado nunca** porque no hay dataset propio.
Los hiperparametros de `config.toml` marcados "a validar" no estan probados.

Datasets documentados y sus particiones: `datasets/` (una ficha por dataset).
`estado_clinico` tiene modelo entrenado desde el 2026-11-17 (F1 macro test
0,678, 71 fotos); metodologia, resultados y limites en la seccion 11 de la
FICHA de `kaggle_nail`.
`datasets/kaggle_nail/` (`Nail.zip`) es externo, de clases clinicas: no entrena
`forma` ni `estado`, y desde el 2026-11-12 entrena `estado_clinico`, solo con la
particion por series (seccion 1) y con sus carpetas renombradas a los ids de la
tarea (tabla en su FICHA).

## 1. Armar el dataset

```
dataset/
  forma/
    almendra/  cuadrada/  ovalada/  redonda/  stiletto/
    subgrupos.csv          (opcional, ver abajo)
  estado/
    cuidada/  cuticula_descuidada/  quebradiza_o_descamada/  esmalte_deteriorado/
  estado_clinico/
    linea_beau/  linea_oscura/  acropaquia/  linea_mees/  onicolisis/
    una_terry/  mancha_blanca/  sin_senales/  otra/
```

- Se aceptan JPEG o PNG. El formato se detecta por el contenido del archivo y
  no por la extension. El lado menor de la foto debe medir al menos 224 px,
  salvo en `estado_clinico`, que declara 64 en `config.toml` (pregunta Q2 de
  `reporte-clinico-unas`, pendiente de confirmar).
  Los archivos que no cumplen se rechazan con motivo y quedan registrados en
  `particion.json`.
- Una foto identica (mismo sha256) que aparece en dos clases se descarta: la
  etiqueta se contradice. Si aparece dos veces en la misma clase, se cuenta una
  sola vez.
- Los nombres de las carpetas deben coincidir exactamente con las clases de
  `config.toml`. Si sobra o falta una carpeta, el proceso falla, para que un
  error de tipeo no haga perder fotos sin aviso.
- **`dataset/` nunca se sube al repositorio** (esta en `.gitignore`). Son
  fotos de manos de personas reales y cuentan como dato biometrico. Se guardan
  solo en el Drive del proyecto.

### Series: la misma una en una sola particion

Un CSV `archivo,serie` (opcion `--series`) agrupa las fotos que son la misma
una: recortes, encuadres o copias de una misma imagen. Cada serie cae entera en
una sola particion, y `verificar` falla si una serie aparece en dos. Una foto
que no figura en el CSV es una serie por si sola. Sin `--series` la particion
es identica a la de antes (misma huella), asi que `forma` y `estado` no
cambian. **`estado_clinico` exige el archivo**: su dataset tiene la misma una
recortada varias veces (FICHA de `kaggle_nail`, seccion 4).

```
archivo,serie
acropaquia/clubbing (3).jpg,s7
acropaquia/clubbing (12).jpg,s7
```

- Una fila que nombra una foto que no esta en el dataset, sin serie o que pone
  la misma foto en dos series hace fallar la particion. El error da solo el
  numero de filas, sin nombres.
- Una serie con fotos de dos clases se rechaza entera (`etiqueta_conflictiva`).
- Para escribirlo, `entrenamiento/casi_duplicados.py` lista pares candidatos
  (dHash de 64 bits a distancia <= 4). **No asigna series**: el hash junta
  fotos distintas y se le escapan recortes grandes, asi que cada par se revisa
  a mano. La consola solo da el numero de pares; la lista va a un CSV que debe
  quedar fuera del repositorio. Para `Nail.zip`, `entrenamiento/preparar_clinico.py`
  renombra las carpetas y escribe el archivo de series con similitud de
  embeddings (FICHA de `kaggle_nail`, seccion 11), que alli funciona mejor que
  dHash:

```bash
python -I services/vision/entrenamiento/casi_duplicados.py --dataset DIR/estado_clinico --salida ~/fuera/pares.csv
```

**Minimo recomendado: 100 fotos por clase. Lo ideal son 150 a 200.**

La razon es la evaluacion, no el entrenamiento: con la base congelada, unas
decenas de fotos bastan para entrenar. Pero test se queda con el 15%. Con 100
fotos por clase hay unas 15 en test, y cada foto mueve el recall de esa clase
casi 7 puntos. Aun asi, el intervalo de confianza del 95% para un 80% medido
va de 55% a 93%. Con menos de 50 fotos por clase, las metricas por clase son
anecdotas. El codigo exige 3 fotos por clase como minimo absoluto (una por
particion), pero eso no es una recomendacion.

La variedad es obligatoria, no un extra: distintas personas, luz natural y
artificial, fondos lisos y cargados, esmalte claro y oscuro, y **todo el rango
de tonos de piel**. Si el modelo se calibra con un solo tono, falla de forma
sistematica y silenciosa con los demas. Para medirlo, anota cada foto en
`subgrupos.csv`:

```
archivo,tono_piel,luz,fondo
almendra/0001.jpg,monk_3,natural,liso
```

Las columnas son libres. Para `tono_piel` se sugiere la escala Monk (1-10).
El reporte muestra el accuracy en test para cada valor anotado. El tono de
piel anotado tambien es un dato sensible y vive junto al dataset, nunca en el
repo.

## 2. Ejecutar en Google Colab

1. Sube el dataset a `MyDrive/nuravision/dataset/`.
2. Abre `notebooks/entrenar_colab.ipynb` en Colab y elige un entorno con GPU.
3. Ajusta `TAREA` (`forma`, `estado` o `estado_clinico`) y `RAMA` (la rama
   que tiene el codigo de esa tarea). Para `estado_clinico`, sube tambien el
   archivo de series y ajusta `SERIES`: sin el, `dividir` falla. Ejecuta las
   celdas en orden.

La celda `dividir` no entrena. Muestra los conteos y los rechazos para que los
revises antes de gastar GPU. Despues, `comparar` entrena cada arquitectura de
`config.toml` sobre la misma particion y escribe en
`MyDrive/nuravision/artifacts/<tarea>/`:

| Archivo | Que es |
|---|---|
| `particion.json` | Que foto cae en cada particion, con su sha256, la huella y los rechazos |
| `comparativa.json` / `.md` | Metricas de val y test por arquitectura. El `.md` sirve de evidencia para la Sprint Review |
| `<arquitectura>/modelo.keras` | Cada modelo entrenado |
| `exportado/` | El ganador: `modelo.keras`, `modelo.tflite`, `etiquetas.json`, `metadatos.json` |

`metadatos.json` sigue el contrato del pipeline de inferencia: incluye
`model.name`, `model.version`, `model.seed`, `tarea`, `feature`,
`kind: interpretacion`, el umbral `no_concluyente`, las clases que llevan
`recommend_professional_review` y la huella de la particion. En
`estado_clinico` agrega `umbral_sin_senales`, que el servicio exige para cargar
el modelo.

Los pesos no se suben al repositorio. La forma en que la inferencia los
obtiene esta pendiente de definir con nv-devops.

## 3. Tests locales (sin TensorFlow)

```bash
cd services/vision
python3 -m venv .venv && .venv/bin/pip install -r requirements-test.txt
.venv/bin/python -m pytest -q
```

Dos tests se saltan en ese entorno: el de OpenCV de `test_forma.py` y el del
arnes contra el servicio real. Este ultimo corre con el venv del API:
`../api/.venv/bin/python -m pytest -q tests/test_arnes.py`.

`tests/casos_abstencion.json` es la tabla de casos de las reglas de abstencion
de `estado_clinico` (incluidas `clase_no_fiable` y `senal_inespecifica`). Las
reglas viven dos veces (aqui y en `services/api/app/vision/clinico.py`, que no
tiene scikit-learn) y la tabla debe dar la misma decision en las dos.

## 4. Que se mide

- **Accuracy**, y **precision, recall y F1** macro y por clase, mas la matriz
  de confusion, en val y en test. Se usa el promedio macro porque el ponderado
  esconde que el modelo ignore una clase minoritaria.
- **Parametros**, **MB de pesos** (sin el estado del optimizador) y
  **latencia**: la mediana de 50 inferencias con una imagen, en el dispositivo
  de esa ejecucion. La latencia solo se puede comparar entre modelos medidos en
  la misma ejecucion.
- **Umbral `no_concluyente`**: es la confianza minima con la que las
  predicciones aceptadas en validacion alcanzan `precision_objetivo` (0.90). En
  test se informa la **cobertura** (la fraccion de fotos que reciben
  respuesta) y la **precision de las aceptadas**. Si ningun umbral alcanza el
  objetivo, el umbral es `null` y todas las respuestas seran `no_concluyente`.
  En ese caso el modelo no esta listo.
- **El ganador** es el de mayor F1 macro en **validacion**. Si hay empate,
  gana el que tiene menos parametros.
- **Solo `estado_clinico`**: un segundo umbral, `umbral_sin_senales`, calibrado
  en validacion por encima del falso `sin_senales` mas confiado (decision 6 de
  `reporte-clinico-unas/design.md`). En test se aplican las mismas reglas de
  abstencion que el servicio y se informa, por clase, n, aceptadas correctas,
  abstenidas, aceptadas como otra clase, aceptadas como `sin_senales` y el
  recall estricto con su IC 95 % de Wilson. `comparativa.md` da el valor y el
  veredicto de M1-M4 (los limites, pendientes de Q4, estan en
  `metricas.ACEPTACION_CLINICA`).

### Arnes de fotos reales

`entrenamiento/arnes.py` pasa una carpeta de fotos de celular por
`POST /vision/analizar` de la app de `services/api`, en proceso: MediaPipe,
forma y bloque clinico son los del servicio. Mide fotos con mano, unas por
foto, cobertura, distribucion de estado, motivo y clase, errores y latencia
p50/p95. Con una anotacion opcional (`archivo,dedo,clase,<subgrupos>`) mide
tambien H1-H3 y desglosa por subgrupo (tono de piel, luz, esmalte). Sin
clasificador clinico funciona igual: todas las unas salen `modelo_no_entrenado`.

```bash
services/api/.venv/bin/python -I services/vision/entrenamiento/arnes.py \
    --fotos ~/fuera/fotos --salida ~/fuera/resultados [--anotacion ~/fuera/anotacion.csv]
```

Se niega a leer fotos o anotaciones y a escribir resultados dentro del
repositorio. La consola solo muestra conteos y metricas.

## 5. Decisiones y descartes (2026-10-27)

| Decision | Descartado | Por que |
|---|---|---|
| Dos tareas independientes (`--tarea forma\|estado`), un modelo cada una | Un modelo con dos cabezas | Las dos cabezas exigen ambas etiquetas en cada foto. Los datos de forma y de estado probablemente vienen de fuentes distintas |
| MobileNetV3Small y EfficientNetB0 | MobileNetV2 | MobileNetV2 necesita un `preprocess_input` externo, y si se olvida el modelo entrena con la escala equivocada sin dar error. V3 y EfficientNet reescalan dentro del modelo. `config.py` rechaza las arquitecturas sin reescalado interno |
| | ResNet50 y otros modelos grandes | Tienen mas de 20 M de parametros. Con cientos de fotos aumentan el sobreajuste y la latencia, y no hay motivo para esperar mejores resultados |
| Clases de `forma` y `estado` solo esteticas; lo clinico, solo en `estado_clinico` (decision del dueno del 2026-11-12, que cambia el descarte del 2026-10-27) | Clases clinicas en `forma` o `estado`; una bandera `clinica = true` en `config.toml` | La razon tecnica del descarte original sigue en pie: una clase clinica acerca esto a un dispositivo medico, con un dataset que no lo sostiene, y un falso negativo confiado sobre una lesion es el peor resultado posible. Por eso lo clinico va en una tarea aparte, con abstencion calibrada, un umbral propio para `sin_senales`, la particion por series y la UI tras un boton. `config.py` sigue rechazando en las demas tareas los terminos clinicos y los 9 ids clinicos. Una bandera en el TOML bastaria para levantar la guarda en `forma`. Para `quebradiza_o_descamada` se recomienda consultar a un profesional, sin nombrar ninguna causa |
| Lista cerrada de 9 clases en el codigo (`config.CLASES_CLINICAS`) | Clases definidas en `config.toml`; melanoma u otras lesiones | La lista vive en Python para que ampliarla exija un diff revisado. Sin melanoma: un falso negativo seria el peor resultado posible y el dataset no lo sostiene. `normal` se llama `sin_senales`: el sistema puede decir que no ve las senales que conoce, nunca que una una esta sana. `otra` se entrena pero el servicio nunca la muestra |
| Rellenar hasta cuadrado (pad) tras corregir la orientacion EXIF | Estirar o recortar | Estirar deforma la proporcion largo/ancho, que es lo que separa almendra de ovalada. Recortar puede cortar la una. Sin corregir el EXIF, las fotos verticales de movil entran giradas |
| Aumentos geometricos y de contraste | Cambiar tono o saturacion, voltear en vertical | El color del esmalte y de la piel es senal, o una fuente de sesgo. Las fotos reales se toman con los dedos hacia arriba |
| Fine-tuning de las ultimas 20 capas, con BatchNorm congelada y LR 1e-5 | Descongelar toda la base | Con pocos datos, descongelar todo destruye los pesos de ImageNet. 20 es el valor del ejemplo oficial de Keras y se usa el mismo en ambas arquitecturas para que la comparacion sea justa |
| Umbral calibrado en validacion | Umbral fijo (0.5 o 0.7) y temperature scaling | El softmax no es una probabilidad calibrada, asi que un umbral fijo no significa nada. Temperature scaling agrega una etapa, pero el umbral ya da la salida de escape. Se reconsiderara si la cobertura resulta mala |
| `estado_clinico` (2026-11-17): hiperparametros, temperatura y umbrales con CV de 5 pliegues por serie sobre train+val (predicciones OOF), en `entrenamiento/busqueda_clinica.py`. La temperatura va dentro de los pesos de la Dense | Elegir con la val fija; umbral sin temperature scaling | Con 350 fotos la val fija tiene 3-9 fotos por clase: elegir con ella es elegir ruido. Aqui la confianza se muestra a la persona, asi que se calibra (ECE OOF 0,121 -> 0,046) sin agregar capa. `forma` y `estado` siguen con `comparar`. Detalle en la FICHA de `kaggle_nail`, seccion 11 |
| Elegir el ganador por validacion | Elegirlo por test | Si se elige por test y se reporta test, el rendimiento queda sobreestimado |
| Pillow para validar y normalizar | OpenCV | Pillow ya cubre la decodificacion, el EXIF y el pad. Agregar OpenCV seria una dependencia sin efecto |
| Determinismo: una semilla para todo, `enable_op_determinism` y versiones fijadas | Dejar cuDNN sin determinismo | Sin determinismo, dos ejecuciones dan modelos distintos y QA no puede reproducir nada. El costo es que el entrenamiento en GPU es mas lento |
| No se mide la calidad de imagen (blur, brillo) en el entrenamiento | | El dataset se cura a mano. Ese control pertenece al pipeline de inferencia, que recibe fotos de usuarios |

## 6. Limites conocidos

- **Fuga por persona**: la deduplicacion solo detecta fotos identicas byte a
  byte. Dos fotos distintas de la misma mano pueden quedar una en train y otra
  en test, y eso infla las metricas. La particion por series (seccion 1) lo
  evita, pero solo si alguien escribe el archivo de series: agrupar es trabajo
  manual. `estado_clinico` lo exige; `forma` y `estado` no.
- Con un dataset chico, el umbral se calibra con pocas fotos y sera ruidoso.
  `comparativa.json` informa cuantas fotos de validacion quedaron aceptadas.
- Los rangos "a validar" de `config.toml` (las LR, las capas descongeladas y
  los aumentos) deben confirmarse con una ablacion cuando exista el dataset.

## 7. Privacidad

| Que | Donde | Retencion |
|---|---|---|
| Fotos y `subgrupos.csv` | Solo en el Drive del proyecto. Nunca en el repo, ni en logs, ni en el notebook | **Pendiente de confirmar por el responsable.** Propuesta: borrar al cierre del semestre (2026-12-18) salvo consentimiento escrito para un uso posterior |
| `particion.json` (nombres de archivo y hash) | Drive, `artifacts/` | Igual que las fotos |
| Modelos y reportes (sin imagenes) | Drive, `artifacts/` | Mientras el modelo este en uso |
| Archivo de series y lista de casi-duplicados (nombres de archivo) | Drive o disco de quien los escribe, fuera del repo | Igual que las fotos |
| Fotos del arnes, su anotacion (puede incluir tono de piel) y sus resultados | Disco de quien lo ejecuta, fuera del repo (el arnes se niega a usar el repo) | **Pendiente de confirmar** (U.8). Propuesta: 2026-12-18. Solo con consentimiento escrito de cada persona |

La consola muestra solo conteos, nunca nombres de archivo, porque un nombre
puede identificar a una persona. Antes de usar cualquier foto hay que contar
con el consentimiento de la persona fotografiada.
