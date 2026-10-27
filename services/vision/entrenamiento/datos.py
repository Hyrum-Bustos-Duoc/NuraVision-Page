"""Inventario, validacion, normalizacion y particion del dataset.

Logica pura (Pillow + numpy): no importa TensorFlow, se prueba sin GPU.
Layout esperado: <dataset>/<tarea>/<clase>/<foto>.jpg|.png
"""

import csv
import hashlib
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from sklearn.utils.class_weight import compute_class_weight

# Formato real detectado por Pillow al decodificar, no la extension del archivo.
FORMATOS = {"JPEG", "PNG"}
PARTICIONES = ("train", "val", "test")


def inventariar(raiz_tarea: Path, clases: list[str], lado_minimo: int) -> tuple[list[dict], list[dict]]:
    """Devuelve (validas, rechazadas). Cada valida: archivo, clase, sha256.

    Nunca procesa una foto que no paso la validacion: la rechaza con motivo.
    """
    carpetas = {p.name for p in raiz_tarea.iterdir() if p.is_dir()}
    # Una carpeta que no es clase suele ser un error de tipeo: sus fotos se
    # perderian en silencio. Una clase sin carpeta no se puede entrenar.
    if carpetas != set(clases):
        raise ValueError(
            f"{raiz_tarea}: carpetas {sorted(carpetas)} no coinciden con las clases {sorted(clases)}"
        )

    candidatas, rechazadas = [], []
    for clase in clases:
        for ruta in sorted((raiz_tarea / clase).iterdir()):
            if ruta.name.startswith(".") or not ruta.is_file():
                continue
            archivo = f"{clase}/{ruta.name}"
            motivo = _motivo_rechazo(ruta, lado_minimo)
            if motivo:
                rechazadas.append({"archivo": archivo, "motivo": motivo})
            else:
                sha = hashlib.sha256(ruta.read_bytes()).hexdigest()
                candidatas.append({"archivo": archivo, "clase": clase, "sha256": sha})

    validas, duplicadas = _deduplicar(candidatas)
    return validas, rechazadas + duplicadas


def _motivo_rechazo(ruta: Path, lado_minimo: int) -> str | None:
    try:
        with Image.open(ruta) as img:
            # load() decodifica entera: detecta archivos truncados aqui y no a
            # mitad de una epoca en Colab.
            img.load()
            formato, lado = img.format, min(img.size)
    except (UnidentifiedImageError, OSError):
        return "formato_no_soportado"
    if formato not in FORMATOS:
        return "formato_no_soportado"
    if lado < lado_minimo:
        return "resolucion_insuficiente"
    return None


def _deduplicar(candidatas: list[dict]) -> tuple[list[dict], list[dict]]:
    """Una foto identica (mismo sha256) solo puede aparecer una vez.

    - Misma clase: se conserva la primera por nombre. Si quedaran ambas, podria
      caer una en train y otra en test e inflar las metricas.
    - Clases distintas: etiqueta contradictoria, se descartan todas las copias.
    """
    por_hash: dict[str, list[dict]] = {}
    for item in candidatas:
        por_hash.setdefault(item["sha256"], []).append(item)

    validas, rechazadas = [], []
    for copias in por_hash.values():
        if len({c["clase"] for c in copias}) > 1:
            rechazadas += [{"archivo": c["archivo"], "motivo": "etiqueta_conflictiva"} for c in copias]
            continue
        validas.append(copias[0])
        rechazadas += [{"archivo": c["archivo"], "motivo": "duplicado_exacto"} for c in copias[1:]]
    return sorted(validas, key=lambda i: i["archivo"]), rechazadas


