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
| `kaggle_nail` (arthitaya/nail-dataset v2) | **Temporal**, desde el 2026-10-29 | Solo particion. Clases clinicas: no entrena tareas del producto | [FICHA.md](kaggle_nail/FICHA.md) |

## Agregar un dataset

1. Crea `datasets/<nombre>/FICHA.md` copiando la estructura de una ficha existente.
2. Si sus clases son las del producto (`config.toml`), se particiona con
   `python -m entrenamiento dividir`, y el manifiesto queda en Drive (fotos propias).
3. Si es un dataset externo con otras clases, crea su `particion.toml` con
   `uso = "solo_particion"` y particiona con `python -m entrenamiento.externo`.
   Esa via no tiene camino hacia el entrenamiento: `config.py` rechaza una
   ficha usada como config, y las clases de producto siguen protegidas por la
   guarda de terminos clinicos.
