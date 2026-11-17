"""CLI.

  python -m entrenamiento dividir  --tarea forma --dataset DIR --salida DIR
  python -m entrenamiento comparar --tarea forma --dataset DIR --salida DIR
  python -m entrenamiento dividir  --tarea estado_clinico --dataset DIR --salida DIR --series CSV

`dividir` no necesita TensorFlow: sirve para revisar conteos y rechazos antes
de gastar GPU. `comparar` vuelve a dividir (es determinista) y entrena: con los
mismos argumentos, incluido `--series`, sale la misma particion.
"""

import argparse
import json
from collections import Counter
from pathlib import Path

from . import datos
from .config import RUTA_POR_DEFECTO, TAREA_CLINICA, cargar_config, lado_minimo, tarea


def _particionar(cfg: dict, nombre: str, raiz: Path, salida: Path, ruta_series: Path | None) -> tuple[dict, dict]:
    if nombre == TAREA_CLINICA and ruta_series is None:
        # El dataset clinico tiene la misma una recortada varias veces (FICHA de
        # kaggle_nail, seccion 4): sin series, train y test comparten unas.
        raise ValueError(f"la tarea {nombre} exige --series (CSV archivo,serie)")
    t = tarea(cfg, nombre)
    validas, rechazadas = datos.inventariar(raiz, t["clases"], lado_minimo(cfg, nombre))
    if ruta_series is not None:
        validas, rechazadas = datos.asignar_series(validas, rechazadas, datos.cargar_series(ruta_series))
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
    parser.add_argument("--series", type=Path, help="CSV archivo,serie; obligatorio en estado_clinico")
    args = parser.parse_args()

    cfg = cargar_config(args.config)
    raiz, salida = args.dataset / args.tarea, args.salida / args.tarea
    manifiesto, motivos = _particionar(cfg, args.tarea, raiz, salida, args.series)
    if args.comando == "comparar":
        from . import modelo  # importa TensorFlow: solo aqui

        informe = modelo.comparar(cfg, args.tarea, manifiesto, motivos, raiz, salida)
        print(f"ganador: {informe['ganador']}. Reporte: {salida / 'comparativa.md'}")


if __name__ == "__main__":
    main()
