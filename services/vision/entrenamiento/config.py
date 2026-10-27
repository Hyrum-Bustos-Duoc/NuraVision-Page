"""Carga y valida config.toml. Logica pura: no importa TensorFlow."""

import tomllib
from pathlib import Path

RUTA_POR_DEFECTO = Path(__file__).resolve().parent.parent / "config.toml"

# Solo arquitecturas cuyo modelo Keras incluye el reescalado de entrada y por
# tanto reciben RGB 0-255 tal cual. MobileNetV2 (y ResNet, etc.) exigen
# preprocess_input externo: si se colaran aqui, el modelo entrenaria con la
# escala equivocada sin dar ningun error.
ARQUITECTURAS = {
    "MobileNetV3Small",
    "MobileNetV3Large",
    "EfficientNetB0",
    "EfficientNetB1",
    "EfficientNetB2",
}

# Este sistema hace observacion estetica, no diagnostico. Una clase con estos
# terminos convertiria el clasificador en un dispositivo medico de facto, con
# un dataset que no lo soporta: un falso negativo confiado sobre una lesion es
# el peor resultado posible. Se rechaza al cargar, no se confia en la revision.
TERMINOS_CLINICOS = (
    "hongo", "micosis", "onicomicosis", "psoriasis", "melanoma", "cancer",
    "tumor", "infeccion", "paroniquia", "onicolisis", "lesion", "enfermedad",
)


def cargar_config(ruta: Path = RUTA_POR_DEFECTO) -> dict:
    with open(ruta, "rb") as f:
        cfg = tomllib.load(f)
    _validar(cfg)
    return cfg


def _validar(cfg: dict) -> None:
    p = cfg["particion"]
    if not (0 < p["val"] < 1 and 0 < p["test"] < 1 and p["val"] + p["test"] < 1):
        raise ValueError("particion: val y test deben ser fracciones con val + test < 1")

    desconocidas = set(cfg["entrenamiento"]["arquitecturas"]) - ARQUITECTURAS
    if desconocidas:
        raise ValueError(f"arquitecturas no soportadas: {sorted(desconocidas)}")

    if not 0 < cfg["umbral"]["precision_objetivo"] <= 1:
        raise ValueError("umbral.precision_objetivo debe estar en (0, 1]")

    for nombre, tarea in cfg["tareas"].items():
        clases = tarea["clases"]
        if len(clases) < 2 or len(set(clases)) != len(clases):
            raise ValueError(f"tarea {nombre}: se necesitan 2+ clases sin repetir")
        clinicas = [c for c in clases if any(t in c.lower() for t in TERMINOS_CLINICOS)]
        if clinicas:
            raise ValueError(f"tarea {nombre}: clases clinicas no permitidas: {clinicas}")
        if not set(tarea["revision_profesional"]) <= set(clases):
            raise ValueError(f"tarea {nombre}: revision_profesional usa clases inexistentes")


def tarea(cfg: dict, nombre: str) -> dict:
    if nombre not in cfg["tareas"]:
        raise ValueError(f"tarea desconocida: {nombre}. Opciones: {sorted(cfg['tareas'])}")
    return cfg["tareas"][nombre]
