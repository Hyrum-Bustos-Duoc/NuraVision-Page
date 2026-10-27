# services/vision: entrenamiento y evaluacion (NURA-105)

Este modulo entrena con transfer learning y compara dos modelos de vision para
unas: **forma** y **estado/cuidado**. Solo cubre entrenamiento y evaluacion.
La inferencia en produccion va aparte, en `services/api/app/vision/` (Sprint 5),
y debe normalizar las imagenes con la misma funcion,
`entrenamiento.datos.cargar_imagen`.

> Observacion estetica orientativa. No es un diagnostico medico.

Estado al 2026-10-27: la logica pura tiene tests y pasa. El entrenamiento con
TensorFlow todavia **no se ha ejecutado nunca** porque no hay dataset propio.
Los hiperparametros de `config.toml` marcados "a validar" no estan probados.

## 1. Armar el dataset

```
dataset/
  forma/
    almendra/  cuadrada/  ovalada/  redonda/  stiletto/
    subgrupos.csv          (opcional, ver abajo)
  estado/
    cuidada/  cuticula_descuidada/  quebradiza_o_descamada/  esmalte_deteriorado/
```

- Se aceptan JPEG o PNG. El formato se detecta por el contenido del archivo y
  no por la extension. El lado menor de la foto debe medir al menos 224 px.
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
3. Ajusta `TAREA` (`forma` o `estado`) y ejecuta las celdas en orden.

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
`model.name`, `model.version`, `model.seed`, `feature`,
`kind: interpretacion`, el umbral `no_concluyente`, las clases que llevan
`recommend_professional_review` y la huella de la particion.

Los pesos no se suben al repositorio. La forma en que la inferencia los
obtiene esta pendiente de definir con nv-devops.

## 3. Tests locales (sin TensorFlow)

```bash
cd services/vision
python3 -m venv .venv && .venv/bin/pip install -r requirements-test.txt
.venv/bin/python -m pytest -q
```

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

## 5. Decisiones y descartes (2026-10-27)

| Decision | Descartado | Por que |
|---|---|---|
| Dos tareas independientes (`--tarea forma\|estado`), un modelo cada una | Un modelo con dos cabezas | Las dos cabezas exigen ambas etiquetas en cada foto. Los datos de forma y de estado probablemente vienen de fuentes distintas |
| MobileNetV3Small y EfficientNetB0 | MobileNetV2 | MobileNetV2 necesita un `preprocess_input` externo, y si se olvida el modelo entrena con la escala equivocada sin dar error. V3 y EfficientNet reescalan dentro del modelo. `config.py` rechaza las arquitecturas sin reescalado interno |
| | ResNet50 y otros modelos grandes | Tienen mas de 20 M de parametros. Con cientos de fotos aumentan el sobreajuste y la latencia, y no hay motivo para esperar mejores resultados |
| Clases de estado solo esteticas | Hongos, psoriasis, melanoma, infecciones | Una clase clinica convierte esto en un dispositivo medico de hecho, con un dataset que no lo sostiene. Un falso negativo confiado sobre una lesion es el peor resultado posible. `config.py` rechaza esos terminos. Para `quebradiza_o_descamada` se recomienda consultar a un profesional, sin nombrar ninguna causa |
| Rellenar hasta cuadrado (pad) tras corregir la orientacion EXIF | Estirar o recortar | Estirar deforma la proporcion largo/ancho, que es lo que separa almendra de ovalada. Recortar puede cortar la una. Sin corregir el EXIF, las fotos verticales de movil entran giradas |
| Aumentos geometricos y de contraste | Cambiar tono o saturacion, voltear en vertical | El color del esmalte y de la piel es senal, o una fuente de sesgo. Las fotos reales se toman con los dedos hacia arriba |
| Fine-tuning de las ultimas 20 capas, con BatchNorm congelada y LR 1e-5 | Descongelar toda la base | Con pocos datos, descongelar todo destruye los pesos de ImageNet. 20 es el valor del ejemplo oficial de Keras y se usa el mismo en ambas arquitecturas para que la comparacion sea justa |
| Umbral calibrado en validacion | Umbral fijo (0.5 o 0.7) y temperature scaling | El softmax no es una probabilidad calibrada, asi que un umbral fijo no significa nada. Temperature scaling agrega una etapa, pero el umbral ya da la salida de escape. Se reconsiderara si la cobertura resulta mala |
| Elegir el ganador por validacion | Elegirlo por test | Si se elige por test y se reporta test, el rendimiento queda sobreestimado |
| Pillow para validar y normalizar | OpenCV | Pillow ya cubre la decodificacion, el EXIF y el pad. Agregar OpenCV seria una dependencia sin efecto |
| Determinismo: una semilla para todo, `enable_op_determinism` y versiones fijadas | Dejar cuDNN sin determinismo | Sin determinismo, dos ejecuciones dan modelos distintos y QA no puede reproducir nada. El costo es que el entrenamiento en GPU es mas lento |
| No se mide la calidad de imagen (blur, brillo) en el entrenamiento | | El dataset se cura a mano. Ese control pertenece al pipeline de inferencia, que recibe fotos de usuarios |

## 6. Limites conocidos

- **Fuga por persona**: la deduplicacion solo detecta fotos identicas byte a
  byte. Dos fotos distintas de la misma mano pueden quedar una en train y otra
  en test, y eso infla las metricas. Si una persona aporta varias fotos, hay
  que agrupar por persona antes de usar las metricas como evidencia. Hoy no
  esta implementado.
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

La consola muestra solo conteos, nunca nombres de archivo, porque un nombre
puede identificar a una persona. Antes de usar cualquier foto hay que contar
con el consentimiento de la persona fotografiada.
