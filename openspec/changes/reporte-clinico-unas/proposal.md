# Proposal

## Why

Hoy `/analisis-ia` localiza cada uña con MediaPipe y estima su **forma**. No
dice nada de lo que se ve en la lámina: líneas, bandas, manchas o
despegamiento. Una clienta que sube su foto no puede saber si aparece algo que
conviene mostrarle a un profesional, y el estudio no le puede dar esa
orientación.

Sabremos que el problema está resuelto cuando, con un modelo entrenado que
cumpla las métricas de `design.md`, la clienta pulse un botón y vea para cada
uña una señal con su recomendación, o «no concluyente». Sin modelo, la página
tiene que seguir funcionando igual que hoy.

### Premisas del encargo que hay que corregir

1. **`datasets/Nail.zip` sí tiene origen conocido.** Su sha256
   (`294e0f82…0064a0424`, comprobado el 2026-11-12) es idéntico byte a byte al
   `archive.zip` de Kaggle `arthitaya/nail-dataset` v2, ya documentado en
   `services/vision/datasets/kaggle_nail/FICHA.md`. Lo que sigue sin
   resolverse es la **licencia**: Kaggle la marca como «Unknown», así que no
   hay permiso de uso. Si las copias de Roboflow con CC BY 4.0 derivan de ese
   mismo set, no resuelven nada: quien sube un dataset no puede cambiarle la
   licencia.
2. **Hoy la respuesta no trae ningún «estado estético».** Solo trae la forma.
   La tarea `estado` no tiene modelo, y este cambio no la agrega.
3. **El dataset no alcanza para demostrar calidad.** Son 60 fotos por clase
   antes de quitar casi-duplicados, solo 48 de 540 llegan a 224 px, son recortes
   web de una sola uña (no fotos de mano tomadas con celular) y predominan las
   pieles claras (FICHA §3–§5). El README de `services/vision` (§1) ya
   establece que con menos de 50 fotos por clase las métricas por clase son
   anécdotas. Lo más probable es que el primer modelo no cumpla las métricas y
   se abstenga casi siempre. **Este cambio entrega un camino completo, seguro
   y medible, no un clasificador clínico útil.**
4. **Esto revierte un descarte.** El README de `services/vision` (§5,
   2026-10-27) descartó las clases clínicas porque «convierten esto en un
   dispositivo médico de hecho, con un dataset que no lo sostiene». Lo que
   cambió es la decisión del dueño del 2026-11-12. El motivo técnico del
   descarte (el dataset) **sigue igual**. El riesgo se contiene con una tarea
   separada con lista cerrada de clases, abstención calibrada, un encuadre
   fijo de «señal para consultar», la UI colapsada y la revisión profesional
   del texto antes de producción.

## Decisiones del dueño (Hyrum Bustos, 2026-11-12)

No se rediscuten aquí:

1. Se incorpora lo clínico: un **reporte clínico por uña**, además de la forma.
2. El reporte no se muestra de inmediato: aparece tras un botón que lo expande.
3. Dataset: `datasets/Nail.zip` (540 JPG, 9 clases × 60).
4. Arquitectura: MediaPipe recorta la uña y una CNN clasifica el recorte, por
   transfer learning con MobileNetV3Small/EfficientNetB0 y el código de
   `services/vision/entrenamiento`.
5. La limpieza (normalizar, casi-duplicados, partición por serie) y el
   entrenamiento los ejecuta el equipo. Este cambio deja todo listo **sin
   ejecutarlos**. Mientras no haya modelo, el servicio degrada sin inventar un
   resultado clínico.
6. Entran en el alcance la búsqueda de datasets abiertos con licencia y un
   arnés para 30–50 fotos reales de celular que aportará el usuario.

## What Changes

- **Tarea de entrenamiento `estado_clinico`**, separada de `forma` y `estado`.
  Sus clases salen de una lista cerrada **en el código**, no en
  `config.toml`. `forma` y `estado` siguen sin poder tener ninguna clase
  clínica, ni un nombre que contenga una (`posible_linea_beau`,
  `Beau's lines`, `leukonychia`).
- **Partición por series**: las fotos que el equipo marque como la misma uña
  quedan siempre en la misma partición. Para `estado_clinico` es obligatoria.
- **Métricas con abstención**: sensibilidad por clase después de la
  abstención, conteo de «falso sin señales» y un segundo umbral, más
  exigente, para afirmar `sin_senales`.
- **Servicio**: cada uña de `POST /vision/analizar` trae un bloque `clinico`
  en la **misma respuesta**. Sin modelo, el bloque dice `modelo_no_entrenado`
  y la forma no cambia.
- **Textos clínicos en un archivo de datos editable**, marcados como
  pendientes de revisión profesional. `/salud` informa si hay clasificador
  clínico cargado.
- **UI**: un botón «Ver reporte clínico» expande un bloque con el aviso
  clínico, un resumen y el resultado de cada uña. Un resultado que llega roto
  por red se muestra como no concluyente sin tumbar la página. Los textos
  fijos de la pantalla dejan de hablar de un «estado» de las uñas y dicen que
  el reporte reconoce solo algunas señales y no descarta nada.
