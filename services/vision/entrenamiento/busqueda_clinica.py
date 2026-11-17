"""Busqueda de hiperparametros y modelo final de `estado_clinico`.

  python -m entrenamiento.busqueda_clinica buscar   --dataset DIR --series CSV --salida DIR
  python -m entrenamiento.busqueda_clinica robustez --dataset DIR --series CSV --salida DIR  # opcional
  python -m entrenamiento.busqueda_clinica final    --dataset DIR --series CSV --salida DIR

Por que no basta `comparar` (modelo.py): con 350 fotos, la particion deja ~55
en val (3 a 9 por clase). Elegir hiperparametros, temperatura y umbrales con
esas fotos es elegir ruido. Aqui todo eso se decide con validacion cruzada de
5 pliegues sobre train+val, agrupada por serie y estratificada por clase, y
con las predicciones fuera de pliegue (OOF) de esas ~300 fotos. Test (la
particion de `dividir`, con sus series) no se lee hasta `final`, y `final` se
niega a correr dos veces sobre la misma salida.

- `buscar`: base congelada. Cachea los embeddings de cada arquitectura (una
  vista limpia + `vistas` aumentadas) y entrena solo la cabeza. Etapa 1 elige
  arquitectura y aumento; etapa 2, LR, dropout, suavizado y pesos de clase
  sobre las dos mejores combinaciones (arquitectura, vistas) de la etapa 1.
  Etapa 3 prueba fine-tuning de la mejor cabeza. Cada
  corrida queda en busqueda.json y busqueda.md.
- `robustez`: para la cabeza ganadora compara sin aumento, aumento geometrico
  y degradaciones de celular (entrenamiento/degradaciones.py), midiendo en CV
  copias degradadas de train+val. Escribe robustez.json y robustez.md.
- `final`: reentrena la ganadora con train+val y el numero de epocas elegido en
  CV, ajusta la temperatura y los umbrales con las OOF, mide test una vez,
  cuantiza si no degrada y exporta con modelo._exportar. Si existe
  robustez.json, usa su aumento y calibra sobre la mezcla limpia + degradadas.
"""

import argparse
import datetime
import json
import statistics
import time
from itertools import product
from pathlib import Path

import keras
import numpy as np
import tensorflow as tf

from . import datos, degradaciones as dg, metricas, modelo
from .__main__ import _particionar
from .config import RUTA_POR_DEFECTO, TAREA_CLINICA, cargar_config, exigir_fuera_del_repo, lado_minimo

# Variantes de exportacion, de menor a mayor tamano. Se queda la primera que
# no degrada (ver _elegir_variante).
VARIANTES = ("int8_dinamica", "float16", "float32")


# --- datos -------------------------------------------------------------------

def _grupos(manifiesto: dict) -> tuple[list[dict], list[dict]]:
    pool = [a for a in manifiesto["archivos"] if a["particion"] in ("train", "val")]
    test = [a for a in manifiesto["archivos"] if a["particion"] == "test"]
    return pool, test


def _imagenes(raiz: Path, items: list[dict], lado: int) -> np.ndarray:
    return np.stack([datos.cargar_imagen(raiz / i["archivo"], lado) for i in items])


def _base(arq: str, lado: int) -> keras.Model:
    return getattr(keras.applications, arq)(include_top=False, weights="imagenet",
                                           input_shape=(lado, lado, 3), pooling="avg")


def _embeber(base: keras.Model, x: np.ndarray, aumento=None) -> np.ndarray:
    lotes = []
    for i in range(0, len(x), 32):
        xb = tf.constant(x[i:i + 32], tf.float32)
        lotes.append(base(aumento(xb, training=True) if aumento else xb, training=False).numpy())
    return np.concatenate(lotes)


def embeddings(arq: str, x: np.ndarray, vistas: int, cfg: dict, aumento: str = "geometrico",
               repeticion: int = 0) -> np.ndarray:
    """(1 + vistas, n, d): vista 0 limpia; el resto con el aumento geometrico de
    config.toml o con degradaciones de celular (degradaciones.aleatoria).
    `repeticion` cambia solo el sorteo de las vistas (0 = el del modelo final)."""
    keras.backend.clear_session()
    modelo.fijar_determinismo(cfg["semilla"])
    base, semilla = _base(arq, cfg["imagen"]["lado"]), cfg["semilla"]
    geometrico = modelo._aumento(cfg["aumento"], semilla + repeticion)
    salida = [_embeber(base, x)]
    for v in range(1, 1 + vistas):
        if aumento == "degradacion":
            s = (semilla, repeticion, v)
            xv = np.stack([dg.degradar(im, dg.aleatoria((*s, i)), (*s, i)) for i, im in enumerate(x)])
            salida.append(_embeber(base, xv))
        else:
            salida.append(_embeber(base, x, geometrico))
    return np.stack(salida)


