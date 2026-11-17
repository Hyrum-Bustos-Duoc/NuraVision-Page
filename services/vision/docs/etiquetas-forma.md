# Etiquetas de forma calculadas desde las máscaras

Fecha: 2026-11-10. Script: `preparacion/etiquetar_forma.py`. Tests: `tests/test_forma.py`.

> Observación estética orientativa. No es un diagnóstico médico.

## 1. Para qué sirve esto

Para entrenar un modelo que distinga la **forma** de la uña (`almendra`,
`cuadrada`, `ovalada`, `redonda`, `stiletto`, las clases de `config.toml`)
hace falta que cada foto diga a qué clase pertenece. Los datasets que tenemos
no traen esa información: `NailSegmentationDatasetV2` solo dice **dónde está**
la uña (una máscara), no cómo es.

Como la forma es una propiedad geométrica del contorno, se puede **calcular**
desde la máscara en vez de etiquetar a mano. Eso da etiquetas de forma sin
costo, pero son **pseudo-etiquetas**: salen de una regla, no del juicio de una
profesional.

## 2. Cómo se calcula

Sobre la partición limpia de `preparar_segmentacion.py` (6.689 fotos), cada
mancha de la máscara es una uña. De cada una se miden dos cosas:

- **aspecto** = largo / ancho, a lo largo de su eje principal.
- **punta** = ancho del extremo más afilado / ancho máximo. Cerca de 1 es una
  punta plana; alrededor de 0,65 es redondeada; bajo 0,5 se afila.

| Clase | Regla (se evalúa en este orden) |
|---|---|
| stiletto | aspecto ≥ 1,8 y punta ≤ 0,35 |
| almendra | aspecto ≥ 1,3 y punta ≤ 0,50 |
| cuadrada | punta ≥ 0,85 |
| redonda | aspecto < 1,25 |
| ovalada | todo lo demás |

Se descartan las uñas con menos de 400 px (el contorno es ruido), las cortadas
por el borde de la foto y las de forma irregular (solidez < 0,85, normalmente
dos uñas pegadas). Los umbrales se fijaron a ojo y se revisaron mirando
ejemplos; **no están calibrados contra ninguna profesional**.

## 3. Resultado

27.226 uñas etiquetadas. Se descartaron 1.609: 1.041 muy pequeñas, 471 cortadas
por el borde y 97 irregulares.

| Partición | almendra | cuadrada | ovalada | redonda | stiletto |
|---|---|---|---|---|---|
| train | 3.477 | 219 | 14.199 | 3.360 | 356 |
| val | 342 | 18 | 2.129 | 367 | 44 |
| test | 419 | 36 | 1.789 | 424 | 47 |

## 4. Revisión visual: solo tres clases son creíbles

Se revisaron 9 ejemplos al azar por clase (semilla 7), con el contorno de la
máscara dibujado sobre la foto. Lo que se vio:

- **cuadrada, redonda, ovalada:** los contornos corresponden a lo que dice la
  etiqueta, con ruido. Son etiquetas utilizables, no perfectas.
- **almendra y stiletto:** casi todos los ejemplos son uñas naturales **vistas
  de lado, tapadas por otro dedo o con la máscara angosta**. La regla las ve
  puntiagudas por el ángulo de la foto, no porque tengan esa forma. Las fotos del
  dataset son de uñas naturales: no hay almendras ni stilettos reales.

Por eso el archivo de salida lleva el campo `fiable`, que es verdadero solo para
`cuadrada`, `redonda` y `ovalada` (22.541 de las 27.226). **No se debe entrenar
con las etiquetas `almendra` ni `stiletto`.** Para esas dos clases hacen falta
fotos reales de uñas almendradas y en punta, por ejemplo las del propio estudio.

## 5. Límites que hay que tener presentes

1. **La proporción depende del ángulo de la foto.** Una uña vista en escorzo
   parece más larga o más angosta de lo que es. Con una máscara en 2D no se
   corrige.
2. **Desbalance fuerte.** Entre las fiables, `cuadrada` suma solo 273 uñas contra
   18.117 de `ovalada`. Un modelo entrenado así casi nunca predice `cuadrada`.
3. **Las uñas son pequeñas.** La mediana ocupa 1.404 px (unos 37×37). Los recortes
   quedan por debajo del mínimo de 224 px que exige `entrenamiento/` (`lado_minimo`),
   así que **no se pueden pasar tal cual al clasificador actual**. Agrandarlos
   inventaría detalle, que es justo lo que ese mínimo evita.
4. **La regla ya es un clasificador.** Si en producción se tiene la máscara de la
   uña, basta aplicar la misma regla; no hace falta una CNN. Una CNN entrenada con
   estas etiquetas aprendería a imitar la regla, no a ver mejor que ella.

## 6. Qué conviene hacer con esto

- **Camino corto para `forma`:** entrenar un segmentador de uñas con las 6.689
  máscaras, y en producción segmentar y aplicar la regla sobre el recorte. Reutiliza
  los datos ya preparados y no depende de etiquetas.
- **Medir cuánto vale la regla:** pedir a una profesional que etiquete unas 100
  uñas con las cinco clases y comparar con la regla. Es lo único que da un número
  real de acierto.
- **Para `almendra` y `stiletto`:** reunir fotos reales con consentimiento.
- **Para `estado`:** esta técnica no sirve. No hay nada en la máscara que diga si
  la cutícula está descuidada o el esmalte deteriorado.

## 7. Cómo repetirlo

```bash
# 1. Partición limpia (ver preparacion-modelo.md, sección 8)
python -I services/vision/preparacion/preparar_segmentacion.py RUTA/NailSegmentationDatasetV2 particion_seg.json

# 2. Etiquetas de forma (necesita numpy y opencv-python-headless)
python -I services/vision/preparacion/etiquetar_forma.py RUTA/NailSegmentationDatasetV2 particion_seg.json forma_etiquetas.json

# 3. Tests de la regla (siluetas geométricas, sin fotos)
cd services/vision && python -m pytest tests/test_forma.py
```

`forma_etiquetas.json` no se versiona: lista rutas del dataset, cuya licencia
está sin aclarar. Se guarda junto al dataset, en el Drive del proyecto.

## Uso en el servicio (2026-11-10)

La misma regla corre hoy en producción: `services/api/app/vision/forma.py` es
una copia de `etiquetar_forma.py` y `services/api/tests/test_forma.py` comprueba
que ambas dan lo mismo. La diferencia es de dónde sale la máscara: aquí viene
del dataset (la dibujó una persona); en el servicio la traza el segmentador de
píxeles, con un IoU de ~0,53. Por eso la forma que ve el cliente es menos
precisa que las etiquetas de este documento.
