"""Arnes de fotos reales: mide el analisis del servicio sobre fotos de celular.

  services/api/.venv/bin/python -I services/vision/entrenamiento/arnes.py \
      --fotos DIR --salida DIR [--anotacion CSV]

Cada foto pasa por POST /vision/analizar de la app de services/api, en proceso
(TestClient): MediaPipe, forma y bloque clinico son exactamente los del
servicio, sin copiar su codigo. Los modelos se eligen igual que al arrancar el
servicio (VISION_MODELO, VISION_SEGMENTADOR, VISION_CLINICO; ver
services/api/README.md). Para comparar la latencia con y sin clasificador
clinico se ejecuta dos veces; resumen.json guarda lo que informo /salud en
cada ejecucion.

Anotacion opcional, CSV: archivo,dedo,clase,<subgrupos libres...>. `archivo`
es la ruta relativa a --fotos; `dedo` vacio aplica la fila a todas las unas de
la foto; `clase` es la esperada (ids de estado_clinico). Las demas columnas
(tono_piel, luz, esmalte...) desglosan las metricas.

Fotos, anotacion y resultados son de personas reales: el arnes se niega a
leerlos o escribirlos dentro del repositorio, y la consola solo muestra
conteos y metricas, nunca nombres de archivo.
"""

import argparse
import csv
import json
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

if __package__ in (None, ""):  # ejecutado como script (python -I no anade su carpeta)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from entrenamiento.config import CLASES_CLINICAS, RAIZ_REPO, SENALES_GRAVES, SIN_SENALES, exigir_fuera_del_repo  # noqa: E402

# Criterios H1-H3 de design.md (reporte-clinico-unas): propuesta pendiente de
# Q4. Si el dueno los cambia, se cambian aqui con la fecha.
ACEPTACION = {
    "H1": ("max", 0),     # unas anotadas SENALES_GRAVES informadas como sin_senales
    "H2": ("max", 0.10),  # fraccion de unas anotadas sin_senales con otra senal ok (falsa alarma)
    "H3": ("max", 0),     # respuestas distintas de 200
}
DEDOS = ("pulgar", "indice", "medio", "anular", "menique")
# Lo que devuelve el servicio sin clasificador. Un servicio anterior a la tarea
# 3.2 no envia `clinico`: cuenta igual, como hace el frontend.
SIN_MODELO = {"estado": "no_concluyente", "motivo": "modelo_no_entrenado", "clase": None}


def cargar_anotacion(ruta: Path) -> dict[tuple[str, str | None], dict]:
    """{(archivo, dedo o None): {"clase": id o None, "subgrupos": {...}}}.

    Una fila con dedo o clase fuera de la lista hace fallar todo: medir con una
    anotacion mal escrita da metricas falsas. El error solo da el numero de filas.
    """
    with open(ruta, newline="", encoding="utf-8") as f:
        lector = csv.DictReader(f)
        if "archivo" not in (lector.fieldnames or ()):
            raise ValueError("anotacion: falta la columna archivo")
        filas = list(lector)
    anotacion, invalidas = {}, 0
    for fila in filas:
        archivo = (fila.pop("archivo") or "").strip()
        dedo = (fila.pop("dedo", "") or "").strip() or None
        clase = (fila.pop("clase", "") or "").strip() or None
        if not archivo or dedo not in (None, *DEDOS) or clase not in (None, *CLASES_CLINICAS) \
                or (archivo, dedo) in anotacion:
            invalidas += 1
            continue
        subgrupos = {k: v.strip() for k, v in fila.items() if k and v and v.strip()}
        anotacion[(archivo, dedo)] = {"clase": clase, "subgrupos": subgrupos}
    if invalidas:
        raise ValueError(f"anotacion: {invalidas} filas invalidas (sin archivo, dedo o clase desconocidos, o repetidas)")
    return anotacion