def conjuntos_degradados(arq: str, x: np.ndarray, cfg: dict) -> tuple[dict, dict]:
    """Embeddings y brillo de cada nivel fijo de degradaciones.NIVELES. Solo se
    llama con fotos de train+val: test nunca se degrada ni se usa para elegir."""
    keras.backend.clear_session()
    modelo.fijar_determinismo(cfg["semilla"])
    base, emb, brillo = _base(arq, cfg["imagen"]["lado"]), {}, {}
    for nombre, params in dg.NIVELES.items():
        # Semilla de 3 componentes: las vistas de aumento usan 4 y no se cruzan.
        xd = np.stack([dg.degradar(im, params, (cfg["semilla"], 0, i)) for i, im in enumerate(x)])
        emb[nombre] = _embeber(base, xd)
        brillo[nombre] = np.array([dg.brillo(im) for im in xd])
    return emb, brillo


# --- cabeza sobre embeddings --------------------------------------------------

def _cabeza(d: int, n_clases: int, dropout: float) -> keras.Model:
    """Misma cabeza que modelo.construir: Dropout + Dense softmax."""
    entrada = keras.Input((d,))
    return keras.Model(entrada, keras.layers.Dense(n_clases, activation="softmax")(
        keras.layers.Dropout(dropout)(entrada)))


def entrenar_cabeza(emb: np.ndarray, y: np.ndarray, idx_tr, idx_ev, p: dict, cfg: dict, epocas: int):
    """Entrena con las vistas de idx_tr y devuelve (cabeza, probs de idx_ev en
    cada epoca: (epocas, len(idx_ev), n_clases)). Sin early stopping por
    pliegue: la epoca se elige despues con la curva media de todos los
    pliegues, para no usar el pliegue evaluado para decidir cuando parar."""
    keras.backend.clear_session()
    modelo.fijar_determinismo(cfg["semilla"])
    n_clases = len(cfg["tareas"][TAREA_CLINICA]["clases"])
    # Cada epoca recorre siempre 1 + max(vistas) copias (repitiendo las vistas
    # que haya): asi una epoca da los mismos pasos con o sin aumento y el tope
    # de epocas no castiga a la configuracion sin aumento (2026-11-17: sin
    # esto, vistas = 0 llegaba al tope de 60 epocas sin converger).
    copias = np.arange(1 + max(cfg["busqueda_clinica"]["vistas"])) % (1 + p["vistas"])
    x = emb[copias][:, idx_tr].reshape(-1, emb.shape[-1])
    yt = np.tile(y[idx_tr], len(copias))
    pesos = datos.pesos_de_clase(list(y[idx_tr]), n_clases) if p["pesos_clase"] else None
    sw = np.array([pesos[int(k)] for k in yt]) if pesos else None
    cab = _cabeza(emb.shape[-1], n_clases, p["dropout"])
    cab.compile(keras.optimizers.Adam(p["lr"]),
                keras.losses.CategoricalCrossentropy(label_smoothing=p["suavizado"]))
    curva = []
    registro = keras.callbacks.LambdaCallback(
        on_epoch_end=lambda e, logs: curva.append(cab.predict(emb[0, idx_ev], verbose=0)) if len(idx_ev) else None)
    cab.fit(x, keras.utils.to_categorical(yt, n_clases), sample_weight=sw, batch_size=cfg["busqueda_clinica"]["lote"],
            epochs=epocas, shuffle=True, verbose=0, callbacks=[registro])
    return cab, np.stack(curva) if curva else None


def _resumen_cv(curvas: np.ndarray, y: np.ndarray, clases: list[str]) -> dict:
    """curvas: (epocas, n, clases) OOF. Epoca = la de menor log loss media."""
    ll = -np.log(np.clip(curvas[:, np.arange(len(y)), y], 1e-12, None)).mean(axis=1)
    e = int(np.argmin(ll))
    m = metricas.metricas(y, curvas[e].argmax(axis=1), clases)
    return {"epocas": e + 1, "log_loss": float(ll[e]), "accuracy": m["accuracy"], "f1_macro": m["f1_macro"],
            "precision_macro": m["precision_macro"], "recall_macro": m["recall_macro"]}


def cv_cabeza(emb, y, folds, p, cfg, clases) -> tuple[dict, np.ndarray]:
    epocas = cfg["busqueda_clinica"]["epocas_max_cabeza"]
    curvas = np.zeros((epocas, len(y), len(clases)))
    for tr, ev in folds:
        curvas[:, ev] = entrenar_cabeza(emb, y, tr, ev, p, cfg, epocas)[1]
    return _resumen_cv(curvas, y, clases), curvas


# --- fine-tuning ---------------------------------------------------------------

def _modelo_completo(arq: str, cab: keras.Model, cfg: dict, dropout: float) -> tuple[keras.Model, keras.Model]:
    """modelo.construir con los pesos de la cabeza entrenada sobre embeddings."""
    m, base = modelo.construir(arq, len(cfg["tareas"][TAREA_CLINICA]["clases"]), cfg["imagen"]["lado"], dropout)
    m.layers[-1].set_weights(cab.layers[-1].get_weights())
    return m, base


