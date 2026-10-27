"""CLI.

  python -m entrenamiento dividir  --tarea forma --dataset DIR --salida DIR
  python -m entrenamiento comparar --tarea forma --dataset DIR --salida DIR

`dividir` no necesita TensorFlow: sirve para revisar conteos y rechazos antes
de gastar GPU. `comparar` vuelve a dividir (es determinista) y entrena.
"""

import argparse
import json
from collections import Counter
from pathlib import Path

from . import datos
from .config import RUTA_POR_DEFECTO, cargar_config, tarea


def _particionar(cfg: dict, nombre: str, raiz: Path, salida: Path) -> tuple[dict, dict]:
    t = tarea(cfg, nombre)
    validas, rechazadas = datos.inventariar(raiz, t["clases"], cfg["imagen"]["lado_minimo"])
    p = cfg["particion"]
    manifiesto = datos.dividir(validas, t["clases"], p["val"], p["test"], cfg["semilla"])
    datos.verificar(manifiesto)

    salida.mkdir(parents=True, exist_ok=True)
    # La lista nominal de rechazos va al manifiesto (en Drive, privado). A la
    # consola solo los conteos: un nombre de archivo puede identificar a alguien.
    (salida / "particion.json").write_text(
        json.dumps({**manifiesto, "rechazadas": rechazadas}, indent=2, ensure_ascii=False)
    )
    motivos = dict(Counter(r["motivo"] for r in rechazadas))
    print(f"particion {manifiesto['huella'][:12]}: {manifiesto['conteos']}")
    print(f"rechazadas: {motivos or 'ninguna'}")
    return manifiesto, motivos


def main() -> None:
    parser = argparse.ArgumentParser(prog="entrenamiento")
    parser.add_argument("comando", choices=["dividir", "comparar"])
    parser.add_argument("--tarea", required=True)
    parser.add_argument("--dataset", type=Path, required=True, help="carpeta que contiene <tarea>/<clase>/")
    parser.add_argument("--salida", type=Path, required=True, help="se escribe en <salida>/<tarea>/")
    parser.add_argument("--config", type=Path, default=RUTA_POR_DEFECTO)
    args = parser.parse_args()

    cfg = cargar_config(args.config)
    raiz, salida = args.dataset / args.tarea, args.salida / args.tarea
    manifiesto, motivos = _particionar(cfg, args.tarea, raiz, salida)
    if args.comando == "comparar":
        from . import modelo  # importa TensorFlow: solo aqui

        informe = modelo.comparar(cfg, args.tarea, manifiesto, motivos, raiz, salida)
        print(f"ganador: {informe['ganador']}. Reporte: {salida / 'comparativa.md'}")


if __name__ == "__main__":
    main()
