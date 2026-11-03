# Ficha: arthitaya/nail-dataset (Kaggle)

> **Uso temporal, solo particion.** Decision del responsable del proyecto del
> 2026-10-29 para las tareas de la Gantt «Recoleccion y etiquetado del
> dataset» (Sprint 2, solo documentacion) y «Separacion del dataset y modelo
> base» (Sprint 3, la separacion). El entrenamiento esta en pausa. Este
> dataset **no entrena ninguna tarea del producto** (`forma`, `estado`): sus
> clases son condiciones clinicas de la una.

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

1. **Las clases son clinicas.** NuraVision hace observacion estetica, no
   diagnostico (ver `../../README.md`, seccion 5). Entrenar `onycholysis`,
   `clubbing` o `terry_s nail` convertiria el sistema en un dispositivo
   medico de hecho, con un dataset que no lo sostiene. `config.py` rechaza
   estas clases para las tareas del producto, tambien con su nombre en ingles.
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