def entrenar_ft(arq, cab, x, y, idx_tr, idx_ev, p, cfg, epocas):
    """Fase 2 de modelo.entrenar (ultimas `capas` de la base, BatchNorm
    congelada) partiendo de la cabeza ya entrenada, con aumento en linea."""
    m, base = _modelo_completo(arq, cab, cfg, p["dropout"])
    base.trainable = True
    limite = len(base.layers) - p["ft_capas"]
    for i, capa in enumerate(base.layers):
        capa.trainable = i >= limite and not isinstance(capa, keras.layers.BatchNormalization)
    n_clases = len(cfg["tareas"][TAREA_CLINICA]["clases"])
    aumento = modelo._aumento(cfg["aumento"], cfg["semilla"])
    pesos = datos.pesos_de_clase(list(y[idx_tr]), n_clases) if p["pesos_clase"] else {k: 1.0 for k in range(n_clases)}
    ds = (tf.data.Dataset.from_tensor_slices((x[idx_tr], keras.utils.to_categorical(y[idx_tr], n_clases),
                                              np.array([pesos[int(k)] for k in y[idx_tr]], np.float32)))
          .shuffle(len(idx_tr), seed=cfg["semilla"]).batch(cfg["entrenamiento"]["lote"])
          .map(lambda a, b, c: (aumento(tf.cast(a, tf.float32), training=True), b, c)))
    m.compile(keras.optimizers.Adam(p["ft_lr"]), keras.losses.CategoricalCrossentropy(label_smoothing=p["suavizado"]))
    curva = []
    registro = keras.callbacks.LambdaCallback(
        on_epoch_end=lambda e, logs: curva.append(m.predict(x[idx_ev].astype(np.float32), verbose=0)) if len(idx_ev) else None)
    m.fit(ds, epochs=epocas, verbose=0, callbacks=[registro])
    return m, np.stack(curva) if curva else None


# --- buscar --------------------------------------------------------------------

def _corrida(etapa: str, arq: str, p: dict, r: dict, segundos: float) -> dict:
    return {"etapa": etapa, "arquitectura": arq, **p, **r, "segundos": round(segundos, 1)}


def buscar(cfg: dict, manifiesto: dict, raiz: Path, salida: Path) -> list[dict]:
    b, clases, semilla = cfg["busqueda_clinica"], manifiesto["clases"], cfg["semilla"]
    pool, _ = _grupos(manifiesto)
    y = np.array([clases.index(i["clase"]) for i in pool])
    folds = datos.pliegues(pool, clases, b["pliegues"], semilla)
    x = _imagenes(raiz, pool, cfg["imagen"]["lado"])
    base_p = {"vistas": 0, "lr": b["lr"][0], "dropout": b["dropout"][0], "suavizado": b["suavizado"][0],
              "pesos_clase": b["pesos_clase"][0]}
    corridas, cache = [], {}

    def correr(etapa, arq, p):
        t0 = time.perf_counter()
        r, _ = cv_cabeza(cache[arq], y, folds, p, cfg, clases)
        corridas.append(_corrida(etapa, arq, p, r, time.perf_counter() - t0))
        print(f"[{etapa}] {arq} {p} -> F1 {r['f1_macro']:.3f} acc {r['accuracy']:.3f} ep {r['epocas']}", flush=True)
        _guardar(salida, manifiesto, corridas)

    for arq in b["arquitecturas"]:
        cache[arq] = embeddings(arq, x, max(b["vistas"]), cfg)
        for v in b["vistas"]:
            correr("1-arquitectura", arq, {**base_p, "vistas": v})
    mejores = _top(corridas, "1-arquitectura", 2)
    for arq, v in ((c["arquitectura"], c["vistas"]) for c in mejores):
        for lr, do, ls, pc in product(b["lr"], b["dropout"], b["suavizado"], b["pesos_clase"]):
            p = {"vistas": v, "lr": lr, "dropout": do, "suavizado": ls, "pesos_clase": pc}
            if not any(c["arquitectura"] == arq and all(c[k] == p[k] for k in p) for c in corridas):
                correr("2-cabeza", arq, p)

    g = _top(corridas, None, 1)[0]
    p = {k: g[k] for k in base_p}
    for capas, ft_lr in product(b["ft_capas"], b["ft_lr"]):
        t0 = time.perf_counter()
        pf = {**p, "ft_capas": capas, "ft_lr": ft_lr}
        curvas = np.zeros((b["ft_epocas_max"], len(y), len(clases)))
        for tr, ev in folds:
            cab, _ = entrenar_cabeza(cache[g["arquitectura"]], y, tr, [], p, cfg, g["epocas"])
            curvas[:, ev] = entrenar_ft(g["arquitectura"], cab, x, y, tr, ev, pf, cfg, b["ft_epocas_max"])[1]
        r = _resumen_cv(curvas, y, clases)
        corridas.append(_corrida("3-fine-tuning", g["arquitectura"], {**pf, "epocas_cabeza": g["epocas"]}, r,
                                 time.perf_counter() - t0))
        print(f"[3-fine-tuning] {pf} -> F1 {r['f1_macro']:.3f} acc {r['accuracy']:.3f} ep {r['epocas']}", flush=True)
        _guardar(salida, manifiesto, corridas)
    return corridas


