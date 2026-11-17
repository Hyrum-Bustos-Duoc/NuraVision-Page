# Datasets

Una carpeta por dataset, cada una con:

| Archivo | Que es |
|---|---|
| `FICHA.md` | Ficha (datasheet): origen, licencia, conteos, calidad, sesgos y como reproducirlo |
| `particion.toml` | Solo para datasets externos: parametros de la particion |
| `particion.json` | Manifiesto: ruta relativa, clase, sha256 y particion de cada foto. Sin imagenes |

**Las imagenes nunca se versionan aqui.** Ni las propias (son dato biometrico,
ver `../README.md`, seccion 7) ni las externas (licencia sin aclarar o
incompatible). El manifiesto si se versiona cuando el dataset es publico: con
el sha256 de cada foto, quien descargue el mismo dataset puede comprobar que
tiene los mismos archivos y reproducir la misma particion.

## Indice

| Dataset | Estado | Uso permitido | Ficha |
|---|---|---|---|
| `kaggle_nail` (arthitaya/nail-dataset v2, = `datasets/Nail.zip`) | **Temporal**, desde el 2026-10-29. Licencia «Unknown» | No entrena `forma` ni `estado`. Desde el 2026-11-12 entrena `estado_clinico`, solo con carpetas renombradas y particion por series; su `particion.json` no se usa para entrenar | [FICHA.md](kaggle_nail/FICHA.md), seccion 10 |
| `NailSegmentationDatasetV2` (`archive (1).zip`) | Revisado el 2026-11-10, origen y licencia sin aclarar | Segmentar la una. Particion limpia en `preparacion/` | [Informe, secciones 2, 3 y 5](../docs/preparacion-modelo.md) |
| `archive.zip` (52 fotos con mascara) | Revisado el 2026-11-10, origen y licencia sin aclarar | Segmentacion, muy pocas fotos | [Informe, seccion 2](../docs/preparacion-modelo.md) |
| `Nails.v1i.tensorflow.zip` (Roboflow, CC BY 4.0) | Revisado el 2026-11-10 | Ninguno: es de anemia | [Informe, secciones 2 y 3](../docs/preparacion-modelo.md) |
| `archive (2).zip` (6 clases clinicas) | Revisado el 2026-11-10, origen y licencia sin aclarar | Ninguno: clinico, incluye melanoma | [Informe, secciones 2 y 3](../docs/preparacion-modelo.md) |
| `data.zip` (hemoglobina) | Revisado el 2026-11-10 | Ninguno: dato de salud por persona | [Informe, seccion 2](../docs/preparacion-modelo.md) |

## Candidatos para `estado_clinico` (sin descargar)

Registro del 2026-11-12 (tarea 2.6 de `reporte-clinico-unas`). **Ninguno se
usa para entrenar sin su FICHA.** «Sin verificar» significa que la licencia no
se leyo en la pagina de origen; lo que digan otras fuentes (resultados de
busqueda, copias) no cuenta como licencia. Aunque una copia declare una
licencia abierta, si deriva de `arthitaya/nail-dataset` hereda su «Unknown»:
quien sube un dataset no puede cambiarle la licencia.

Clases de `estado_clinico`: `linea_beau`, `linea_oscura`, `acropaquia`,
`linea_mees`, `onicolisis`, `una_terry`, `mancha_blanca`, `sin_senales`,
`otra`.

| Dataset | URL | Licencia declarada | Verificacion | Clases que coinciden | ¿Deriva de arthitaya? | Estado |
|---|---|---|---|---|---|---|
| `nail-disease-multilabel` (Roboflow) | Sin comprobar: solo se conoce el nombre | No verificada | **Sin verificar (403, 2026-11-12)**: Roboflow Universe responde 403 (desafio de Cloudflare) a una peticion automatica | No verificadas | Desconocido | Pendiente: revision manual (U.1) |
| `nail-diseases-2` (Roboflow) | Sin comprobar: solo se conoce el nombre | No verificada | **Sin verificar (403, 2026-11-12)**, mismo motivo | No verificadas | Desconocido | **No utilizable** para `estado_clinico`: incluye melanoma acral (dato de resultados de busqueda, no de la pagina), que esta fuera de la lista cerrada |
| `NailDiseaseClf` | Sin comprobar: la busqueda por nombre en Hugging Face, GitHub y Kaggle no devolvio resultados (2026-11-12) y Roboflow responde 403 | No verificada | **Sin verificar (403, 2026-11-12)** | No verificadas | Desconocido | Pendiente: revision manual (U.1) |
| `qingchenXu/NailDx-Nail_Disease_Diagnosis` (Hugging Face) | https://huggingface.co/datasets/qingchenXu/NailDx-Nail_Disease_Diagnosis | MIT, segun la ficha del dataset | Verificada en la pagina de origen (API de Hugging Face) el 2026-11-12. Es la licencia que declara quien lo subio; no declara de donde salen las fotos | Desconocidas: las etiquetas son cajas YOLO con id numerico (`labels/train/1.txt`: clase + 4 coordenadas; deteccion, no clasificacion), 797 imagenes en train y 345 en val segun el listado de archivos (no descargadas), y la ficha no publica sus nombres | Desconocido | Pendiente: identificar las clases y la procedencia de las fotos antes de abrirle FICHA |

`Nail.zip` no figura aqui porque no es candidato: es `kaggle_nail` (mismo
sha256, ver su [FICHA](kaggle_nail/FICHA.md), seccion 1), con licencia
«Unknown».

## Agregar un dataset

1. Crea `datasets/<nombre>/FICHA.md` copiando la estructura de una ficha existente.
2. Si sus clases son las del producto (`config.toml`), se particiona con
   `python -m entrenamiento dividir`, y el manifiesto queda en Drive (fotos propias).
3. Si es un dataset externo con otras clases, crea su `particion.toml` con
   `uso = "solo_particion"` y particiona con `python -m entrenamiento.externo`.
   Esa via no tiene camino hacia el entrenamiento: `config.py` rechaza una
   ficha usada como config, y las clases de `forma` y `estado` siguen
   protegidas por la guarda de terminos e ids clinicos.
4. Un dataset clinico solo puede entrenar `estado_clinico`, renombrado a sus 9
   ids (lista cerrada en `config.py`), con FICHA y con archivo de series.
