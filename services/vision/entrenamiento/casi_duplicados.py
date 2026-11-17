"""Pares de casi-duplicados CANDIDATOS, para revisarlos a mano.

  python -I services/vision/entrenamiento/casi_duplicados.py --dataset DIR --salida FUERA_DEL_REPO.csv

Ayuda para escribir el archivo de series (archivo,serie) de la particion: lista
los pares de fotos con dHash de 64 bits a distancia <= 4. NO asigna series: la
FICHA de kaggle_nail (seccion 4) mostro que con este hash hay pares que son la
misma una y pares que no, asi que la decision es de quien revisa.

La consola muestra solo el numero de pares. La lista nominal va a un CSV fuera
del repositorio: un nombre de archivo puede identificar a una persona.
"""

import argparse
import csv
import itertools
import sys
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

if __package__ in (None, ""):  # ejecutado como script (python -I no anade su carpeta)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from entrenamiento.config import exigir_fuera_del_repo  # noqa: E402

# Q3 de reporte-clinico-unas y FICHA de kaggle_nail, seccion 4: con <= 4 sobre
# las 540 fotos salieron 31 pares, entre ellos series reales. Mas alto llena la
# lista de falsos positivos; mas bajo pierde los recortes desplazados.
DISTANCIA_MAXIMA = 4


def dhash(ruta: Path) -> int:
    """Hash de diferencias: 64 bits que dicen si cada pixel de una miniatura 9x8
    en grises es mas claro que su vecino derecho. Sobrevive a recortes leves,
    reescalado y recompresion, que es como se ven las series de la web."""
    with Image.open(ruta) as img:
        gris = ImageOps.exif_transpose(img).convert("L").resize((9, 8), Image.Resampling.BOX)
    px = gris.tobytes()  # modo L: un byte por pixel, fila a fila
    bits = 0
    for fila in range(8):
        for col in range(8):
            bits = (bits << 1) | (px[fila * 9 + col] > px[fila * 9 + col + 1])
    return bits


def candidatos(raiz: Path) -> tuple[list[tuple[str, str, int]], int]:
    """(pares (a, b, distancia) ordenados, archivos ilegibles). Recorre todas las
    subcarpetas: un casi-duplicado entre dos clases tambien importa."""
    hashes, ilegibles = {}, 0
    for ruta in sorted(p for p in raiz.rglob("*") if p.is_file() and not p.name.startswith(".")):
        try:
            hashes[ruta.relative_to(raiz).as_posix()] = dhash(ruta)
        except (UnidentifiedImageError, OSError):
            ilegibles += 1
    pares = []
    for (a, ha), (b, hb) in itertools.combinations(hashes.items(), 2):
        distancia = (ha ^ hb).bit_count()
        if distancia <= DISTANCIA_MAXIMA:
            pares.append((a, b, distancia))
    return pares, ilegibles


def main() -> None:
    parser = argparse.ArgumentParser(prog="casi_duplicados")
    parser.add_argument("--dataset", type=Path, required=True, help="carpeta con <clase>/<foto>")
    parser.add_argument("--salida", type=Path, required=True, help="CSV fuera del repositorio")
    args = parser.parse_args()
    exigir_fuera_del_repo(args.salida, "--salida")

    pares, ilegibles = candidatos(args.dataset)
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    with open(args.salida, "w", newline="", encoding="utf-8") as f:
        escritor = csv.writer(f)
        escritor.writerow(["archivo_a", "archivo_b", "distancia"])
        escritor.writerows(pares)
    print(f"{len(pares)} pares candidatos (dHash <= {DISTANCIA_MAXIMA}); archivos ilegibles: {ilegibles}")


if __name__ == "__main__":
    main()