def _top(corridas: list[dict], etapa: str | None, n: int) -> list[dict]:
    """Mayor F1 macro OOF; empate, menor log loss. Nunca mira test."""
    cand = [c for c in corridas if etapa is None or c["etapa"] == etapa]
    return sorted(cand, key=lambda c: (-c["f1_macro"], c["log_loss"]))[:n]


def ganadora(corridas: list[dict], margen: float) -> dict:
    """La mejor cabeza sobre base congelada, salvo que el mejor fine-tuning la
    supere en F1 macro OOF por mas de `margen`: el fine-tuning agrega una etapa
    y un modelo distinto, y solo se justifica si mueve el resultado."""
    cabeza = _top([c for c in corridas if c["etapa"] != "3-fine-tuning"], None, 1)[0]
    ft = _top(corridas, "3-fine-tuning", 1)
    return ft[0] if ft and ft[0]["f1_macro"] > cabeza["f1_macro"] + margen else cabeza


# --- robustez ------------------------------------------------------------------

AUMENTOS = ("ninguno", "geometrico", "degradacion")


def oof_conjuntos(emb: np.ndarray, emb_deg: dict, y, folds, p: dict, cfg: dict, epocas: int) -> dict[str, np.ndarray]:
    """Probabilidades OOF de la vista limpia y de cada copia degradada, con la
    misma cabeza por pliegue (la del pliegue que no vio esas fotos)."""
    n_clases = len(cfg["tareas"][TAREA_CLINICA]["clases"])
    salida = {k: np.zeros((len(y), n_clases)) for k in ("limpia", *emb_deg)}
    for tr, ev in folds:
        cab, _ = entrenar_cabeza(emb, y, tr, [], p, cfg, epocas)
        salida["limpia"][ev] = cab.predict(emb[0, ev], verbose=0)
        for k, e in emb_deg.items():
            salida[k][ev] = cab.predict(e[ev], verbose=0)
    return salida


def elegir_aumento(resultados: list[dict], margen: float, precision_minima: float) -> str:
    """Primero la seguridad: solo cuentan los aumentos cuya precision de las
    aceptadas no baja de `precision_minima` en ninguna degradacion. Entre esos,
    el de mayor cobertura sobre la mezcla, sin bajar la F1 macro OOF limpia mas
    de `margen` respecto del mejor de ellos. Empate: el primero de AUMENTOS.
    Si ninguno es seguro, el menos inseguro (mayor peor precision).

    La exigencia por degradacion se agrego el 2026-11-17, antes de leer test y
    despues de ver la CV: sin ella se elegia geometrico, que en la foto de poca
    luz acepta con precision 0,785 (inventa 1 de cada 5)."""
    seguros = [r for r in resultados if r["peor_precision"] >= precision_minima]
    if not seguros:
        return max(resultados, key=lambda r: r["peor_precision"])["aumento"]
    tope = max(r["limpia"]["f1_macro"] for r in seguros)
    aptos = [r for r in seguros if r["limpia"]["f1_macro"] >= tope - margen]
    return max(aptos, key=lambda r: (r["mezcla"]["cobertura_mezcla"], -AUMENTOS.index(r["aumento"])))["aumento"]


def _vistas(aumento: str, b: dict) -> int:
    return 0 if aumento == "ninguno" else max(b["vistas"])


