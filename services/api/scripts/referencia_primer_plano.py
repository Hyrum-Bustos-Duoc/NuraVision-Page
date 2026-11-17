"""Escribe models/estado_clinico/referencia_primer_plano.json (ver clinico.parece_una).

Uso, desde services/api (Nail.zip extraido FUERA del repo: son fotos de personas):

    .venv/bin/python -I scripts/referencia_primer_plano.py \
        --particion <salida del entrenamiento>/estado_clinico/particion.json \
        --fotos <carpeta con las subcarpetas de clase de estado_clinico>

Usa solo train y val del manifiesto con el que se entreno el modelo: test queda
libre para medir cuantas unas acepta la puerta. Cada foto se comprueba contra el
sha256 del manifiesto antes de leerla.

Que calcula:
- media: promedio de los embeddings normalizados de esas fotos, pasadas por el
  mismo camino que el servicio (unas.recorte_primer_plano).
- umbral_coseno: percentil 5 del coseno de cada foto con la media de los OTROS
  pliegues (5 pliegues agrupados por serie, para que una foto casi repetida no
  se compare con su gemela). Con la media del total, cada foto ya estaria dentro
  de la media y el umbral saldria optimista. Asi, ~95 % de las unas de entrenamiento
  pasan la puerta; lo que pasa con fotos nuevas se mide aparte (ver el reporte).
"""

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))  # -I no agrega la carpeta del script ni la actual

from app.main import RUTA_CLINICO, RUTA_TEXTOS_CLINICOS  # noqa: E402
from app.vision import clinico, unas  # noqa: E402

PLIEGUES = 5
PERCENTIL = 5
SEMILLA = 20261117


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--particion", type=Path, required=True)
    ap.add_argument("--fotos", type=Path, required=True)
    ap.add_argument("--modelo", type=Path, default=RUTA_CLINICO)
    args = ap.parse_args()

    c = clinico.cargar(args.modelo, RUTA_TEXTOS_CLINICOS)
    if c.embeber is None:
        sys.exit("El modelo no expone el tensor del embedding: no se puede calcular la referencia.")
    manifiesto = json.loads(args.particion.read_text(encoding="utf-8"))
    fotos = [a for a in manifiesto["archivos"] if a["particion"] in ("train", "val")]

    embs, grupos = [], []
    for a in fotos:
        contenido = (args.fotos / a["archivo"]).read_bytes()
        if hashlib.sha256(contenido).hexdigest() != a["sha256"]:
            sys.exit(f"{a['archivo']}: el sha256 no coincide con el manifiesto")
        e = c.embeber(clinico.entrada(unas.recorte_primer_plano(unas.decodificar(contenido))))
        embs.append(e / np.linalg.norm(e))
        grupos.append(f"{a['clase']}/{a['serie']}")
    embs = np.asarray(embs, dtype=np.float64)

    series = sorted(set(grupos))
    np.random.default_rng(SEMILLA).shuffle(series)
    pliegue_de = {s: i % PLIEGUES for i, s in enumerate(series)}
    pliegue = np.array([pliegue_de[g] for g in grupos])
    cosenos = np.empty(len(embs))
    for f in range(PLIEGUES):
        media = embs[pliegue != f].mean(axis=0)
        cosenos[pliegue == f] = embs[pliegue == f] @ (media / np.linalg.norm(media))

    media = embs.mean(axis=0)
    salida = {
        "modelo_sha256": hashlib.sha256((args.modelo / "modelo.tflite").read_bytes()).hexdigest(),
        "media": [round(float(v), 6) for v in media / np.linalg.norm(media)],
        "umbral_coseno": round(float(np.percentile(cosenos, PERCENTIL)), 4),
        "n_fotos": len(embs),
        "particion_huella": manifiesto["huella"],
        "metodo": f"percentil {PERCENTIL} del coseno fuera de pliegue, {PLIEGUES} pliegues por serie, semilla {SEMILLA}",
        "fecha": date.today().isoformat(),
    }
    destino = args.modelo / clinico.ARCHIVO_REFERENCIA
    destino.write_text(json.dumps(salida, indent=1), encoding="utf-8")
    print(f"{destino}: {len(embs)} fotos, umbral_coseno {salida['umbral_coseno']}")


if __name__ == "__main__":
    main()
