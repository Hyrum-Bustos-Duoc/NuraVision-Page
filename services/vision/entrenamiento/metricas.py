"""Metricas, umbral de no_concluyente y eleccion del modelo. Logica pura."""

import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support


def metricas(y_true, y_pred, clases: list[str]) -> dict:
    """Accuracy, precision/recall/F1 macro y por clase, matriz de confusion.

    Macro y no ponderado: con clases desbalanceadas el promedio ponderado
    esconde que el modelo ignora la clase minoritaria.
    """
    etiquetas = list(range(len(clases)))
    p, r, f, s = precision_recall_fscore_support(
        y_true, y_pred, labels=etiquetas, zero_division=0
    )
    return {
        "n": len(y_true),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(np.mean(p)),
        "recall_macro": float(np.mean(r)),
        "f1_macro": float(np.mean(f)),
        "por_clase": {
            c: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "soporte": int(s[i])}
            for i, c in enumerate(clases)
        },
        # filas = clase real, columnas = clase predicha, en el orden de `clases`
        "matriz_confusion": confusion_matrix(y_true, y_pred, labels=etiquetas).tolist(),
    }


def calibrar_umbral(probs: np.ndarray, y_true, precision_objetivo: float) -> float | None:
    """Menor umbral de confianza cuyas predicciones aceptadas alcanzan la
    precision objetivo en validacion (= mayor cobertura posible).

    Devuelve None si ningun umbral la alcanza: el modelo no debe afirmar nada
    y todo resultado sera no_concluyente. Se calibra en val, nunca en test.
    """
    confianza = probs.max(axis=1)
    acierto = probs.argmax(axis=1) == np.asarray(y_true)
    for umbral in np.unique(confianza):  # ascendente: el primero que cumple cubre mas
        aceptadas = confianza >= umbral
        if acierto[aceptadas].mean() >= precision_objetivo:
            return float(umbral)
    return None


def evaluar_umbral(probs: np.ndarray, y_true, umbral: float | None) -> dict:
    """Cobertura (fraccion que NO es no_concluyente) y precision de lo aceptado."""
    if umbral is None:
        return {"umbral": None, "cobertura": 0.0, "n_aceptadas": 0, "precision_aceptadas": None}
    aceptadas = probs.max(axis=1) >= umbral
    acierto = probs.argmax(axis=1) == np.asarray(y_true)
    n = int(aceptadas.sum())
    return {
        "umbral": umbral,
        "cobertura": float(aceptadas.mean()),
        "n_aceptadas": n,
        "precision_aceptadas": float(acierto[aceptadas].mean()) if n else None,
    }


def por_subgrupo(archivos: list[str], y_true, y_pred, subgrupos: dict[str, dict[str, str]]) -> dict:
    """Accuracy por cada valor de cada dimension anotada (tono_piel, luz...).

    Solo n y accuracy: con pocas fotos por subgrupo un F1 macro seria ruido.
    """
    if not subgrupos:
        return {}
    acierto = np.asarray(y_true) == np.asarray(y_pred)
    dimensiones = sorted({d for fila in subgrupos.values() for d in fila})
    resultado = {}
    for dim in dimensiones:
        valores = np.array([subgrupos.get(a, {}).get(dim) or "sin_anotar" for a in archivos])
        resultado[dim] = {
            str(v): {"n": int((valores == v).sum()), "accuracy": float(acierto[valores == v].mean())}
            for v in np.unique(valores)
        }
    return resultado


def elegir_ganador(resultados: list[dict]) -> dict:
    """Mayor F1 macro en VALIDACION; empate, menos parametros.

    No se elige con test: elegir con test y reportar test sobreestima el
    rendimiento real. Test solo se mira para el informe.
    """
    return max(resultados, key=lambda r: (r["val"]["f1_macro"], -r["parametros"]))