def robustez(cfg: dict, manifiesto: dict, raiz: Path, salida: Path) -> dict:
    """Compara aumentos para la cabeza ganadora de `buscar` midiendo, en CV,
    la vista limpia y las copias degradadas de train+val. `final` usa el elegido.

    Cada aumento se repite con `repeticiones_aumento` sorteos de vistas y se
    elige por la media: el 2026-11-17 dos sorteos de las mismas 8 vistas de
    degradacion dieron F1 OOF limpia 0,680 y 0,635, mas que la diferencia que
    se queria medir."""
    b, clases, semilla = cfg["busqueda_clinica"], manifiesto["clases"], cfg["semilla"]
    busqueda = json.loads((salida / "busqueda.json").read_text())
    if busqueda["particion_huella"] != manifiesto["huella"]:
        raise ValueError("busqueda.json es de otra particion")
    g = ganadora(busqueda["corridas"], b["margen_fine_tuning"])
    if g["etapa"] == "3-fine-tuning":
        raise ValueError("robustez compara aumentos sobre base congelada; la ganadora usa fine-tuning")
    arq, p = g["arquitectura"], {k: g[k] for k in ("lr", "dropout", "suavizado", "pesos_clase")}
    pool, _ = _grupos(manifiesto)
    y = np.array([clases.index(i["clase"]) for i in pool])
    folds = datos.pliegues(pool, clases, b["pliegues"], semilla)
    x = _imagenes(raiz, pool, cfg["imagen"]["lado"])
    emb_deg, brillo = conjuntos_degradados(arq, x, cfg)
    brillo["limpia"] = np.array([dg.brillo(im) for im in x])
    resultados = []
    for aumento in AUMENTOS:
        t0, pa, reps = time.perf_counter(), {**p, "vistas": _vistas(aumento, b)}, []
        # Sin aumento no hay sorteo: una sola corrida.
        for rep in range(1 if aumento == "ninguno" else b["repeticiones_aumento"]):
            emb = embeddings(arq, x, pa["vistas"], cfg, aumento, rep)
            r, _ = cv_cabeza(emb, y, folds, pa, cfg, clases)
            probs = oof_conjuntos(emb, emb_deg, y, folds, pa, cfg, r["epocas"])
            reps.append({"limpia": r, "mezcla": metricas.calibrar_mezcla(
                probs, brillo, y, clases, cfg["umbral"]["precision_objetivo"], b["brillo_minimo"])})
            print(f"[robustez] {aumento} #{rep}: F1 limpia {r['f1_macro']:.3f}, cobertura mezcla "
                  f"{reps[-1]['mezcla']['cobertura_mezcla']:.3f}", flush=True)
        resultados.append({
            "aumento": aumento,
            "limpia": {"f1_macro": statistics.mean(r["limpia"]["f1_macro"] for r in reps)},
            "mezcla": {"cobertura_mezcla": statistics.mean(r["mezcla"]["cobertura_mezcla"] for r in reps)},
            "peor_precision": _peor_precision(reps),
            "repeticiones": reps, "segundos": round(time.perf_counter() - t0, 1)})
    informe = {"particion_huella": manifiesto["huella"], "arquitectura": arq, "cabeza": p,
               "niveles": dg.NIVELES, "elegido": elegir_aumento(resultados, b["margen_aumento"], b["precision_minima_por_conjunto"]),
               "resultados": resultados}
    (salida / "robustez.json").write_text(json.dumps(informe, indent=2, ensure_ascii=False))
    _robustez_md(salida, informe)
    return informe


def _peor_precision(reps: list[dict]) -> float:
    """Minimo, entre conjuntos, de la precision media de las aceptadas en los
    sorteos. Un conjunto sin aceptadas no cuenta: no afirma nada."""
    por_conjunto = {}
    for rep in reps:
        for k, c in rep["mezcla"]["por_conjunto"].items():
            if c["precision_aceptadas"] is not None:
                por_conjunto.setdefault(k, []).append(c["precision_aceptadas"])
    return min(statistics.mean(v) for v in por_conjunto.values())


def _robustez_md(salida: Path, informe: dict) -> None:
    filas = ["| aumento | conjunto | F1 macro OOF | cobertura | precision aceptadas |", "|---|---|---|---|---|"]
    for r in informe["resultados"]:
        for k in r["repeticiones"][0]["mezcla"]["por_conjunto"]:
            c = [rep["mezcla"]["por_conjunto"][k] for rep in r["repeticiones"]]
            precs = [v["precision_aceptadas"] for v in c if v["precision_aceptadas"] is not None]
            prec = f"{statistics.mean(precs):.3f}" if precs else "-"
            filas.append(f"| {r['aumento']} | {k} | {statistics.mean(v['f1_macro'] for v in c):.3f} | "
                         f"{statistics.mean(v['cobertura'] for v in c):.3f} | {prec} |")
    (salida / "robustez.md").write_text(
        "# Robustez de estado_clinico (CV 5 pliegues por serie; umbral calibrado sobre la mezcla; "
        "media de los sorteos de vistas)\n\n"
        f"Elegido: **{informe['elegido']}**\n\n" + "\n".join(filas) + "\n")


def _guardar(salida: Path, manifiesto: dict, corridas: list[dict]) -> None:
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "busqueda.json").write_text(json.dumps(
        {"particion_huella": manifiesto["huella"], "corridas": corridas}, indent=2, ensure_ascii=False))
    cols = ["etapa", "arquitectura", "vistas", "lr", "dropout", "suavizado", "pesos_clase", "ft_capas", "ft_lr",
            "epocas", "log_loss", "accuracy", "precision_macro", "recall_macro", "f1_macro", "segundos"]
    filas = ["| # | " + " | ".join(cols) + " |", "|" + "---|" * (len(cols) + 1)]
    for i, c in enumerate(corridas, 1):
        filas.append(f"| {i} | " + " | ".join(
            f"{c[k]:.3f}" if isinstance(c.get(k), float) and k not in ("lr", "ft_lr") else str(c.get(k, "-"))
            for k in cols) + " |")
    (salida / "busqueda.md").write_text(
        "# Busqueda de hiperparametros de estado_clinico (CV 5 pliegues por serie, metricas OOF)\n\n"
        + "\n".join(filas) + "\n")


