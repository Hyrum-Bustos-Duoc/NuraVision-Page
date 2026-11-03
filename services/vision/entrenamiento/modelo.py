"""Entrenamiento, evaluacion y exportacion con TensorFlow/Keras.

Unico modulo que importa TensorFlow. __main__ lo importa solo al ejecutar
`comparar`, para que la logica pura se pueda usar y probar sin TF.
"""

import datetime
import json
import shutil
import statistics
import time
from pathlib import Path

import keras
import numpy as np
import tensorflow as tf

from . import datos, metricas, reporte

DISCLAIMER = "Observacion estetica orientativa. No es un diagnostico medico."


def fijar_determinismo(semilla: int) -> None:
    # Python, numpy, TF y el SeedGenerator global de Keras.
    keras.utils.set_random_seed(semilla)
    # Ops de GPU (cuDNN) deterministas. Mas lento, pero sin esto dos
    # ejecuciones con la misma semilla terminan con pesos distintos.
    tf.config.experimental.enable_op_determinism()


def _dataset(raiz: Path, archivos: list[str], etiquetas: list[int], lado: int) -> tf.data.Dataset:
    """Imagenes normalizadas por datos.cargar_imagen (la misma funcion que debe
    usar la inferencia). Se cachean en uint8 para no releer Drive cada epoca."""
    def leer(ruta):
        return datos.cargar_imagen(Path(ruta.decode()), lado)

    def cargar(ruta, y):
        # stateful=False: leer es pura (misma ruta, misma salida). Marcada como
        # stateful, el determinismo de TF obligaria a leer en serie.
        img = tf.numpy_function(leer, [ruta], tf.uint8, stateful=False)
        return tf.ensure_shape(img, (lado, lado, 3)), y

    rutas = [str(raiz / a) for a in archivos]
    ds = tf.data.Dataset.from_tensor_slices((rutas, etiquetas))
    # tf.data conserva el orden por defecto (deterministic=True) aunque paralelice.
    ds = ds.map(cargar, num_parallel_calls=tf.data.AUTOTUNE).cache()
    return ds.map(lambda x, y: (tf.cast(x, tf.float32), y))


def _aumento(cfg_aumento: dict, semilla: int) -> keras.Sequential:
    a = cfg_aumento
    return keras.Sequential([
        keras.layers.RandomFlip("horizontal", seed=semilla),
        keras.layers.RandomRotation(a["rotacion"], seed=semilla),
        keras.layers.RandomZoom(a["zoom"], seed=semilla),  # width_factor=None conserva la proporcion
        keras.layers.RandomContrast(a["contraste"], value_range=(0, 255), seed=semilla),
    ])


def construir(arquitectura: str, n_clases: int, lado: int, dropout: float) -> tuple[keras.Model, keras.Model]:
    """Base ImageNet sin cabeza + Dropout + Dense softmax. Entrada RGB 0-255:
    las arquitecturas admitidas (config.ARQUITECTURAS) reescalan dentro."""
    base = getattr(keras.applications, arquitectura)(
        include_top=False, weights="imagenet", input_shape=(lado, lado, 3), pooling="avg"
    )
    base.trainable = False
    entrada = keras.Input((lado, lado, 3))
    # training=False fija BatchNormalization en modo inferencia tambien durante
    # el fine-tuning: si no, sus estadisticas se reajustan a lotes pequenos y
    # el modelo se degrada.
    x = base(entrada, training=False)
    x = keras.layers.Dropout(dropout)(x)
    salida = keras.layers.Dense(n_clases, activation="softmax")(x)
    return keras.Model(entrada, salida, name=arquitectura), base


