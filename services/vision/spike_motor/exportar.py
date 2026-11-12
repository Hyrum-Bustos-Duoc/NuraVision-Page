"""Spike 3.1, paso 1 (Python 3.11-3.13 + requirements.txt de services/vision).

Construye cada arquitectura con `entrenamiento.modelo.construir` (base
ImageNet + cabeza Dense aleatoria con semilla fija) y la exporta por el mismo
camino que `entrenamiento.modelo._exportar`: guardar .keras, recargar y
`export(format="litert")`. Escribe en <salida>/<arq>/ el .tflite y un .npz con
las 20 entradas y las probabilidades de Keras, que lee `comparar.py`.

    python -I exportar.py <salida>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # services/vision

import keras
import numpy as np

from entrenamiento import modelo as m

SEMILLA = 20261027  # la de config.toml
N_CLASES = 9  # ids de estado_clinico (design.md)
LADO = 224
N_ENTRADAS = 20


def entradas(semilla: int) -> np.ndarray:
    """10 de ruido uniforme y 10 de bloques suaves (ruido 7x7 ampliado), RGB
    float32 0-255. Las suaves se parecen mas a una foto que el ruido puro."""
    rng = np.random.default_rng(semilla)
    ruido = rng.uniform(0, 255, (N_ENTRADAS // 2, LADO, LADO, 3))
    bloques = rng.uniform(0, 255, (N_ENTRADAS // 2, 7, 7, 3)).repeat(32, axis=1).repeat(32, axis=2)
    return np.concatenate([ruido, bloques]).astype(np.float32)


def main(salida: Path) -> None:
    x = entradas(SEMILLA)
    for arq in ("MobileNetV3Small", "EfficientNetB0"):
        keras.backend.clear_session()
        m.fijar_determinismo(SEMILLA)
        modelo, _ = m.construir(arq, N_CLASES, LADO, dropout=0.2)
        carpeta = salida / arq
        carpeta.mkdir(parents=True, exist_ok=True)
        modelo.save(carpeta / "modelo.keras")
        recargado = keras.models.load_model(carpeta / "modelo.keras")
        recargado.export(carpeta / "modelo.tflite", format="litert")
        probs = recargado.predict(x, verbose=0)
        np.savez(carpeta / "referencia.npz", x=x, probs=probs)
        print(f"{arq}: max prob media {probs.max(axis=1).mean():.3f}, "
              f"clases argmax distintas {len(set(probs.argmax(axis=1)))}")
    print(f"keras {keras.__version__}, numpy {np.__version__}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