# --- final ---------------------------------------------------------------------

def _tflite(m: keras.Model, variante: str, carpeta: Path) -> bytes:
    """SavedModel -> TFLite. Entrada y salida siguen en float32 en las tres
    variantes (clinico.py rechaza otra cosa); solo cambian los pesos."""
    sm = carpeta / f"savedmodel_{variante}"
    m.export(sm, format="tf_saved_model", verbose=False)
    conv = tf.lite.TFLiteConverter.from_saved_model(str(sm))
    if variante != "float32":
        conv.optimizations = [tf.lite.Optimize.DEFAULT]
    if variante == "float16":
        conv.target_spec.supported_types = [tf.float16]
    return conv.convert()


def _interprete(contenido: bytes):
    from ai_edge_litert.interpreter import Interpreter

    it = Interpreter(model_content=contenido)
    it.allocate_tensors()
    ent, sal = it.get_input_details()[0], it.get_output_details()[0]

    def predecir(x: np.ndarray) -> np.ndarray:
        salida = []
        for img in x.astype(np.float32):
            it.set_tensor(ent["index"], img[None])
            it.invoke()
            salida.append(it.get_tensor(sal["index"])[0].copy())
        return np.stack(salida)

    return predecir


def _latencia_ms(predecir, lado: int) -> float:
    x = np.zeros((1, lado, lado, 3), np.float32)
    for _ in range(5):
        predecir(x)
    tiempos = []
    for _ in range(50):
        t0 = time.perf_counter()
        predecir(x)
        tiempos.append(time.perf_counter() - t0)
    return statistics.median(tiempos) * 1000


def _elegir_variante(fidelidad: dict, tolerancia: float, max_dif: float) -> str:
    """La mas chica que, sobre las fotos de train+val, no baja la F1 macro mas
    de `tolerancia` respecto de Keras, coincide en argmax en >= 99 % y no mueve
    ninguna probabilidad mas de `max_dif`. Se decide sin test.

    El tope de probabilidad es necesario: decidir() compara la confianza con
    umbrales, y sobre fotos de entrenamiento (donde el modelo esta confiado)
    el argmax casi nunca cambia aunque la cuantizacion deforme la salida. El
    2026-11-17 int8 paso los dos primeros criterios con max|dif| 0.685 y en
    test cayo de F1 0.678 a 0.599."""
    for v in VARIANTES:
        f = fidelidad[v]
        if f["delta_f1"] <= tolerancia and f["coincidencia_argmax"] >= 0.99 and f["max_abs_dif"] <= max_dif:
            return v
    return "float32"


