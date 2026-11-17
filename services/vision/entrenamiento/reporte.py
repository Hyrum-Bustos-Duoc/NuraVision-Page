"""Tabla markdown de la comparativa (evidencia de Sprint Review). Logica pura."""

from .config import TAREA_CLINICA


def _pct(x: float | None) -> str:
    return "-" if x is None else f"{x:.1%}"


def _clinico(c: dict) -> list[str]:
    """Abstencion por clase y veredicto M1-M4 de estado_clinico."""
    u = c["umbral_sin_senales"]
    lineas = [
        "", f"Umbral sin_senales (calibrado en val): {'ninguno: nunca afirma sin_senales' if u is None else f'{u:.3f}'}",
        "", "Test despues de abstenerse (las cuatro primeras columnas suman n):", "",
        "| Clase | n | Aceptadas correctas | Abstenidas | Aceptadas como otra clase | Aceptadas como sin_senales "
        "| Recall estricto | IC 95 % (Wilson) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for clase, m in c["por_clase"].items():
        ic = "-" if m["ic95"] is None else f"{_pct(m['ic95'][0])}-{_pct(m['ic95'][1])}"
        lineas.append(
            f"| {clase} | {m['n']} | {m['aceptadas_correctas']} | {m['abstenidas']} | {m['aceptadas_otra_clase']} "
            f"| {m['aceptadas_sin_senales']} | {_pct(m['recall_estricto'])} | {ic} |"
        )
    lineas += ["", "| Criterio | Valor | Limite | Veredicto |", "|---|---|---|---|"]
    for criterio, a in c["aceptacion"].items():
        valor = a["valor"] if isinstance(a["valor"], int) or a["valor"] is None else _pct(a["valor"])
        limite = a["limite"] if isinstance(a["limite"], int) else _pct(a["limite"])
        signo = "<=" if a["tipo"] == "max" else ">="
        veredicto = "cumple" if a["cumple"] else "no cumple"
        lineas.append(f"| {criterio} | {'-' if valor is None else valor} | {signo} {limite} | {veredicto} |")
    return lineas


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
        if "clinico" in r:
            lineas += _clinico(r["clinico"])

    aviso = ("Senal orientativa para consultar con un profesional de la salud" if reporte["tarea"] == TAREA_CLINICA
             else "Observacion estetica orientativa")
    lineas += ["", f"_{aviso}. No es un diagnostico medico._", ""]
    return "\n".join(lineas)
