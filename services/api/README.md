# services/api: servicio de visión (uñas y su forma)

Servicio FastAPI que recibe una foto de una mano, detecta la mano con
MediaPipe, devuelve un recorte de cada uña y estima la **forma** de cada una
(almendra, cuadrada, ovalada, redonda o stiletto). Se usa desde la pantalla
`/analisis-ia` del frontend.

> Observación estética orientativa. No es un diagnóstico médico.

## Estado (2026-11-10)

Localiza las uñas y estima su **forma**. Todavía no juzga su **estado**: no hay
fotos etiquetadas para entrenar ese modelo (ver
`../vision/docs/preparacion-modelo.md`).

La forma sale de dos pasos: un segmentador de píxeles (bosque aleatorio de
OpenCV, no una red neuronal) traza la máscara de la uña dentro del recorte, y
una regla geométrica clasifica esa máscara (`app/vision/segmentador.py` y
`app/vision/forma.py`). Es una **estimación orientativa**: el segmentador tiene
un IoU de ~0,53 sobre recortes de prueba y los umbrales de la regla se fijaron a
ojo, no con una profesional. Cómo se entrenó está en la guía de preparación.

## Puesta en marcha (una vez)

Requiere Python 3.14 (con otra versión hay que comprobar que MediaPipe tenga
rueda para ella).

```bash
cd services/api
python3.14 -m venv .venv
.venv/bin/pip install -r requirements-test.txt
./scripts/descargar_modelo.sh        # 7,8 MB; comprueba el hash del archivo
```

El segmentador (`models/segmentador_unas.xml`, 75 MB) **no está en el
repositorio**. Se genera con `../vision/preparacion/entrenar_segmentador.py`
(unos 3 minutos; comandos en la sección 8 de la guía de preparación) o se pide
al equipo.

## Correrlo

```bash
cd services/api
.venv/bin/python -I -m uvicorn app.main:app --port 8000
```

Comprobación rápida: `curl localhost:8000/salud` debe responder
`{"ok":true,"modelo_cargado":true,"segmentador_cargado":true}`. Si
`segmentador_cargado` sale `false`, el servicio detecta uñas igual pero todas
salen con `forma: null` (falta `models/segmentador_unas.xml`, ver más abajo).

El frontend (`cd frontend && npm run dev`) lo busca en
`http://localhost:8000`. Para otra dirección, define `VITE_VISION_API_URL` en
`frontend/.env.local`.

## Contrato

`POST /vision/analizar`, multipart con el archivo en el campo `foto`
(JPEG, PNG o WebP, hasta 10 MB, lado menor de al menos 224 px).

| Caso | HTTP | Cuerpo |
|---|---|---|
| Se detectó al menos una uña | 200 | `estado: "ok"`, una `unas[]` por dedo |
| Sin mano o foto muy pequeña | 200 | `estado: "no_concluyente"`, `motivo: "sin_mano" \| "imagen_pequena"` |
| No es una imagen válida | 400 | `{codigo: "imagen_invalida", detalle}` |
| Más de 10 MB | 413 | `{codigo: "imagen_muy_grande", detalle}` |
| Falta el modelo | 503 | `{codigo: "modelo_no_disponible", detalle}` |

Un resultado "no concluyente" no es un error: la foto se leyó bien pero no hay
nada que recortar. El shape exacto está en `app/vision/esquemas.py` y se espeja
en `frontend/src/modules/analisis/domain/analisis.types.ts`; si cambia uno,
cambia el otro.

Cada elemento de `unas[]` trae `dedo`, `mano` (1 o 2), `esquinas` (cuatro
puntos 0..1 sobre la foto original) y `recorte` (JPEG de 224×224 en data URL,
con el dedo hacia arriba), más la forma:

| Campo | Tipo | Significado |
|---|---|---|
| `forma` | `almendra \| cuadrada \| ovalada \| redonda \| stiletto \| null` | `null` si no se pudo trazar una máscara creíble |
| `aspecto` | número \| null | largo / ancho de la uña |
| `punta` | número \| null | ancho del extremo / ancho máximo (1 = punta plana) |
| `forma_fiable` | bool | `true` solo para cuadrada, redonda y ovalada |
| `contorno` | `[x, y][]` | hasta 40 vértices en 0..1 sobre el recorte, para dibujarlo |

`ResultadoAnalisis.forma_predominante` es la forma fiable más frecuente entre las
uñas medidas; si hay empate o ninguna es fiable, es `null`.

## Qué hay que saber

- **El recorte es aproximado.** MediaPipe da 21 puntos de la mano, no el
  contorno de la uña. Se recorta una zona centrada en el último tramo del dedo.
  Las constantes (`ESCALA_RECORTE`, `AVANCE_CENTRO`) están en
  `app/vision/unas.py` y se ajustaron con una sola foto real de mano y con fotos
  de baja resolución del dataset de segmentación. Conviene revisarlas con más
  fotos de celular.
- **Solo se recortan los dedos estirados.** MediaPipe devuelve los 21 puntos de
  la mano aunque un dedo esté doblado y su uña quede oculta; el servicio descarta
  esos dedos (`dedo_estirado`). Los umbrales se midieron en una sola foto.
  También descarta recortes que caen casi fuera de la foto, y si no queda
  ninguna uña responde `no_concluyente` con `motivo: "unas_no_visibles"`.
- **La foto debe mostrar la mano abierta.** Con solo la punta del dedo o fotos
  clínicas muy ampliadas, MediaPipe casi no detecta (ver el informe).
- **Si se ve el dorso o la palma no se distingue.** El servicio recorta igual
  la yema; la pantalla pide mostrar el dorso.
- **Las imágenes con transparencia** (PNG, WebP) se pintan sobre fondo blanco.
- **La foto no se conserva.** No se registra en logs ni se guarda a propósito.
  Ojo: Starlette escribe las subidas de más de 1 MB en un archivo temporal que
  se borra al terminar la petición.
- **Tope de tamaño:** 10 MB de archivo y 64 megapíxeles por foto.
- CORS solo admite `localhost:5173` y `127.0.0.1:5173`. Para otro origen:
  `VISION_ORIGENES=https://mi-sitio.cl uvicorn ...` (separados por coma).
- Para apuntar a otro archivo de modelo: `VISION_MODELO=/ruta/al/modelo.task`.
  El segmentador se cambia con `VISION_SEGMENTADOR=/ruta/segmentador.xml`.
- **La forma es una estimación.** `almendra` y `stiletto` se confunden con uñas
  vistas de lado, por eso salen con `forma_fiable: false`. Con fotos de baja
  resolución del dataset el resultado se inclina a `redonda`. No se ha validado
  con fotos de clientas.

## Tests

```bash
cd services/api && .venv/bin/python -I -m pytest -q
```

No hay fotos de manos en el repositorio (son dato biométrico), así que el
camino "se detectó una mano" no tiene test automático. Se prueba con una foto
propia contra el servicio real:

```bash
cd frontend && E2E_FOTO_MANO=/ruta/a/mano.jpg npx playwright test analisis-unas
```