def final(cfg: dict, manifiesto: dict, motivos: dict, raiz: Path, salida: Path) -> dict:
    if (salida / "exportado").exists():
        raise ValueError(f"{salida / 'exportado'} ya existe: test se mide una sola vez por salida")
    b, clases, semilla, lado = cfg["busqueda_clinica"], manifiesto["clases"], cfg["semilla"], cfg["imagen"]["lado"]
    busqueda = json.loads((salida / "busqueda.json").read_text())
    if busqueda["particion_huella"] != manifiesto["huella"]:
        raise ValueError("busqueda.json es de otra particion")
    g = ganadora(busqueda["corridas"], b["margen_fine_tuning"])
    p = {k: g[k] for k in ("vistas", "lr", "dropout", "suavizado", "pesos_clase")}
    con_ft = g["etapa"] == "3-fine-tuning"
    arq = g["arquitectura"]
    epocas_cab = g.get("epocas_cabeza", g["epocas"])
    # Con robustez.json (subcomando robustez) el aumento y las epocas salen de
    # ahi y la calibracion usa la mezcla limpia + degradadas. Sin el, todo
    # queda como en la corrida del 2026-11-17 (reproducible).
    rob = json.loads((salida / "robustez.json").read_text()) if (salida / "robustez.json").exists() else None
    aumento = "geometrico"
    if rob:
        if rob["particion_huella"] != manifiesto["huella"] or rob["arquitectura"] != arq or con_ft:
            raise ValueError("robustez.json no corresponde a la ganadora de busqueda.json")
        aumento = rob["elegido"]
        p["vistas"] = _vistas(aumento, b)
        # El modelo final usa el sorteo 0 de vistas: sus epocas y metricas OOF
        # son las de ese sorteo, no las de la corrida de busqueda.json.
        sorteo0 = next(r for r in rob["resultados"] if r["aumento"] == aumento)["repeticiones"][0]["limpia"]
        epocas_cab = sorteo0["epocas"]
        g = {**{k: v for k, v in g.items() if k != "segundos"}, **sorteo0, "aumento": aumento, "vistas": p["vistas"]}

    pool, test = _grupos(manifiesto)
    y = np.array([clases.index(i["clase"]) for i in pool])
    folds = datos.pliegues(pool, clases, b["pliegues"], semilla)
    x = _imagenes(raiz, pool, lado)
    emb = embeddings(arq, x, p["vistas"], cfg, aumento)

    # OOF de la configuracion ganadora: calibran temperatura y umbrales.
    if rob:
        emb_deg, brillo = conjuntos_degradados(arq, x, cfg)
        brillo["limpia"] = np.array([dg.brillo(im) for im in x])
        probs_oof = oof_conjuntos(emb, emb_deg, y, folds, p, cfg, epocas_cab)
        oof = probs_oof["limpia"]
    else:
        oof = np.zeros((len(y), len(clases)))
        for tr, ev in folds:
            if con_ft:
                cab, _ = entrenar_cabeza(emb, y, tr, [], p, cfg, epocas_cab)
                oof[ev] = entrenar_ft(arq, cab, x, y, tr, ev, {**p, **{k: g[k] for k in ("ft_capas", "ft_lr")}},
                                      cfg, g["epocas"])[1][-1]
            else:
                oof[ev] = entrenar_cabeza(emb, y, tr, ev, p, cfg, g["epocas"])[1][-1]

    # Modelo final: todo train+val, mismas epocas.
    todos = np.arange(len(y))
    cab, _ = entrenar_cabeza(emb, y, todos, [], p, cfg, epocas_cab)
    if con_ft:
        m, _ = entrenar_ft(arq, cab, x, y, todos, [], {**p, **{k: g[k] for k in ("ft_capas", "ft_lr")}}, cfg, g["epocas"])
    else:
        m, _ = _modelo_completo(arq, cab, cfg, p["dropout"])
        # El modelo exportado debe ser la misma funcion que se valido en CV.
        dif = np.abs(m.predict(x.astype(np.float32), verbose=0) - cab.predict(emb[0], verbose=0)).max()
        if dif > 1e-4:
            raise RuntimeError(f"base + cabeza no reproduce la cabeza sobre embeddings (max|dif| {dif:.2e})")

    objetivo = cfg["umbral"]["precision_objetivo"]
    if rob:
        mezcla = metricas.calibrar_mezcla(probs_oof, brillo, y, clases, objetivo, b["brillo_minimo"])
        raw_val, y_val = metricas.mezcla_apta(probs_oof, brillo, y, b["brillo_minimo"])
        t = mezcla["temperatura"]
    else:
        raw_val, y_val, t = oof, y, metricas.ajustar_temperatura(oof, y)
    # softmax((Wx + b) / t) = softmax((W/t)x + b/t): la temperatura queda en los
    # pesos y el .tflite sigue siendo base + Dense softmax, sin capa nueva.
    kernel, sesgo = m.layers[-1].get_weights()
    m.layers[-1].set_weights([kernel / t, sesgo / t])
    oof_t, val_t = metricas.con_temperatura(oof, t), metricas.con_temperatura(raw_val, t)
    umbral = metricas.calibrar_umbral(val_t, y_val, objetivo)

    carpeta = salida / arq
    carpeta.mkdir(parents=True, exist_ok=True)
    m.save(carpeta / "modelo.keras")
    m.save_weights(carpeta / "pesos.weights.h5")
    p_pool = m.predict(x.astype(np.float32), verbose=0)
    f1_keras_pool = metricas.metricas(y, p_pool.argmax(1), clases)["f1_macro"]
    tflites, fidelidad = {}, {}
    for v in VARIANTES:
        tflites[v] = _tflite(m, v, carpeta)
        pv = _interprete(tflites[v])(x)
        fidelidad[v] = {
            "mb": len(tflites[v]) / 1e6,
            "max_abs_dif": float(np.abs(pv - p_pool).max()),
            "coincidencia_argmax": float((pv.argmax(1) == p_pool.argmax(1)).mean()),
            "delta_f1": f1_keras_pool - metricas.metricas(y, pv.argmax(1), clases)["f1_macro"],
            "latencia_ms": _latencia_ms(_interprete(tflites[v]), lado),
        }
    variante = _elegir_variante(fidelidad, b["tolerancia_cuantizacion"], b["max_dif_probabilidad"])

    # Todo lo que sale de train+val se calcula antes de abrir test.
    if rob:
        uss = metricas.calibrar_umbral_sin_senales(val_t, y_val, clases, umbral)
        extra_rob = {
            "aumento": aumento, "mezcla_oof": mezcla,
            "umbral_alguna_senal": metricas.calibrar_umbral_senal(val_t, y_val, clases, b["precision_alguna_senal"]),
            "clases_no_fiables": metricas.clases_no_fiables(oof_t, y, clases, umbral, uss, b["minimo_fotos_clase"],
                                                            objetivo),
        }

    # --- test: unica lectura -----------------------------------------------------
    y_test = np.array([clases.index(i["clase"]) for i in test])
    x_test = _imagenes(raiz, test, lado)
    p_keras = m.predict(x_test.astype(np.float32), verbose=0)
    p_test_lite = {v: _interprete(c)(x_test) for v, c in tflites.items()}
    # Todo lo que se informa como "test" sale del .tflite que se entrega.
    p_test = p_test_lite[variante]
    p_sin_t = metricas.con_temperatura(p_test, 1 / t)  # deshace t solo para informar el ECE previo
    pred = p_test.argmax(axis=1)
    resultado = {
        "arquitectura": arq, "configuracion": g, "temperatura": t,
        "parametros": m.count_params(),
        "test": metricas.metricas(y_test, pred, clases),
        "test_keras": metricas.metricas(y_test, p_keras.argmax(1), clases),
        "test_por_variante": {v: metricas.metricas(y_test, pp.argmax(1), clases) | {
            "max_abs_dif_vs_keras": float(np.abs(pp - p_keras).max())} for v, pp in p_test_lite.items()},
        "umbral": {"oof": metricas.evaluar_umbral(oof_t, y, umbral), "test": metricas.evaluar_umbral(p_test, y_test, umbral)},
        "clinico": metricas.evaluacion_clinica(val_t, y_val, p_test, y_test, clases, umbral),
        "calibracion": {"oof_sin_t": metricas.ece(oof, y)["ece"], "oof_con_t": metricas.ece(oof_t, y)["ece"],
                        "test_sin_t": metricas.ece(p_sin_t, y_test), "test_con_t": metricas.ece(p_test, y_test)},
        "accuracy_ic95": metricas.wilson(int((pred == y_test).sum()), len(y_test)),
        "oof": metricas.metricas(y, oof.argmax(1), clases),
        "fidelidad": fidelidad, "variante": variante,
    }
    if rob:
        resultado["robustez"] = extra_rob

    entorno = {"tensorflow": tf.__version__, "keras": keras.__version__, "numpy": np.__version__, "dispositivo": "CPU"}
    modelo._exportar(resultado, TAREA_CLINICA, cfg, manifiesto, salida, entorno)
    destino = salida / "exportado"
    (destino / "modelo.tflite").write_bytes(tflites[variante])
    meta = json.loads((destino / "metadatos.json").read_text())
    meta.update({
        "tflite": f"modelo.tflite ({variante})",
        "temperatura": t,
        "calibracion_umbrales": "predicciones OOF de CV 5 pliegues por serie sobre train+val",
        "hiperparametros": g,
        "rechazadas": motivos,
    })
    if rob:
        r = resultado["robustez"]
        meta.update({
            "calibracion_umbrales": ("predicciones OOF de CV 5 pliegues por serie sobre train+val: vista limpia y "
                                     f"{len(dg.NIVELES)} copias degradadas (degradaciones.NIVELES), sin las de brillo "
                                     f"< {b['brillo_minimo']}"),
            # Propuestas para el servicio: hoy clinico.py no las lee (ver FICHA, seccion 12).
            "calidad_minima": {"brillo": b["brillo_minimo"], "lado_origen": lado_minimo(cfg, TAREA_CLINICA)},
            "umbral_alguna_senal": r["umbral_alguna_senal"],
            "clases_no_fiables": r["clases_no_fiables"],
        })
    (destino / "metadatos.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    (salida / "final.json").write_text(json.dumps(
        {"fecha": datetime.date.today().isoformat(), **resultado}, indent=2, ensure_ascii=False))
    return resultado


