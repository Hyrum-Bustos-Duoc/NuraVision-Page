# Spike 3.1: motor para ejecutar el `.tflite` en el servicio (Q1)

Tarea 3.1 de `openspec/changes/reporte-clinico-unas`. Ejecutado el 2026-11-12
en macOS arm64.

Vive aqui, fuera de `services/api/app/vision/`, porque no es codigo del
servicio: necesita TensorFlow, que el API no tiene. Se conserva para repetirlo
cuando cambie OpenCV, LiteRT o la version de Keras de `requirements.txt`.

## Que se prueba

Paridad de operadores, no calidad. Cada arquitectura de `config.toml` se
construye con `entrenamiento.modelo.construir` (base ImageNet + cabeza Dense de
9 clases aleatoria, semilla 20261027) y se exporta igual que
`entrenamiento.modelo._exportar`: guardar `.keras`, recargar y
`export(format="litert")`. Se comparan las probabilidades de Keras con las de
cada motor sobre 20 entradas RGB float32 0-255 de 224x224 (10 de ruido y 10 de
bloques suaves). Criterio: diferencia absoluta maxima <= 1e-3.

Las probabilidades no son triviales: la probabilidad maxima media es 0.289
(MobileNetV3Small) y 0.216 (EfficientNetB0), frente a 0.111 de una salida
uniforme.

## Como repetirlo

```bash
# 1. Python 3.11-3.13 con services/vision/requirements.txt (TF 2.21, Keras 3.15.1)
python -I services/vision/spike_motor/exportar.py <salida>
# 2. Con el venv del API (cv2) y, si se quiere, otro con ai-edge-litert==2.3.0
services/api/.venv/bin/python -I services/vision/spike_motor/comparar.py <salida>
```

`<salida>` debe quedar fuera del repositorio (unos 70 MB de modelos).

## Resultado

```
# venv del API: Python 3.14.4, OpenCV 5.0.0, numpy 2.5.4
MobileNetV3Small  cv2.dnn         max|dif| 2.652e-06  argmax igual 20/20  OK
EfficientNetB0    cv2.dnn         FALLA: ... Unsupported operator type SHAPE in function 'populateNet'

# Python 3.14.4 + ai-edge-litert 2.3.0
MobileNetV3Small  ai_edge_litert  max|dif| 2.831e-06  argmax igual 20/20  OK
EfficientNetB0    ai_edge_litert  max|dif| 1.192e-06  argmax igual 20/20  OK

# Python 3.13.18 + TensorFlow 2.21.0 (referencia)
MobileNetV3Small  tf.lite         max|dif| 2.831e-06  argmax igual 20/20  OK
EfficientNetB0    tf.lite         max|dif| 1.192e-06  argmax igual 20/20  OK
```

`cv2.dnn` no carga EfficientNetB0: el bloque squeeze-excitation exporta un
`SHAPE` por el lote dinamico. Exportar con lote fijo
(`input_signature=[keras.InputSpec((1, 224, 224, 3))]`) hace que OpenCV lo
cargue, pero entonces **devuelve probabilidades equivocadas sin avisar**:
max|dif| 0.256 con entrada NCHW y 0.184 con NHWC (avisa de un broadcast de
forma 3 vs 224 en la normalizacion). Un motor que falla en silencio es peor que
uno que no carga. Esta variante se probo a mano y no forma parte del script.

## Veredicto

**Motor recomendado: `ai-edge-litert==2.3.0` (opcion c de Q1).** Cumple el
criterio en las dos arquitecturas (max 2.8e-06) y coincide con el interprete de
TensorFlow. Publica ruedas cp314 para macOS arm64 (12.8 MB) y manylinux_2_27
x86_64 (21.8 MB) y aarch64 (14.4 MB), comprobado en PyPI el 2026-11-12.
Instalado en simulacro sobre el venv del API, agrega 5 paquetes sin conflictos:
`ai-edge-litert`, `backports-strenum`, `ml-dtypes`, `protobuf 7.36.2` y `tqdm`.

`cv2.dnn` (opcion a) queda descartado: solo serviria si el ganador fuera
MobileNetV3Small, y el ganador se elige por F1 despues de entrenar.

La dependencia **todavia no** se agrega a `services/api/requirements.txt`.
Eso es parte de 3.2.
