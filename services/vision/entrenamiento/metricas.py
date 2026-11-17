"""Metricas, umbral de no_concluyente y eleccion del modelo. Logica pura."""

import math

import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

from .config import CLASES_NUNCA_NOMBRADAS, OTRA, SENALES_GRAVES, SIN_SENALES

# Criterios para habilitar el modelo de estado_clinico (design.md de
# reporte-clinico-unas). Son la propuesta, pendiente de Q4: si el dueno los
# cambia, se cambian aqui con la fecha. Con ~9 fotos de test por clase sirven
# para impedir habilitar un modelo malo, no para demostrar que uno es bueno.
ACEPTACION_CLINICA = {
    "M1": ("max", 0),     # fotos de SENALES_GRAVES aceptadas como sin_senales
    "M2": ("max", 1),     # fotos de cualquier otra clase (incluida otra) aceptadas como sin_senales
    "M3": ("min", 0.90),  # precision de las aceptadas
    "M4": ("min", 0.30),  # cobertura: fraccion de fotos con resultado ok
}


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


def con_temperatura(probs: np.ndarray, t: float) -> np.ndarray:
    """softmax(log p / t). Equivale a dividir los logits por t: el argmax no
    cambia, solo cuanto se confia en el."""
    z = np.log(np.clip(probs, 1e-12, 1.0)) / t
    z -= z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def ajustar_temperatura(probs: np.ndarray, y_true) -> float:
    """Temperature scaling (Guo et al., 2017): la t que minimiza la log loss en
    las predicciones de validacion. Rejilla logaritmica de 0.25 a 8: fuera de
    ese rango la red estaria tan mal calibrada que el problema seria otro."""
    y = np.asarray(y_true)

    def nll(t: float) -> float:
        return float(-np.log(np.clip(con_temperatura(probs, t)[np.arange(len(y)), y], 1e-12, None)).mean())

    return float(min(np.geomspace(0.25, 8, 401), key=nll))


def ece(probs: np.ndarray, y_true, bins: int = 10) -> dict:
    """Expected Calibration Error con bins de igual ancho sobre la confianza
    maxima, y la tabla de fiabilidad (confianza media vs. acierto por bin)."""
    confianza = probs.max(axis=1)
    acierto = probs.argmax(axis=1) == np.asarray(y_true)
    bordes = np.linspace(0, 1, bins + 1)
    tabla, total = [], 0.0
    for lo, hi in zip(bordes[:-1], bordes[1:]):
        m = (confianza > lo) & (confianza <= hi)
        if m.any():
            total += m.mean() * abs(confianza[m].mean() - acierto[m].mean())
            tabla.append({"bin": [float(lo), float(hi)], "n": int(m.sum()),
                          "confianza": float(confianza[m].mean()), "acierto": float(acierto[m].mean())})
    return {"ece": float(total), "fiabilidad": tabla}


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


# --- estado_clinico: abstencion ----------------------------------------------

def motivo_abstencion(probs: np.ndarray, clases: list[str], umbral: float | None,
                      umbral_sin_senales: float | None, *, clases_no_fiables=frozenset(),
                      umbral_alguna_senal: float | None = None) -> str | None:
    """Motivo de no_concluyente de UNA prediccion, "senal_inespecifica", o None si se acepta.

    Reglas 3 a 6 de la decision 5 de design.md, despues clases_no_fiables y por
    ultimo senal_inespecifica, en ese orden. Las reglas 1 (sin modelo), 2
    (excepcion) y foto_insuficiente (antes del modelo) solo existen en el
    servicio. El servicio (services/api/app/vision) no puede importar este
    modulo (no tiene scikit-learn), asi que duplica estas reglas y las dos
    copias se prueban con la misma tabla: tests/casos_abstencion.json.
    Confianza = probabilidad bruta del softmax sobre las 9 clases, sin redondear.

    Sin los dos argumentos de palabra clave son solo las reglas 3 a 6: asi las
    usan la calibracion y clases_no_fiables, que no pueden depender de si mismas.
    """
    i = int(np.argmax(probs))
    confianza = float(probs[i])
    if clases[i] == OTRA:
        motivo = "clase_otra"
    elif umbral is None or confianza < umbral:
        motivo = "confianza_baja"
    elif clases[i] == SIN_SENALES and (umbral_sin_senales is None or confianza < umbral_sin_senales):
        motivo = "confianza_baja"
    elif clases[i] in clases_no_fiables:
        motivo = "clase_no_fiable"
    else:
        return None
    p_senal = sum(float(p) for c, p in zip(clases, probs) if c not in (SIN_SENALES, OTRA))
    if umbral_alguna_senal is not None and p_senal >= umbral_alguna_senal:
        return "senal_inespecifica"
    return motivo


