"""Carga y valida config.toml. Logica pura: no importa TensorFlow."""

import tomllib
from pathlib import Path

RUTA_POR_DEFECTO = Path(__file__).resolve().parent.parent / "config.toml"
# Raiz del repositorio. Las herramientas que leen fotos de personas o escriben
# listas con nombres de archivo se niegan a hacerlo aqui dentro: un `git add .`
# las subiria.
RAIZ_REPO = Path(__file__).resolve().parents[3]

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

# Las tareas esteticas (forma, estado) no pueden tener clases clinicas. Una
# clase con estos terminos convertiria el clasificador en un dispositivo medico
# de facto, con un dataset que no lo soporta: un falso negativo confiado sobre
# una lesion es el peor resultado posible. Se rechaza al cargar, no se confia
# en la revision. La unica excepcion es TAREA_CLINICA, con su lista cerrada.
# Incluye los equivalentes en ingles: los datasets publicos de unas (p. ej.
# datasets/kaggle_nail/) nombran sus carpetas en ingles, y copiar una de esas
# clases tal cual no debe colarse por diferencia de idioma.
TERMINOS_CLINICOS = (
    "hongo", "micosis", "onicomicosis", "psoriasis", "melanoma", "cancer",
    "tumor", "infeccion", "paroniquia", "onicolisis", "lesion", "enfermedad",
    "fungus", "fungal", "onychomycosis", "infection", "paronychia",
    "onycholysis", "disease", "clubbing",
)

# Decision del dueno del 2026-11-12 (openspec/changes/reporte-clinico-unas).
# Unica tarea que admite clases clinicas, y solo exactamente estas 9: ni una
# mas (tampoco melanoma) ni una menos. Viven aqui y no en config.toml para que
# levantar la guarda exija un diff de Python revisado, no editar un TOML.
# `sin_senales` y no "normal": el sistema puede decir que no ve las senales que
# conoce, nunca que una una esta sana. `otra` se entrena pero nunca sale del
# servicio.
TAREA_CLINICA = "estado_clinico"
SIN_SENALES = "sin_senales"
OTRA = "otra"
CLASES_CLINICAS = (
    "linea_beau", "linea_oscura", "acropaquia", "linea_mees", "onicolisis",
    "una_terry", "mancha_blanca", SIN_SENALES, OTRA,
)
# Senales en las que decir sin_senales seria el error mas grave (metricas M1
# del entrenamiento y H1 del arnes).
SENALES_GRAVES = ("linea_oscura", "acropaquia")

# Marca de las fichas de datasets externos (datasets/*/particion.toml). Esas
# fichas tienen clases clinicas y solo sirven para particionar: si una llega
# aqui como config de entrenamiento, se rechaza con un motivo claro.
USO_SOLO_PARTICION = "solo_particion"


def cargar_config(ruta: Path = RUTA_POR_DEFECTO) -> dict:
    with open(ruta, "rb") as f:
        cfg = tomllib.load(f)
    _validar(cfg)
    return cfg


def _validar(cfg: dict) -> None:
    if cfg.get("uso") == USO_SOLO_PARTICION:
        raise ValueError("es una ficha de dataset externo (solo particion), no una config de entrenamiento")
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
        if nombre == TAREA_CLINICA:
            if set(clases) != set(CLASES_CLINICAS):
                raise ValueError(
                    f"tarea {nombre}: las clases deben ser exactamente {list(CLASES_CLINICAS)}"
                )
        else:
            # Los ids clinicos se comprueban aparte: linea_beau, una_terry o
            # mancha_blanca no contienen ningun termino de la lista.
            clinicas = [
                c for c in clases
                if c in CLASES_CLINICAS or any(t in c.lower() for t in TERMINOS_CLINICOS)
            ]
            if clinicas:
                raise ValueError(f"tarea {nombre}: clases clinicas no permitidas: {clinicas}")
        if not set(tarea["revision_profesional"]) <= set(clases):
            raise ValueError(f"tarea {nombre}: revision_profesional usa clases inexistentes")
        if tarea.get("lado_minimo", 1) < 1:
            raise ValueError(f"tarea {nombre}: lado_minimo debe ser >= 1")


def lado_minimo(cfg: dict, nombre: str) -> int:
    """El de la tarea si lo declara; si no, el global de [imagen]."""
    return tarea(cfg, nombre).get("lado_minimo", cfg["imagen"]["lado_minimo"])


def exigir_fuera_del_repo(ruta: Path, que: str) -> None:
    """Falla si `ruta` cae dentro del repositorio (fotos, anotaciones o listas
    con nombres de archivo: un nombre puede identificar a una persona)."""
    if ruta.expanduser().resolve().is_relative_to(RAIZ_REPO):
        raise ValueError(f"{que} debe estar fuera del repositorio")


def tarea(cfg: dict, nombre: str) -> dict:
    if nombre not in cfg["tareas"]:
        raise ValueError(f"tarea desconocida: {nombre}. Opciones: {sorted(cfg['tareas'])}")
    return cfg["tareas"][nombre]