def entrenar(modelo, base, train, val, pesos: dict, ent: dict) -> dict:
    """Fase 1: solo la cabeza. Fase 2: ultimas `fase2_capas` de la base, LR baja."""
    def fase(lr, epocas):
        modelo.compile(keras.optimizers.Adam(lr), "sparse_categorical_crossentropy", metrics=["accuracy"])
        parar = keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=ent["paciencia"], restore_best_weights=True
        )
        return len(modelo.fit(train, validation_data=val, epochs=epocas,
                              class_weight=pesos, callbacks=[parar], verbose=2).epoch)

    epocas1 = fase(ent["fase1_lr"], ent["fase1_epocas"])
    base.trainable = True
    limite = len(base.layers) - ent["fase2_capas"]
    for i, capa in enumerate(base.layers):
        # BatchNormalization queda congelada (guia oficial de fine-tuning de Keras).
        capa.trainable = i >= limite and not isinstance(capa, keras.layers.BatchNormalization)
    epocas2 = fase(ent["fase2_lr"], ent["fase2_epocas"])
    return {"fase1": epocas1, "fase2": epocas2}


def latencia_ms(modelo, lado: int) -> float:
    """Mediana de 50 inferencias de una imagen, tras 5 de calentamiento (la
    primera traza el grafo). Mediana y no media: robusta a pausas del entorno.
    Solo comparable entre modelos medidos en el mismo dispositivo y ejecucion."""
    inferir = tf.function(lambda x: modelo(x, training=False))
    x = tf.zeros((1, lado, lado, 3))
    for _ in range(5):
        inferir(x).numpy()
    tiempos = []
    for _ in range(50):
        t0 = time.perf_counter()
        inferir(x).numpy()  # .numpy() espera a que termine la GPU
        tiempos.append(time.perf_counter() - t0)
    return statistics.median(tiempos) * 1000


def _evaluar_arquitectura(arq, cfg, manifiesto, raiz, salida, subgrupos) -> dict:
    semilla, lado, ent = cfg["semilla"], cfg["imagen"]["lado"], cfg["entrenamiento"]
    # Misma semilla al empezar cada arquitectura: el resultado de una no
    # depende de si se entreno antes o despues que la otra.
    keras.backend.clear_session()
    fijar_determinismo(semilla)

    clases = manifiesto["clases"]
    particion = {p: datos.de_particion(manifiesto, p) for p in datos.PARTICIONES}
    lote = ent["lote"]
    aumento = _aumento(cfg["aumento"], semilla)
    train = (_dataset(raiz, *particion["train"], lado)
             .shuffle(len(particion["train"][0]), seed=semilla)
             .batch(lote)
             .map(lambda x, y: (aumento(x, training=True), y))
             .prefetch(tf.data.AUTOTUNE))
    evaluacion = {p: _dataset(raiz, *particion[p], lado).batch(lote) for p in ("val", "test")}

    modelo, base = construir(arq, len(clases), lado, ent["dropout"])
    epocas = entrenar(modelo, base, train, evaluacion["val"],
                      datos.pesos_de_clase(particion["train"][1], len(clases)), ent)

    carpeta = salida / arq
    carpeta.mkdir(parents=True, exist_ok=True)
    modelo.save(carpeta / "modelo.keras")
    # Tamano de los pesos, sin el estado del optimizador que .keras incluye.
    modelo.save_weights(carpeta / "pesos.weights.h5")

    probs = {p: modelo.predict(evaluacion[p], verbose=0) for p in ("val", "test")}
    umbral = metricas.calibrar_umbral(probs["val"], particion["val"][1], cfg["umbral"]["precision_objetivo"])
    archivos_test, y_test = particion["test"]
    pred_test = probs["test"].argmax(axis=1)
    return {
        "arquitectura": arq,
        "parametros": modelo.count_params(),
        "tamano_mb": (carpeta / "pesos.weights.h5").stat().st_size / 1e6,
        "latencia_ms": latencia_ms(modelo, lado),
        "epocas": epocas,
        "val": metricas.metricas(particion["val"][1], probs["val"].argmax(axis=1), clases),
        "test": metricas.metricas(y_test, pred_test, clases),
        "umbral": {p: metricas.evaluar_umbral(probs[p], particion[p][1], umbral) for p in ("val", "test")},
        "subgrupos_test": metricas.por_subgrupo(archivos_test, y_test, pred_test, subgrupos),
    }