def calibrar_umbral_sin_senales(probs: np.ndarray, y_true, clases: list[str], umbral: float | None) -> float | None:
    """Umbral propio para afirmar sin_senales (decision 6 de design.md), en val.

    Afirmar sin_senales sobre una linea oscura es el error mas grave: este
    umbral queda por encima del falso sin_senales mas confiado de validacion.
    Sale de los datos y no de un porcentaje fijado a ojo. None = el sistema
    nunca dira sin_senales.
    """
    if umbral is None:
        return None
    i = clases.index(SIN_SENALES)
    confianza = probs.max(axis=1)
    dice_sin_senales = probs.argmax(axis=1) == i
    falsos = confianza[dice_sin_senales & (np.asarray(y_true) != i)]
    if falsos.size == 0:
        return umbral
    # Por encima del falso mas confiado solo quedan aciertos, por construccion.
    por_encima = confianza[dice_sin_senales & (confianza > falsos.max())]
    if por_encima.size == 0:
        return None
    return max(float(por_encima.min()), umbral)


def _apta(brillo: dict[str, np.ndarray], nombres: list[str], brillo_minimo: float) -> np.ndarray:
    return np.concatenate([np.asarray(brillo[k]) >= brillo_minimo for k in nombres])


def mezcla_apta(probs: dict[str, np.ndarray], brillo: dict[str, np.ndarray], y_true,
                brillo_minimo: float) -> tuple[np.ndarray, np.ndarray]:
    """(probabilidades, etiquetas) de la mezcla que calibra, en el orden de calibrar_mezcla."""
    nombres = list(probs)
    apta = _apta(brillo, nombres, brillo_minimo)
    return np.concatenate([probs[k] for k in nombres])[apta], np.tile(np.asarray(y_true), len(nombres))[apta]


def calibrar_mezcla(probs: dict[str, np.ndarray], brillo: dict[str, np.ndarray], y_true, clases: list[str],
                    precision_objetivo: float, brillo_minimo: float) -> dict:
    """Temperatura y umbrales sobre la mezcla de la vista limpia y sus copias
    degradadas (todas OOF, mismas fotos). Calibrar solo con la limpia promete
    la precision objetivo y la incumple en fotos oscuras o borrosas: el
    2026-11-17 la precision de las aceptadas (0,90 en la limpia) bajaba en 9
    de 11 degradaciones, hasta 0,56 con la foto muy oscura.

    Las copias con brillo < brillo_minimo no cuentan: el servicio las rechaza
    antes del modelo (foto_insuficiente). Las copias de una misma foto no son
    independientes; la mezcla sirve para calibrar, no como intervalo de confianza.
    """
    nombres = list(probs)
    y = np.asarray(y_true)
    yy = np.tile(y, len(nombres))
    raw = np.concatenate([probs[k] for k in nombres])
    apta = _apta(brillo, nombres, brillo_minimo)
    t = ajustar_temperatura(raw[apta], yy[apta])
    p = con_temperatura(raw, t)
    umbral = calibrar_umbral(p[apta], yy[apta], precision_objetivo)
    umbral_ss = calibrar_umbral_sin_senales(p[apta], yy[apta], clases, umbral)
    acepta = apta & np.array([motivo_abstencion(f, clases, umbral, umbral_ss) is None for f in p])
    pred = p.argmax(axis=1)
    por_conjunto = {}
    for j, k in enumerate(nombres):
        sl = slice(j * len(y), (j + 1) * len(y))
        a = acepta[sl]
        por_conjunto[k] = {
            "apta": float(apta[sl].mean()),
            "cobertura": float(a.mean()),
            "precision_aceptadas": float((pred[sl][a] == y[a]).mean()) if a.any() else None,
            "f1_macro": metricas(y, pred[sl], clases)["f1_macro"],
        }
    return {"temperatura": t, "umbral": umbral, "umbral_sin_senales": umbral_ss,
            "cobertura_mezcla": float(acepta.mean()),
            "precision_mezcla": float((pred[acepta] == yy[acepta]).mean()) if acepta.any() else None,
            "por_conjunto": por_conjunto}


def calibrar_umbral_senal(probs: np.ndarray, y_true, clases: list[str], precision_objetivo: float) -> float | None:
    """Menor umbral sobre p(alguna senal) = suma de las 7 senales tal que, entre
    las fotos que lo superan, al menos precision_objetivo tiene una senal real.
    `otra` cuenta como negativa (mezcla esmalte con patologias: el lado seguro).

    Solo umbrales >= 0.5: las senales juntas tienen que ser mayoria. None = no
    se afirma nunca. No nombra cual senal.
    """
    senales = [i for i, c in enumerate(clases) if c not in (SIN_SENALES, OTRA)]
    p = probs[:, senales].sum(axis=1)
    es_senal = np.isin(np.asarray(y_true), senales)
    for umbral in np.unique(p[p >= 0.5]):
        if es_senal[p >= umbral].mean() >= precision_objetivo:
            return float(umbral)
    return None