def analizar_carpeta(cliente, fotos: Path) -> list[dict]:
    """Un registro por archivo. No guarda el recorte, las esquinas ni el
    contorno: el resultado del arnes no debe volver a contener la imagen."""
    registros = []
    for ruta in sorted(p for p in fotos.rglob("*") if p.is_file() and not p.name.startswith(".")):
        contenido = ruta.read_bytes()
        t0 = time.perf_counter()
        # Nombre generico: el nombre real del archivo no sale del arnes.
        r = cliente.post("/vision/analizar", files={"foto": ("foto", contenido)})
        registro = {"archivo": ruta.relative_to(fotos).as_posix(), "http": r.status_code,
                    "latencia_ms": (time.perf_counter() - t0) * 1000}
        try:
            cuerpo = r.json()
        except ValueError:  # un 500 de Starlette es texto plano
            cuerpo = {}
        if r.status_code != 200:
            registro["codigo"] = cuerpo.get("codigo", "error_interno")
        else:
            registro |= {
                "estado": cuerpo["estado"],
                "motivo": cuerpo["motivo"],
                "manos": cuerpo["manos"],
                "unas": [
                    {"dedo": u["dedo"], "mano": u["mano"], "forma": u.get("forma"),
                     "clinico": u.get("clinico") or SIN_MODELO}
                    for u in cuerpo["unas"]
                ],
            }
        registros.append(registro)
    return registros


def _veredicto(criterio: str, valor) -> dict:
    tipo, limite = ACEPTACION[criterio]
    if valor is None:
        return {"valor": None, "limite": limite, "cumple": None}  # sin anotacion
    return {"valor": valor, "limite": limite, "cumple": valor <= limite if tipo == "max" else valor >= limite}


def resumir(registros: list[dict], anotacion: dict) -> dict:
    """Metricas H1-H3 y las informativas de design.md. Funcion pura."""
    ok = [r for r in registros if r["http"] == 200]
    unas = []  # (clinico, anotacion de esa una o None)
    for r in ok:
        for u in r["unas"]:
            nota = anotacion.get((r["archivo"], u["dedo"])) or anotacion.get((r["archivo"], None))
            unas.append((u["clinico"], nota))

    def afirma(clinico, clase=None):
        return clinico["estado"] == "ok" and (clase is None or clinico["clase"] == clase)

    graves = [c for c, n in unas if n and n["clase"] in SENALES_GRAVES]
    sin_senales = [c for c, n in unas if n and n["clase"] == SIN_SENALES]
    falsas = [c for c in sin_senales if afirma(c) and c["clase"] != SIN_SENALES]

    subgrupos: dict[str, dict[str, Counter]] = {}
    for clinico, nota in unas:
        for dim, valor in (nota or {}).get("subgrupos", {}).items():
            cuenta = subgrupos.setdefault(dim, {}).setdefault(valor, Counter())
            cuenta["unas"] += 1
            cuenta["ok"] += afirma(clinico)
            cuenta["anotadas_sin_senales"] += nota["clase"] == SIN_SENALES
            cuenta["falsas_alarmas"] += nota["clase"] == SIN_SENALES and afirma(clinico) and clinico["clase"] != SIN_SENALES

    archivos = {r["archivo"] for r in registros}
    latencias = [r["latencia_ms"] for r in registros]
    return {
        "fotos": len(registros),
        "fotos_con_mano": sum(1 for r in ok if r["manos"] > 0),
        "unas": len(unas),
        "unas_por_foto": dict(sorted(Counter(len(r["unas"]) for r in ok).items())),
        "cobertura": sum(afirma(c) for c, _ in unas) / len(unas) if unas else None,
        "estado": dict(Counter(c["estado"] for c, _ in unas)),
        "motivo": dict(Counter(c["motivo"] for c, _ in unas if c["estado"] != "ok")),
        "clase": dict(Counter(c["clase"] for c, _ in unas if c["estado"] == "ok")),
        "errores": dict(Counter(r["codigo"] for r in registros if r["http"] != 200)),
        "latencia_ms": {"p50": float(np.percentile(latencias, 50)), "p95": float(np.percentile(latencias, 95))}
        if latencias else None,
        "anotaciones_sin_foto": sum(1 for archivo, _ in anotacion if archivo not in archivos),
        "aceptacion": {
            "H1": _veredicto("H1", sum(afirma(c, SIN_SENALES) for c in graves) if graves else None),
            "H2": _veredicto("H2", len(falsas) / len(sin_senales) if sin_senales else None),
            "H3": _veredicto("H3", len(registros) - len(ok)),
        },
        "subgrupos": {d: {v: dict(c) for v, c in vals.items()} for d, vals in subgrupos.items()},
    }