- **Arnés de fotos reales**: mide detección, cobertura, falsas alarmas y
  latencia sobre las fotos de celular del usuario, sin escribir nada dentro del
  repositorio.
- **Documentación**: se actualizan el README de `services/vision` §5, la FICHA
  de `kaggle_nail` y el índice de `datasets/` con la decisión y lo que sigue
  sin resolver.

## Capabilities

### New Capabilities
- `reporte-clinico-unas`: el bloque clínico por uña en la respuesta, las reglas
  de abstención, los textos, la privacidad y el botón expandible.
- `entrenamiento-clinico`: la guarda por tarea, la partición por series, las
  métricas con abstención, el arnés de fotos reales y la búsqueda de datasets.

### Modified Capabilities
<!-- No hay specs previas del análisis IA en openspec/specs/. -->

## Alternativas descartadas

- **Segundo endpoint, o clasificar al pulsar el botón.** Obliga a reenviar la
  foto, a guardarla entre las dos llamadas o a aceptar un recorte enviado por
  el navegador. Los dos primeros multiplican el manejo de un dato biométrico.
  El tercero deja clasificar cualquier imagen sin pasar por MediaPipe. El costo
  de la opción elegida es correr la CNN en cada análisis aunque nadie pulse el
  botón; el arnés mide esa latencia.
- **Solo CNN sobre la foto completa** como camino principal: la red no sabe
  dónde mirar en una mano completa. Queda como posible plan B para fotos de una
  sola uña (decisión del dueño, punto 4).
- **Bandera `clinica = true` por tarea en `config.toml`.** Bastaría con editar
  el TOML para levantar la guarda en `forma`. La lista cerrada en el código
  obliga a pasar por un diff de Python revisado.
- **Exponer la clase `other` como resultado.** Es una bolsa que mezcla
  patologías y uñas con esmalte o nail art (FICHA §4). Se trata siempre como
  no concluyente y no existe en el contrato público.
- **Mostrar porcentajes de confianza en la UI.** El softmax no está calibrado
  (README §5), y un «82 %» se lee como probabilidad de tener una enfermedad. El
  número viaja en el contrato y no se pinta.
- **Un diagnóstico agregado por foto** (al estilo de `forma_predominante`).
  Cada uña tiene su resultado. Resumir «la mano tiene X» sería afirmar más de
  lo que el modelo sabe.
- **Entrenar con el `particion.json` existente de `kaggle_nail`.** Es
  aleatorio y tiene fuga real por series (FICHA §4). Sirve como registro, no
  para entrenar.
- **Nombrar melanoma en el texto de `linea_oscura`.** Una mención en un
  reporte automático funciona como alarma, y omitir la consulta funcionaría
  como descarte. El texto recomienda evaluación dermatológica sin nombrar ni
  descartar causas. La profesional puede cambiarlo, pero cambiar este criterio
  exige cambiar el test que lo protege.
- **Ofrecer `sin_senales` como alternativa de una señal** (descartado el
  2026-11-12, tras QA). Debajo de «consulta con dermatología» se leía «puede
  que no tengas nada». El motivo completo está en la decisión 9 de
  `design.md`.
- **Filtrar en la UI una alternativa inválida y mostrar el resto del
  resultado** (descartado el 2026-11-12, segunda pasada de QA). Una
  alternativa `sin_senales`, `otra` o igual a la predicha solo llega de un
  servicio roto o de otra versión, y ese mismo servicio es el que trae la
  recomendación. Se descarta el `ok` entero como `clasificacion_fallida`.
- **Exigir en el frontend exactamente 2 alternativas y una de las 8 clases
  públicas** (descartado el 2026-11-12). La UI no depende del número ni tiene
  mapa de clases: pinta los textos que llegan. Exigirlo ocultaría
  recomendaciones legibles y obligaría a tocar el frontend al añadir una
  clase. Esas invariantes las impone el esquema del servicio.
- **Guarda de entrenamiento por subcadena para todos los nombres**
  (descartado el 2026-11-12). Rechazaría `beauty`, `forma_normalizada` o
  `nosotras`. Los nombres cortos o ambiguos se buscan como palabra entera
  (decisión 2 de `design.md`).
- **Una guarda en el código que bloquee los textos sin revisión profesional.**
  No hay modelo ni despliegue público del servicio (CORS solo localhost), así
  que una guarda en el código no protegería a nadie hoy y sí impediría la
  demo. La revisión queda como condición de salida a producción (tarea U.7).

## Impact

- `services/vision`: la guarda de `config.py`, la tarea nueva en `config.toml`,
  la partición por series, las métricas, la exportación, el cuaderno de Colab,
  el arnés y la documentación.
- `services/api/app/vision`: el esquema, el clasificador de inferencia, el
  archivo de textos y su carga.
- `services/api/app/main.py`: la carga al arrancar y `/salud`.
- `frontend/src/modules/analisis`: los tipos, el resumen derivado y el bloque
  expandible.
- No toca Supabase.
- **Posible dependencia nueva** en el servicio para ejecutar el modelo: la
  decide la tarea 3.1 (pregunta abierta Q1).