def _exportar(ganador: dict, nombre_tarea: str, cfg: dict, manifiesto: dict, salida: Path, entorno: dict) -> None:
    """modelo.keras + modelo.tflite + etiquetas.json + metadatos.json."""
    destino = salida / "exportado"
    destino.mkdir(exist_ok=True)
    arq = ganador["arquitectura"]
    shutil.copy2(salida / arq / "modelo.keras", destino / "modelo.keras")

    try:
        keras.models.load_model(destino / "modelo.keras").export(destino / "modelo.tflite", format="litert")
        tflite = "modelo.tflite"
    except Exception as e:  # TFLite es opcional; el fallo queda escrito en metadatos, no se oculta.
        tflite = f"no exportado: {type(e).__name__}: {e}"

    tarea_cfg = cfg["tareas"][nombre_tarea]
    (destino / "etiquetas.json").write_text(
        json.dumps({str(i): c for i, c in enumerate(manifiesto["clases"])}, indent=2, ensure_ascii=False)
    )
    metadatos = {
        "model": {"name": f"nuravision-{nombre_tarea}-{arq}", "version": cfg["version"], "seed": cfg["semilla"]},
        "tarea": nombre_tarea,
        "feature": tarea_cfg["feature"],
        "kind": "interpretacion",
        "revision_profesional": tarea_cfg["revision_profesional"],
        "umbral_no_concluyente": ganador["umbral"]["test"]["umbral"],
        "entrada": {
            "lado": cfg["imagen"]["lado"],
            "normalizacion": "entrenamiento.datos.cargar_imagen: exif_transpose, RGB, pad a cuadrado; float32 0-255",
        },
        "tflite": tflite,
        "particion_huella": manifiesto["huella"],
        "metricas_test": {k: ganador["test"][k] for k in ("accuracy", "precision_macro", "recall_macro", "f1_macro")},
        "cobertura_test": ganador["umbral"]["test"]["cobertura"],
        "entorno": entorno,
        "fecha": datetime.date.today().isoformat(),
        "disclaimer": DISCLAIMER,
    }
    (destino / "metadatos.json").write_text(json.dumps(metadatos, indent=2, ensure_ascii=False))


def comparar(cfg: dict, nombre_tarea: str, manifiesto: dict, rechazadas: dict, raiz: Path, salida: Path) -> dict:
    """Entrena y evalua cada arquitectura sobre la MISMA particion, escribe
    comparativa.json/.md y exporta la ganadora."""
    subgrupos = datos.cargar_subgrupos(raiz)
    resultados = [
        _evaluar_arquitectura(arq, cfg, manifiesto, raiz, salida, subgrupos)
        for arq in cfg["entrenamiento"]["arquitecturas"]
    ]
    ganador = metricas.elegir_ganador(resultados)
    entorno = {
        "tensorflow": tf.__version__,
        "keras": keras.__version__,
        "numpy": np.__version__,
        "dispositivo": "GPU" if tf.config.list_logical_devices("GPU") else "CPU",
    }
    informe = {
        "tarea": nombre_tarea,
        "fecha": datetime.date.today().isoformat(),
        "particion": {k: manifiesto[k] for k in ("huella", "semilla", "clases", "conteos")},
        "rechazadas": rechazadas,
        "precision_objetivo": cfg["umbral"]["precision_objetivo"],
        "entorno": entorno,
        "ganador": ganador["arquitectura"],
        "resultados": resultados,
    }
    (salida / "comparativa.json").write_text(json.dumps(informe, indent=2, ensure_ascii=False))
    (salida / "comparativa.md").write_text(reporte.tabla_markdown(informe))
    _exportar(ganador, nombre_tarea, cfg, manifiesto, salida, entorno)
    return informe