def _pct(x: float | None) -> str:
    return "-" if x is None else f"{x:.0%}"


def consola(resumen: dict) -> str:
    """Solo conteos y metricas: ni un nombre de archivo."""
    lat = resumen["latencia_ms"]
    latencia = "-" if lat is None else f"p50 {lat['p50']:.0f}, p95 {lat['p95']:.0f}"
    lineas = [
        f"fotos: {resumen['fotos']}, con mano: {resumen['fotos_con_mano']}, unas: {resumen['unas']}",
        f"unas por foto (unas: fotos): {resumen['unas_por_foto']}",
        f"cobertura clinica: {_pct(resumen['cobertura'])}",
        f"estado: {resumen['estado']}  motivo: {resumen['motivo']}  clase: {resumen['clase']}",
        f"errores: {resumen['errores'] or 'ninguno'}",
        f"latencia ms: {latencia}",
        f"servicio: {resumen.get('salud')}",
    ]
    if resumen["anotaciones_sin_foto"]:
        lineas.append(f"filas de anotacion sin foto: {resumen['anotaciones_sin_foto']}")
    for criterio, v in resumen["aceptacion"].items():
        veredicto = "sin anotacion" if v["cumple"] is None else "cumple" if v["cumple"] else "no cumple"
        es_fraccion = isinstance(v["limite"], float)
        valor = _pct(v["valor"]) if es_fraccion else "-" if v["valor"] is None else v["valor"]
        limite = _pct(v["limite"]) if es_fraccion else v["limite"]
        lineas.append(f"{criterio}: {valor} (limite {limite}) {veredicto}")
    for dim, valores in resumen["subgrupos"].items():
        lineas.append(f"por {dim}: {valores}")
    return "\n".join(lineas)


def ejecutar(cliente, fotos: Path, anotacion: dict) -> tuple[list[dict], dict]:
    registros = analizar_carpeta(cliente, fotos)
    resumen = resumir(registros, anotacion)
    resumen["salud"] = cliente.get("/salud").json()
    return registros, resumen


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="arnes")
    parser.add_argument("--fotos", type=Path, required=True, help="carpeta de fotos, fuera del repositorio")
    parser.add_argument("--salida", type=Path, required=True, help="carpeta de resultados, fuera del repositorio")
    parser.add_argument("--anotacion", type=Path, help="CSV archivo,dedo,clase,<subgrupos>, fuera del repositorio")
    args = parser.parse_args(argv)
    # Antes de tocar ninguna foto ni cargar el servicio.
    exigir_fuera_del_repo(args.fotos, "--fotos")
    exigir_fuera_del_repo(args.salida, "--salida")
    if args.anotacion:
        exigir_fuera_del_repo(args.anotacion, "--anotacion")
    anotacion = cargar_anotacion(args.anotacion) if args.anotacion else {}

    sys.path.insert(0, str(RAIZ_REPO / "services" / "api"))
    from fastapi.testclient import TestClient
    from app.main import app

    # raise_server_exceptions=False: un 500 cuenta en H3, no corta la medicion.
    with TestClient(app, raise_server_exceptions=False) as cliente:
        registros, resumen = ejecutar(cliente, args.fotos, anotacion)
    args.salida.mkdir(parents=True, exist_ok=True)
    (args.salida / "resultados.json").write_text(json.dumps(registros, indent=1, ensure_ascii=False) + "\n")
    (args.salida / "resumen.json").write_text(json.dumps(resumen, indent=1, ensure_ascii=False) + "\n")
    print(consola(resumen))


if __name__ == "__main__":
    main()
