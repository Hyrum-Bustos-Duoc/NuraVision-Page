"""Particion de datasets externos de uso TEMPORAL: separa, nunca entrena.

  python -m entrenamiento.externo --ficha datasets/<nombre>/particion.toml --dataset DIR --salida DIR

Vive aparte del CLI del producto a proposito. Un dataset externo puede traer
clases clinicas (p. ej. datasets/kaggle_nail/), que config.py rechaza para las
tareas del producto. Aqui no hay tarea ni modelo: no existe camino desde una
ficha externa hasta `comparar`, y config.py rechaza una ficha si se le pasa
como config de entrenamiento.
"""

import argparse
import json
import tomllib
from collections import Counter
from pathlib import Path

from PIL import Image

from . import datos
from .config import USO_SOLO_PARTICION, cargar_config


def cargar_ficha(ruta: Path) -> dict:
    with open(ruta, "rb") as f:
        ficha = tomllib.load(f)
    if ficha.get("uso") != USO_SOLO_PARTICION:
        raise ValueError(f"{ruta}: falta uso = \"{USO_SOLO_PARTICION}\"; no es una ficha de dataset externo")
    p = ficha["particion"]
    if not (0 < p["val"] < 1 and 0 < p["test"] < 1 and p["val"] + p["test"] < 1):
        raise ValueError("particion: val y test deben ser fracciones con val + test < 1")
    clases = ficha["clases"]
    if len(clases) < 2 or len(set(clases)) != len(clases):
        raise ValueError("se necesitan 2+ clases sin repetir")
    if ficha["lado_minimo"] < 1:
        raise ValueError("lado_minimo debe ser >= 1")
    return ficha


def particionar(ficha: dict, raiz: Path, lado_producto: int) -> dict:
    """Manifiesto verificado, con el lado menor de cada foto.

    Guardar `lado_menor` permite filtrar despues por resolucion (p. ej. al
    minimo del producto) como un subconjunto de esta misma particion. Volver a
    particionar con otro minimo moveria fotos de test a train entre
    experimentos, y las metricas dejarian de ser comparables.
    """
    clases = ficha["clases"]
    validas, rechazadas = datos.inventariar(raiz, clases, ficha["lado_minimo"])
    for item in validas:
        with Image.open(raiz / item["archivo"]) as img:
            item["lado_menor"] = min(img.size)
    p = ficha["particion"]
    manifiesto = datos.dividir(validas, clases, p["val"], p["test"], ficha["semilla"])
    datos.verificar(manifiesto)

    aptas = {part: {c: 0 for c in clases} for part in datos.PARTICIONES}
    for a in manifiesto["archivos"]:
        if a["lado_menor"] >= lado_producto:
            aptas[a["particion"]][a["clase"]] += 1
    return {
        "dataset": ficha["dataset"],
        "uso": USO_SOLO_PARTICION,
        **manifiesto,
        "aptas_lado_producto": {"lado_minimo": lado_producto, "conteos": aptas},
        "rechazadas": rechazadas,
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="entrenamiento.externo")
    parser.add_argument("--ficha", type=Path, required=True, help="datasets/<nombre>/particion.toml")
    parser.add_argument("--dataset", type=Path, required=True, help="carpeta que contiene <clase>/")
    parser.add_argument("--salida", type=Path, required=True, help="se escribe <salida>/particion.json")
    args = parser.parse_args()

    ficha = cargar_ficha(args.ficha)
    lado_producto = cargar_config()["imagen"]["lado_minimo"]
    manifiesto = particionar(ficha, args.dataset, lado_producto)

    args.salida.mkdir(parents=True, exist_ok=True)
    (args.salida / "particion.json").write_text(
        json.dumps(manifiesto, indent=2, ensure_ascii=False) + "\n"
    )
    # Solo conteos en consola, igual que el CLI del producto.
    print(f"particion {manifiesto['huella'][:12]} ({ficha['dataset']}, solo particion)")
    for part in datos.PARTICIONES:
        print(f"  {part}: {manifiesto['conteos'][part]}")
    print(f"aptas con lado menor >= {lado_producto}:")
    for part in datos.PARTICIONES:
        print(f"  {part}: {manifiesto['aptas_lado_producto']['conteos'][part]}")
    print(f"rechazadas: {dict(Counter(r['motivo'] for r in manifiesto['rechazadas'])) or 'ninguna'}")


if __name__ == "__main__":
    main()