def main() -> None:
    parser = argparse.ArgumentParser(prog="entrenamiento.busqueda_clinica")
    parser.add_argument("comando", choices=["buscar", "robustez", "final"])
    parser.add_argument("--dataset", type=Path, required=True, help="carpeta que contiene estado_clinico/<clase>/")
    parser.add_argument("--series", type=Path, required=True)
    parser.add_argument("--salida", type=Path, required=True, help="se escribe en <salida>/estado_clinico/")
    parser.add_argument("--config", type=Path, default=RUTA_POR_DEFECTO)
    args = parser.parse_args()
    exigir_fuera_del_repo(args.salida, "--salida")

    cfg = cargar_config(args.config)
    raiz, salida = args.dataset / TAREA_CLINICA, args.salida / TAREA_CLINICA
    manifiesto, motivos = _particionar(cfg, TAREA_CLINICA, raiz, salida, args.series)
    if args.comando == "buscar":
        buscar(cfg, manifiesto, raiz, salida)
    elif args.comando == "robustez":
        print(f"elegido: {robustez(cfg, manifiesto, raiz, salida)['elegido']}; tabla en {salida / 'robustez.md'}")
    else:
        r = final(cfg, manifiesto, motivos, raiz, salida)
        t = r["test"]
        print(f"test: acc {t['accuracy']:.3f} P {t['precision_macro']:.3f} R {t['recall_macro']:.3f} "
              f"F1 {t['f1_macro']:.3f}; variante {r['variante']}; reporte en {salida / 'final.json'}")


if __name__ == "__main__":
    main()
