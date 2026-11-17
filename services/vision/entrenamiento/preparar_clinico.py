"""Prepara `Nail.zip` (Kaggle arthitaya/nail-dataset v2) para `estado_clinico`.

  python -I services/vision/entrenamiento/preparar_clinico.py --kaggle DIR/Nail --salida FUERA_DEL_REPO

Hace las tareas U.2 y U.3 de reporte-clinico-unas de forma reproducible:

1. Copia cada carpeta del zip a `<salida>/estado_clinico/<id>/`, con el id de
   la tabla de la FICHA (seccion 10). Una carpeta que no esta en la tabla hace
   fallar todo: perder fotos en silencio es peor que no preparar.
2. Escribe `<salida>/series.csv` (archivo,serie) agrupando casi-duplicados por
   similitud de embeddings: misma clase y coseno >= UMBRAL_SIMILITUD.

Por que embeddings y no dHash (casi_duplicados.py): sobre estas fotos, con
bordes negros y fondos parecidos, dHash <= 4 dio 595 pares de los que 447 eran
de clases distintas (2026-11-17); es ruido. El coseno entre embeddings de
EfficientNetB0 (ImageNet) no dio ningun par entre clases por encima de 0.85, y
en la revision visual de los pares de 0.80-0.85 la mayoria eran la misma una
recortada o desplazada. Agrupar de mas solo restringe la particion; agrupar de
menos filtra fotos de test a train. Por eso el umbral queda bajo.

Importa TensorFlow (para los embeddings). Ni las fotos ni el CSV pueden quedar
dentro del repositorio.
"""

import argparse
import csv
import shutil
import sys
from pathlib import Path

import numpy as np

if __package__ in (None, ""):  # ejecutado como script (python -I no anade su carpeta)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from entrenamiento import datos  # noqa: E402
from entrenamiento.config import TAREA_CLINICA, cargar_config, exigir_fuera_del_repo, lado_minimo, tarea  # noqa: E402

# FICHA de kaggle_nail, seccion 10. `other` va a `otra`, que se entrena y el
# servicio nunca muestra.
MAPEO_KAGGLE = {
    "beau_s line": "linea_beau",
    "black line": "linea_oscura",
    "clubbing": "acropaquia",
    "mees_ line": "linea_mees",
    "normal": "sin_senales",
    "onycholysis": "onicolisis",
    "other": "otra",
    "terry_s nail": "una_terry",
    "white spot": "mancha_blanca",
}
# Revisado a ojo el 2026-11-17 en hojas de pares (bandas 0.75-0.80, 0.80-0.82 y
# 0.84-0.85): a 0.80-0.82 aun hay series reales, a 0.75-0.80 dominan las unas
# distintas. Con 0.80 las 350 fotos de >= 64 px quedan en 223 series (mayor: 15).
# Rango probado: 0.78 (series de hasta 21 fotos) - 0.82 (pierde series reales).
UMBRAL_SIMILITUD = 0.80


def id_clinico(carpeta: str) -> str:
    if carpeta not in MAPEO_KAGGLE:
        raise ValueError(f"carpeta sin id de {TAREA_CLINICA}: {carpeta!r}; revisa la FICHA de kaggle_nail")
    return MAPEO_KAGGLE[carpeta]


def series(similitud: np.ndarray, clases: list[str], umbral: float = UMBRAL_SIMILITUD) -> list[int]:
    """Componente conexa de cada foto: une pares de la misma clase con
    similitud >= umbral, transitivamente. Devuelve el menor indice de su
    componente, asi que el resultado no depende del orden de las uniones."""
    padre = list(range(len(clases)))

    def raiz(i: int) -> int:
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    for a, b in zip(*np.nonzero(np.triu(similitud >= umbral, 1))):
        if clases[a] == clases[b]:
            ra, rb = raiz(int(a)), raiz(int(b))
            padre[max(ra, rb)] = min(ra, rb)
    return [raiz(i) for i in range(len(clases))]


def embeddings(rutas: list[Path], lado: int) -> np.ndarray:
    """Embeddings L2-normalizados, con la misma normalizacion que el entrenamiento."""
    import keras  # solo aqui: el resto del modulo se prueba sin TensorFlow

    from entrenamiento.datos import cargar_imagen
    from entrenamiento.modelo import fijar_determinismo

    fijar_determinismo(cargar_config()["semilla"])
    base = keras.applications.EfficientNetB0(include_top=False, weights="imagenet",
                                             input_shape=(lado, lado, 3), pooling="avg")
    lotes = [np.stack([cargar_imagen(r, lado) for r in rutas[i:i + 64]]).astype(np.float32)
             for i in range(0, len(rutas), 64)]
    e = np.concatenate([base.predict(x, verbose=0) for x in lotes])
    return e / np.linalg.norm(e, axis=1, keepdims=True)


def main() -> None:
    parser = argparse.ArgumentParser(prog="preparar_clinico")
    parser.add_argument("--kaggle", type=Path, required=True, help="carpeta Nail/ del zip, con <carpeta>/<foto>")
    parser.add_argument("--salida", type=Path, required=True, help="carpeta nueva fuera del repositorio")
    args = parser.parse_args()
    exigir_fuera_del_repo(args.salida, "--salida")

    destino = args.salida / TAREA_CLINICA
    if destino.exists():
        raise ValueError(f"{destino} ya existe: usa una carpeta nueva para no mezclar preparaciones")
    for carpeta in sorted(p for p in args.kaggle.iterdir() if p.is_dir()):
        clase = id_clinico(carpeta.name)
        (destino / clase).mkdir(parents=True)
        for foto in sorted(p for p in carpeta.iterdir() if p.is_file() and not p.name.startswith(".")):
            shutil.copy2(foto, destino / clase / foto.name)

    # Series solo entre las fotos que pasan la validacion de la tarea: una foto
    # rechazada no entra en ninguna particion, y si se dejara en el grafo uniria
    # por encadenamiento series distintas (visto el 2026-11-17: una serie de 35
    # fotos en linea_mees encadenada a traves de miniaturas de < 64 px).
    cfg = cargar_config()
    validas, rechazadas = datos.inventariar(destino, tarea(cfg, TAREA_CLINICA)["clases"], lado_minimo(cfg, TAREA_CLINICA))
    e = embeddings([destino / v["archivo"] for v in validas], cfg["imagen"]["lado"])
    raiz = series(e @ e.T, [v["clase"] for v in validas])
    with open(args.salida / "series.csv", "w", newline="", encoding="utf-8") as f:
        escritor = csv.writer(f)
        escritor.writerow(["archivo", "serie"])
        escritor.writerows((v["archivo"], f"s{r}") for v, r in zip(validas, raiz))
    # Solo conteos: un nombre de archivo puede identificar a una persona.
    print(f"{len(validas)} fotos validas ({len(rechazadas)} rechazadas); "
          f"{len(set(raiz))} series (similitud >= {UMBRAL_SIMILITUD})")


if __name__ == "__main__":
    main()
