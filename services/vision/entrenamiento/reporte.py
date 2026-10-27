"""Tabla markdown de la comparativa (evidencia de Sprint Review). Logica pura."""


def _pct(x: float | None) -> str:
    return "-" if x is None else f"{x:.1%}"


def tabla_markdown(reporte: dict) -> str:
    clases = reporte["particion"]["clases"]
    lineas = [
        f"# Comparativa de arquitecturas: tarea `{reporte['tarea']}`",
        "",
        f"- Fecha: {reporte['fecha']}",
        f"- Particion: huella `{reporte['particion']['huella'][:12]}`, semilla {reporte['particion']['semilla']}, "
        f"conteos {reporte['particion']['conteos']}",
        f"- Fotos rechazadas por validacion: {reporte['rechazadas'] or 'ninguna'}",
        f"- Entorno: {reporte['entorno']}",
        f"- Umbral no_concluyente calibrado en val para precision >= {_pct(reporte['precision_objetivo'])}",
        f"- Ganador (mayor F1 macro en validacion): **{reporte['ganador']}**",
        "",
        "Metricas sobre test. Cobertura = fraccion de fotos con resultado (el resto es no_concluyente).",
        "",
        "| Arquitectura | Parametros | MB | Latencia ms | Accuracy | Precision | Recall | F1 | Umbral | Cobertura | Precision aceptadas |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in reporte["resultados"]:
        t, u = r["test"], r["umbral"]["test"]
        umbral = "ninguno" if u["umbral"] is None else f"{u['umbral']:.3f}"
        lineas.append(
            f"| {r['arquitectura']} | {r['parametros']:,} | {r['tamano_mb']:.1f} | {r['latencia_ms']:.1f} "
            f"| {_pct(t['accuracy'])} | {_pct(t['precision_macro'])} | {_pct(t['recall_macro'])} "
            f"| {_pct(t['f1_macro'])} | {umbral} | {_pct(u['cobertura'])} | {_pct(u['precision_aceptadas'])} |"
        )

    for r in reporte["resultados"]:
        lineas += ["", f"## {r['arquitectura']}", "", "| Clase | Precision | Recall | F1 | Soporte |", "|---|---|---|---|---|"]
        for c, m in r["test"]["por_clase"].items():
            lineas.append(f"| {c} | {_pct(m['precision'])} | {_pct(m['recall'])} | {_pct(m['f1'])} | {m['soporte']} |")
        lineas += ["", "Matriz de confusion (filas = real, columnas = predicha):", "",
                   "| | " + " | ".join(clases) + " |", "|---" * (len(clases) + 1) + "|"]
        for c, fila in zip(clases, r["test"]["matriz_confusion"]):
            lineas.append(f"| {c} | " + " | ".join(str(v) for v in fila) + " |")
        for dim, valores in r["subgrupos_test"].items():
            lineas += ["", f"Accuracy por `{dim}`: " + ", ".join(
                f"{v} {_pct(m['accuracy'])} (n={m['n']})" for v, m in valores.items())]

    lineas += ["", "_Observacion estetica orientativa. No es un diagnostico medico._", ""]
    return "\n".join(lineas)
