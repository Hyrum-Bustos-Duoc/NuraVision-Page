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


def cargar_series(ruta: Path) -> list[dict]:
    """Filas de un CSV `archivo,serie`. Una serie agrupa fotos de la misma una
    (recortes, encuadres o copias de una misma imagen). Se valida contra el
    dataset en asignar_series."""
    with open(ruta, newline="", encoding="utf-8") as f:
        lector = csv.DictReader(f)
        if not {"archivo", "serie"} <= set(lector.fieldnames or ()):
            raise ValueError("archivo de series: faltan las columnas archivo,serie")
        return list(lector)


def asignar_series(validas: list[dict], rechazadas: list[dict], filas: list[dict]) -> tuple[list[dict], list[dict]]:
    """Anade `serie` a cada valida (None si la foto no figura: es una serie por
    si sola) y rechaza entera, como etiqueta_conflictiva, la serie que mezcla
    clases: la misma una no puede ser dos cosas.

    Una fila que nombra una foto que no esta en el dataset, sin serie o que pone
    la misma foto en dos series hace fallar todo: el error solo da el numero de
    filas, porque un nombre de archivo puede identificar a una persona.
    """
    conocidos = {i["archivo"] for i in validas} | {r["archivo"] for r in rechazadas}
    serie_de: dict[str, str] = {}
    invalidas = 0
    for fila in filas:
        archivo, serie = (fila["archivo"] or "").strip(), (fila["serie"] or "").strip()
        if archivo not in conocidos or not serie or serie_de.setdefault(archivo, serie) != serie:
            invalidas += 1
    if invalidas:
        raise ValueError(
            f"archivo de series: {invalidas} filas invalidas (foto que no esta en el dataset, "
            "serie vacia o foto en dos series)"
        )

    clases_de: dict[str, set[str]] = {}
    for item in validas:
        if item["archivo"] in serie_de:
            clases_de.setdefault(serie_de[item["archivo"]], set()).add(item["clase"])
    conflictivas = {s for s, c in clases_de.items() if len(c) > 1}

    con_serie, extra = [], []
    for item in validas:
        serie = serie_de.get(item["archivo"])
        if serie in conflictivas:
            extra.append({"archivo": item["archivo"], "motivo": "etiqueta_conflictiva"})
        else:
            con_serie.append({**item, "serie": serie})
    return con_serie, rechazadas + extra


def _unidades(items: list[dict]) -> list[list[dict]]:
    """Grupos que no se separan: cada serie, y cada foto sin serie por su cuenta.

    Ordenados por el menor sha256 de cada grupo. Sin series, cada grupo es una
    foto y el orden es el mismo que antes de existir las series: la particion
    (y su huella) de forma y estado no cambia.
    """
    grupos: dict[tuple, list[dict]] = {}
    for item in sorted(items, key=lambda i: i["sha256"]):
        clave = ("serie", item["serie"]) if item.get("serie") else ("foto", item["archivo"])
        grupos.setdefault(clave, []).append(item)
    return list(grupos.values())


def dividir(validas: list[dict], clases: list[str], val: float, test: float, semilla: int) -> dict:
    """Particion estratificada train/val/test, reproducible.

    Cada clase se baraja con su propio generador (semilla + clase), sobre la
    lista ordenada por sha256: el resultado no depende del orden del sistema de
    archivos ni de que se anadan o quiten otras clases. Si las fotos traen
    `serie` (asignar_series), cada serie cae entera en una sola particion.
    """
    archivos = []
    for clase in clases:
        items = [i for i in validas if i["clase"] == clase]
        unidades = _unidades(items)
        # 3 es el minimo fisico (una serie por particion), no una recomendacion.
        if len(unidades) < 3:
            raise ValueError(f"clase {clase}: {len(items)} fotos validas en {len(unidades)} series, minimo 3 series")
        random.Random(f"{semilla}-{clase}").shuffle(unidades)
        n_test = max(1, round(len(items) * test))
        n_val = max(1, round(len(items) * val))
        cuenta = {"test": 0, "val": 0, "train": 0}
        for k, unidad in enumerate(unidades):
            # Una serie grande puede pasarse del objetivo: se llena test, luego
            # val, y siempre se reserva al menos una serie para cada particion
            # siguiente. Con una foto por serie da lo mismo que cortar la lista.
            quedan = len(unidades) - k
            if cuenta["test"] < n_test and quedan >= 3:
                particion = "test"
            elif cuenta["val"] < n_val and quedan >= 2:
                particion = "val"
            else:
                particion = "train"
            cuenta[particion] += len(unidad)
            archivos += [{**item, "particion": particion} for item in unidad]

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


def pliegues(items: list[dict], clases: list[str], n: int, semilla: int) -> list[tuple[np.ndarray, np.ndarray]]:
    """K pliegues (indices train, indices evaluados) estratificados por clase y
    agrupados por serie: una serie nunca queda a ambos lados. Una foto sin
    serie es su propio grupo. Para la validacion cruzada de busqueda_clinica."""
    # Import local: services/api/tests importa este modulo con un sklearn
    # simulado que solo trae class_weight (el API no instala scikit-learn).
    from sklearn.model_selection import StratifiedGroupKFold

    y = [clases.index(i["clase"]) for i in items]
    g = [i.get("serie") or f"foto:{i['archivo']}" for i in items]
    return list(StratifiedGroupKFold(n, shuffle=True, random_state=semilla).split(np.zeros(len(y)), y, g))


def _huella(archivos: list[dict]) -> str:
    return hashlib.sha256(json.dumps(archivos, sort_keys=True).encode()).hexdigest()


def verificar(manifiesto: dict) -> None:
    """Falla si una foto (por ruta o por contenido) o una serie esta en dos
    particiones, o si el manifiesto fue alterado despues de generarse."""
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
    particion_de_serie: dict[str, str] = {}
    for a in archivos:
        if a.get("serie") and particion_de_serie.setdefault(a["serie"], a["particion"]) != a["particion"]:
            raise ValueError(f"la serie {a['serie']} aparece en dos particiones")


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
