"""Spike 3.1, paso 2: compara cada motor TFLite contra las probabilidades de
Keras que dejo `exportar.py`. Prueba los motores importables en el Python
que lo ejecuta, para poder correrlo con el venv del API (cv2) y con otro que
tenga ai-edge-litert o tensorflow, sin mezclar dependencias.

    python -I comparar.py <salida de exportar.py>

Criterio (tasks.md 3.1): diferencia absoluta maxima <= 1e-3.
"""

import sys
from pathlib import Path

import numpy as np

UMBRAL = 1e-3


def cv2_dnn(ruta: Path, x: np.ndarray) -> np.ndarray:
    import cv2

    net = cv2.dnn.readNetFromTFLite(str(ruta))
    salidas = []
    for img in x:
        # El importador TFLite de OpenCV 5.0 espera el blob en NCHW aunque el
        # modelo sea NHWC: con NHWC falla en la primera convolucion.
        net.setInput(img.transpose(2, 0, 1)[None].copy())
        salidas.append(net.forward().reshape(-1))
    return np.stack(salidas)


def interprete(clase, ruta: Path, x: np.ndarray) -> np.ndarray:
    it = clase(model_path=str(ruta))
    it.allocate_tensors()
    entrada, salida = it.get_input_details()[0]["index"], it.get_output_details()[0]["index"]
    salidas = []
    for img in x:
        it.set_tensor(entrada, img[None])
        it.invoke()
        salidas.append(it.get_tensor(salida).reshape(-1))
    return np.stack(salidas)


def ai_edge_litert(ruta, x):
    from ai_edge_litert.interpreter import Interpreter

    return interprete(Interpreter, ruta, x)


def tf_lite(ruta, x):
    import tensorflow as tf

    return interprete(tf.lite.Interpreter, ruta, x)


MOTORES = {"cv2.dnn": cv2_dnn, "ai_edge_litert": ai_edge_litert, "tf.lite": tf_lite}


def main(raiz: Path) -> None:
    print(f"python {sys.version.split()[0]}, numpy {np.__version__}")
    for arq in ("MobileNetV3Small", "EfficientNetB0"):
        ref = np.load(raiz / arq / "referencia.npz")
        for nombre, motor in MOTORES.items():
            try:
                probs = motor(raiz / arq / "modelo.tflite", ref["x"])
            except ImportError:
                continue  # motor no instalado en este Python
            except Exception as e:  # el fallo de carga ES el resultado del spike
                # El final del mensaje de OpenCV nombra el operador que falta.
                print(f"{arq:17} {nombre:15} FALLA: {type(e).__name__}: ...{str(e).strip()[-110:]}")
                continue
            dif = float(np.abs(probs - ref["probs"]).max())
            argmax = int((probs.argmax(1) == ref["probs"].argmax(1)).sum())
            veredicto = "OK" if dif <= UMBRAL else "NO"
            print(f"{arq:17} {nombre:15} max|dif| {dif:.3e}  argmax igual {argmax}/{len(probs)}  {veredicto}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