def clases_no_fiables(probs: np.ndarray, y_true, clases: list[str], umbral: float | None,
                      umbral_sin_senales: float | None, minimo_fotos: int, precision_objetivo: float) -> dict[str, str]:
    """Clase -> motivo, para las que el modelo no deberia nombrar aunque supere el umbral.

    - pocas_fotos: menos de `minimo_fotos` en train+val; no hay con que validarla.
    - sin_aceptadas: ninguna prediccion aceptada en OOF; su precision es desconocida.
    - precision_baja: el limite superior de Wilson (95 %) de la precision de sus
      aceptadas esta por debajo del objetivo, es decir, los datos muestran que
      falla mas de lo prometido, no solo que hay pocos.
    `probs` son OOF de fotos independientes (la vista limpia), no la mezcla.
    """
    y = np.asarray(y_true)
    pred = probs.argmax(axis=1)
    aceptada = np.array([motivo_abstencion(f, clases, umbral, umbral_sin_senales) is None for f in probs], dtype=bool)
    salida = {}
    for i, c in enumerate(clases):
        if c == OTRA:  # nunca se nombra
            continue
        k = aceptada & (pred == i)
        if (y == i).sum() < minimo_fotos:
            salida[c] = "pocas_fotos"
        elif not k.any():
            salida[c] = "sin_aceptadas"
        elif wilson(int((k & (y == i)).sum()), int(k.sum()))[1] < precision_objetivo:
            salida[c] = "precision_baja"
    return salida


def wilson(aciertos: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """Intervalo de confianza del 95 % de Wilson para una proporcion. Con pocas
    fotos (o con 0 o n aciertos) el intervalo normal se sale de [0, 1]."""
    if n == 0:
        return None
    p = aciertos / n
    denominador = 1 + z * z / n
    centro = (p + z * z / (2 * n)) / denominador
    margen = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominador
    return max(0.0, centro - margen), min(1.0, centro + margen)


def evaluacion_clinica(probs_val: np.ndarray, y_val, probs_test: np.ndarray, y_test,
                       clases: list[str], umbral: float | None, clases_no_fiables=frozenset()) -> dict:
    """Calibra umbral_sin_senales en val y mide test DESPUES de abstenerse.

    Se abstiene como el servicio: clases_no_fiables del modelo mas
    CLASES_NUNCA_NOMBRADAS, que se suman siempre (igual que clinico.cargar).
    Sin ellas, M3 y M4 contarian como aceptadas fotos que el servicio nunca nombra.

    Por clase real, las cuatro columnas suman n: aceptadas correctas,
    abstenidas, aceptadas como otra clase (que no sea sin_senales) y aceptadas
    como sin_senales. El recall estricto cuenta la abstencion como fallo.
    """
    umbral_ss = calibrar_umbral_sin_senales(probs_val, y_val, clases, umbral)
    pred = probs_test.argmax(axis=1)
    y = np.asarray(y_test)
    no_fiables = frozenset(clases_no_fiables) | CLASES_NUNCA_NOMBRADAS
    aceptada = np.array([motivo_abstencion(p, clases, umbral, umbral_ss, clases_no_fiables=no_fiables) is None
                         for p in probs_test], dtype=bool)
    i_ss = clases.index(SIN_SENALES)
    como_ss = aceptada & (pred == i_ss) & (y != i_ss)

    por_clase = {}
    for i, c in enumerate(clases):
        real = y == i
        correctas = int((real & aceptada & (pred == i)).sum())
        n = int(real.sum())
        por_clase[c] = {
            "n": n,
            "aceptadas_correctas": correctas,
            "abstenidas": int((real & ~aceptada).sum()),
            "aceptadas_otra_clase": int((real & aceptada & (pred != i) & (pred != i_ss)).sum()),
            "aceptadas_sin_senales": int((real & como_ss).sum()),
            "recall_estricto": correctas / n if n else None,
            "ic95": wilson(correctas, n),
        }

    graves = np.isin(y, [clases.index(c) for c in SENALES_GRAVES])
    n_aceptadas = int(aceptada.sum())
    valores = {
        "M1": int((como_ss & graves).sum()),
        "M2": int(como_ss.sum()),
        "M3": float((pred[aceptada] == y[aceptada]).mean()) if n_aceptadas else None,
        "M4": float(aceptada.mean()) if y.size else 0.0,
    }
    aceptacion = {}
    for m, (tipo, limite) in ACEPTACION_CLINICA.items():
        v = valores[m]
        # Sin aceptadas no hay precision que medir: no se puede dar por cumplida.
        cumple = v is not None and (v <= limite if tipo == "max" else v >= limite)
        aceptacion[m] = {"valor": v, "limite": limite, "tipo": tipo, "cumple": cumple}
    return {"umbral_sin_senales": umbral_ss, "por_clase": por_clase, "aceptacion": aceptacion}