def dividir(validas: list[dict], clases: list[str], val: float, test: float, semilla: int) -> dict:
    """Particion estratificada train/val/test, reproducible.

    Cada clase se baraja con su propio generador (semilla + clase), sobre la
    lista ordenada por sha256: el resultado no depende del orden del sistema de
    archivos ni de que se anadan o quiten otras clases.
    """
    archivos = []
    for clase in clases:
        items = sorted((i for i in validas if i["clase"] == clase), key=lambda i: i["sha256"])
        # 3 es el minimo fisico (una foto por particion), no una recomendacion.
        if len(items) < 3:
            raise ValueError(f"clase {clase}: {len(items)} fotos validas, minimo 3")
        random.Random(f"{semilla}-{clase}").shuffle(items)
        n_test = max(1, round(len(items) * test))
        n_val = max(1, round(len(items) * val))
        for i, item in enumerate(items):
            particion = "test" if i < n_test else "val" if i < n_test + n_val else "train"
            archivos.append({**item, "particion": particion})

    archivos.sort(key=lambda i: i["archivo"])
    conteos = {p: {c: 0 for c in clases} for p in PARTICIONES}
    for a in archivos:
        conteos[a["particion"]][a["clase"]] += 1
    return {
        "semilla": semilla,
        "fracciones": {"val": val, "test": test},
        "clases": clases,
        "conteos": conteos,
        "huella": _huella(archivos),
        "archivos": archivos,
    }


def _huella(archivos: list[dict]) -> str:
    return hashlib.sha256(json.dumps(archivos, sort_keys=True).encode()).hexdigest()


def verificar(manifiesto: dict) -> None:
    """Falla si una foto (por ruta o por contenido) esta en dos particiones o
    si el manifiesto fue alterado despues de generarse."""
    archivos = manifiesto["archivos"]
    if _huella(archivos) != manifiesto["huella"]:
        raise ValueError("la huella no coincide: el manifiesto fue modificado")
    vistos: dict[str, str] = {}
    for a in archivos:
        for clave in (a["archivo"], a["sha256"]):
            if vistos.setdefault(clave, a["particion"]) != a["particion"]:
                raise ValueError(f"{a['archivo']} aparece en dos particiones")
    if len({a["archivo"] for a in archivos}) != len(archivos):
        raise ValueError("ruta repetida en el manifiesto")


def de_particion(manifiesto: dict, particion: str) -> tuple[list[str], list[int]]:
    """(rutas relativas, indices de clase) de una particion, en orden estable."""
    indice = {c: i for i, c in enumerate(manifiesto["clases"])}
    items = [a for a in manifiesto["archivos"] if a["particion"] == particion]
    return [a["archivo"] for a in items], [indice[a["clase"]] for a in items]


def cargar_imagen(ruta: Path, lado: int) -> np.ndarray:
    """Normalizacion: RGB uint8 (lado, lado, 3).

    - exif_transpose: los moviles guardan la rotacion en EXIF y TensorFlow la
      ignora; sin esto una foto vertical entra girada 90 grados.
    - pad (no estirar ni recortar): estirar deforma la proporcion largo/ancho,
      que es justo lo que separa almendra de ovalada; recortar puede cortar la una.
    La inferencia debe usar esta misma funcion para no desalinear entrada.
    """
    with Image.open(ruta) as img:
        rgb = ImageOps.exif_transpose(img).convert("RGB")
        return np.asarray(ImageOps.pad(rgb, (lado, lado)), dtype=np.uint8)


def pesos_de_clase(etiquetas: list[int], n_clases: int) -> dict[int, float]:
    """Pesos 'balanced' para compensar desbalance entre clases en train."""
    clases = np.arange(n_clases)
    pesos = compute_class_weight("balanced", classes=clases, y=np.asarray(etiquetas))
    return {int(c): float(p) for c, p in zip(clases, pesos)}


def cargar_subgrupos(raiz_tarea: Path) -> dict[str, dict[str, str]]:
    """Lee <tarea>/subgrupos.csv si existe: archivo,<dimension>,<dimension>...

    Las dimensiones (tono_piel, luz, fondo, esmalte...) son libres. Sirven para
    medir si el modelo falla mas con un tono de piel o un tipo de luz: un sesgo
    asi es sistematico y silencioso si no se mide por separado.
    """
    ruta = raiz_tarea / "subgrupos.csv"
    if not ruta.exists():
        return {}
    with open(ruta, newline="", encoding="utf-8") as f:
        return {fila.pop("archivo"): fila for fila in csv.DictReader(f)}
