"""Degradaciones de foto de celular y brillo de un recorte. Logica pura.

Todo opera sobre el recorte ya normalizado (RGB uint8, lado x lado, salida de
datos.cargar_imagen o del servicio): los niveles se expresan en pixeles de ese
recorte, que es lo que ve el modelo, y no en los de la foto original.

- `degradar`: copias degradadas para medir robustez (solo de fotos de CV, nunca
  de test) y aumento de entrenamiento (`aleatoria`).
- `brillo`: la unica medida de calidad que decide algo (config.toml,
  brillo_minimo). La nitidez (varianza del laplaciano) se probo y no se
  incluye: el ruido y el JPEG la suben, y no separo fotos buenas de malas.
"""

import io

import numpy as np
from PIL import Image, ImageFilter

# Niveles fijos de la evaluacion de robustez. Cada uno imita un fallo de foto de
# celular; "leve" es una foto mediocre y "fuerte", una que una persona repetiria.
# Sigma, factor y lado en pixeles del recorte de 224.
NIVELES: dict[str, dict] = {
    "desenfoque_leve": {"desenfoque": 1.5},
    "desenfoque_fuerte": {"desenfoque": 3.0},
    "oscura": {"brillo": 0.45},
    "muy_oscura": {"brillo": 0.25},
    "sobreexpuesta": {"brillo": 1.6},
    "ruido": {"ruido": 12.0},
    "jpeg_bajo": {"jpeg": 15},
    "resolucion_64": {"resolucion": 64},
    "resolucion_40": {"resolucion": 40},
    "rotada_15": {"rotacion": 15.0},
    # Combinada: poca luz de interior con el ruido y la compresion que la acompanan.
    "celular_poca_luz": {"brillo": 0.5, "ruido": 8.0, "jpeg": 40, "desenfoque": 1.0},
}

# Rangos del aumento aleatorio. Cubren de "sin cambio" a algo peor que el nivel
# fuerte de NIVELES, para que el modelo vea toda la escala y no solo los puntos
# que despues se evaluan.
RANGOS = {
    "desenfoque": (0.0, 3.5),
    "brillo": (0.25, 1.7),
    "ruido": (0.0, 15.0),
    "jpeg": (10, 95),
    "resolucion": (32, 224),
    "rotacion": (-20.0, 20.0),  # el servicio ya alinea el dedo; esto cubre su error
}
# Probabilidad de aplicar cada degradacion en una vista aumentada. 0.4 deja en
# promedio ~2,4 de 6 por vista y ~5 % de vistas sin ninguna.
PROB_DEGRADACION = 0.4


def degradar(img: np.ndarray, params: dict, semilla: int | tuple = 0) -> np.ndarray:
    """RGB uint8 (h, w, 3) -> misma forma. Orden fijo, el de una camara:
    geometria y optica, luz, ruido del sensor y compresion al final."""
    lado = img.shape[1], img.shape[0]
    pil = Image.fromarray(img)
    if params.get("rotacion"):
        # Borde replicado, como el warpAffine del servicio (BORDER_REPLICATE).
        # Con relleno negro (primera version, 2026-11-17) una rotacion de 15
        # grados daba 24 falsos sin_senales aceptados en OOF; con borde
        # replicado, 8: las esquinas negras eran parte del efecto medido.
        m = round(0.2 * max(lado))  # cubre las esquinas hasta ~25 grados
        grande = Image.fromarray(np.pad(img, ((m, m), (m, m), (0, 0)), mode="edge"))
        pil = grande.rotate(params["rotacion"], resample=Image.Resampling.BILINEAR).crop(
            (m, m, m + lado[0], m + lado[1]))
    if params.get("resolucion") and params["resolucion"] < min(lado):
        f = params["resolucion"] / min(lado)
        chico = (max(1, round(lado[0] * f)), max(1, round(lado[1] * f)))
        pil = pil.resize(chico, Image.Resampling.BOX).resize(lado, Image.Resampling.BILINEAR)
    if params.get("desenfoque"):
        pil = pil.filter(ImageFilter.GaussianBlur(params["desenfoque"]))
    x = np.asarray(pil, dtype=np.float32)
    if "brillo" in params:
        x = x * params["brillo"]
    if params.get("ruido"):
        x = x + np.random.default_rng(semilla).normal(0, params["ruido"], x.shape)
    x = np.clip(np.round(x), 0, 255).astype(np.uint8)
    if params.get("jpeg"):
        buf = io.BytesIO()
        Image.fromarray(x).save(buf, "JPEG", quality=int(params["jpeg"]))
        x = np.asarray(Image.open(buf).convert("RGB"))
    return x


def aleatoria(semilla: int | tuple) -> dict:
    """Parametros de una vista aumentada. Misma semilla, mismos parametros.
    Una tupla (semilla global, vista, foto) da una secuencia independiente por
    foto y vista sin inventar desplazamientos."""
    rng = np.random.default_rng(semilla)
    params = {}
    for clave, (lo, hi) in RANGOS.items():
        if rng.random() < PROB_DEGRADACION:
            valor = rng.uniform(lo, hi)
            params[clave] = round(valor) if clave in ("jpeg", "resolucion") else float(valor)
    return params


def brillo(img: np.ndarray) -> float:
    """Media del gris BT.601 (0-255), el mismo de cv2.COLOR_RGB2GRAY: el
    servicio debe medir igual para que brillo_minimo signifique lo mismo."""
    return float((img[..., :3].astype(np.float64) @ np.array([0.299, 0.587, 0.114])).mean())
