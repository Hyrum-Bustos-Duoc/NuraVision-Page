# Design

## Context

- `POST /vision/analizar` (`services/api/app/vision`) detecta manos con
  MediaPipe y, por cada dedo estirado, entrega un recorte de 224×224 en BGR con
  el dedo hacia arriba, más la forma. Los modelos se cargan una sola vez al
  arrancar (`app/main.py`). Si falta el segmentador, el servicio sigue
  funcionando y devuelve `forma = null`. Ese es el precedente de degradación
  que se copia aquí.
- El entrenamiento (`services/vision/entrenamiento`) ya calibra un umbral
  `no_concluyente` en validación con `precision_objetivo = 0.90`, elige el
  ganador por F1 macro en validación y exporta `modelo.keras`, `modelo.tflite`,
  `etiquetas.json` y `metadatos.json`. El servicio de inferencia **no tiene
  TensorFlow** y corre en Python 3.14. Lo que sí trae es OpenCV 5.0, que
  expone `cv2.dnn.readNetFromTFLite`, y MediaPipe 1.2.2, que expone
  `ImageClassifier` (ambos comprobados el 2026-11-12 en el venv del API).
- `Nail.zip` es Kaggle `arthitaya/nail-dataset` v2 (FICHA §1). Fotos con
  lado menor ≥ 64 px por carpeta, contadas el 2026-11-12 antes de quitar
  casi-duplicados: `beau_s line` 49, `black line` 47, `clubbing` 29,
  `mees_ line` 18, `normal` 49, `onycholysis` 50, `other` 39,
  `terry_s nail` 35, `white spot` 34.
- La UI ya tiene un patrón de sección expandible accesible (botón con
  `aria-expanded`/`aria-controls` en `modules/contenido/ui/EditorCarrusel.tsx`).
  Se reutiliza ese patrón en vez de inventar otro.

## Contrato de datos

Es lo primero que se acuerda. Pydantic en `services/api/app/vision` y
TypeScript en `frontend/src/modules/analisis/domain` describen el mismo objeto.
Los dos se cambian en el mismo PR, y nv-contracts verifica que coincidan
(tareas 1.1 y 6.2).

### Identificadores de clase

El modelo se entrena con 9 etiquetas. Las carpetas del zip se renombran a
estos ids en la normalización (tarea U.2):

| Carpeta en `Nail.zip` | id del modelo | ¿En el contrato público? |
|---|---|---|
| `beau_s line` | `linea_beau` | sí |
| `black line` | `linea_oscura` | sí |
| `clubbing` | `acropaquia` | sí |
| `mees_ line` | `linea_mees` | sí |
| `normal` | `sin_senales` | sí |
| `onycholysis` | `onicolisis` | sí |
| `terry_s nail` | `una_terry` | sí |
| `white spot` | `mancha_blanca` | sí |
| `other` | `otra` | **no**: nunca sale del servicio |

`normal` pasa a llamarse `sin_senales` a propósito: el sistema puede decir que
no ve las señales que conoce, pero nunca que una uña está sana.

### Pydantic (respuesta de `POST /vision/analizar`)

```python
ClaseClinica = Literal[
    "linea_beau", "linea_oscura", "acropaquia", "linea_mees",
    "onicolisis", "una_terry", "mancha_blanca", "sin_senales",
]
MotivoClinico = Literal[
    "modelo_no_entrenado",    # no hay clasificador clinico utilizable cargado
    "confianza_baja",         # bajo el umbral, o el modelo no tiene umbral
    "clase_otra",             # la clase predicha es `otra`
    "clasificacion_fallida",  # excepcion al clasificar ESTA una
]
AVISO_CLINICO = (
    "Señal orientativa para consultar con un profesional de la salud. "
    "No es un diagnóstico médico ni reemplaza una evaluación clínica."
)

class ReporteClinico(BaseModel):
    nombre: str          # no vacio
    descripcion: str     # no vacio: que se ve, no que se padece
    asociaciones: list[str]   # puede estar vacia solo en sin_senales
    recomendacion: str   # no vacio

class AlternativaClinica(BaseModel):
    clase: ClaseClinica
    nombre: str
    confianza: float     # 0..1, 3 decimales

class Clinico(BaseModel):
    estado: Literal["ok", "no_concluyente"]
    motivo: MotivoClinico | None
    clase: ClaseClinica | None
    confianza: float | None   # 0..1, 3 decimales
    alternativas: list[AlternativaClinica]
    reporte: ReporteClinico | None

class Una(BaseModel):            # existente
    ...                          # campos actuales sin cambios
    clinico: Clinico             # NUEVO, siempre presente

class ResultadoAnalisis(BaseModel):   # existente
    ...                               # campos actuales sin cambios
    aviso_clinico: str = AVISO_CLINICO     # NUEVO, siempre presente
    modelo_clinico: Modelo | None          # NUEVO; null sin clasificador cargado
```

**Invariantes de `Clinico`** (un validador de Pydantic las hace cumplir, así
que una combinación inválida no se puede construir):

| `estado` | `motivo` | `clase` | `confianza` | `alternativas` | `reporte` |
|---|---|---|---|---|---|
| `ok` | `null` | id público | 0..1 | **exactamente 2**, ordenadas de mayor a menor confianza, sin `otra`, sin `sin_senales` y sin la clase predicha | texto de `clase` |
| `no_concluyente` | uno de los 4 | `null` | `null` | `[]` | `null` |

Cuando la respuesta es no concluyente no se muestra ninguna suposición. Si se
expusieran la clase o las alternativas, la abstención dejaría de servir.

El validador comprueba el número, el orden y que no se repitan ni la clase
predicha ni entre sí; `otra` queda fuera por el tipo `ClaseClinica`. La
exclusión de `sin_senales` **no** la impone el validador (es un id público
válido): la impone la regla que elige las alternativas (decisión 9), y la
protege un test de esa regla. Con 9 etiquetas, quitar `otra`, `sin_senales` y
la predicha deja al menos 6 candidatas, así que siempre hay 2.

### TypeScript (espejo)

```ts
export type ClaseClinica =
  | 'linea_beau' | 'linea_oscura' | 'acropaquia' | 'linea_mees'
  | 'onicolisis' | 'una_terry' | 'mancha_blanca' | 'sin_senales'
export type MotivoClinico =
  | 'modelo_no_entrenado' | 'confianza_baja' | 'clase_otra' | 'clasificacion_fallida'
export interface ReporteClinico {
  nombre: string; descripcion: string; asociaciones: string[]; recomendacion: string
}
export interface AlternativaClinica { clase: ClaseClinica; nombre: string; confianza: number }
export type Clinico =
  | { estado: 'ok'; motivo: null; clase: ClaseClinica; confianza: number;
      alternativas: [AlternativaClinica, AlternativaClinica]; reporte: ReporteClinico }
  | { estado: 'no_concluyente'; motivo: MotivoClinico; clase: null; confianza: null;
      alternativas: []; reporte: null }
export interface Modelo { nombre: string; version: string }
// UnaDetectada gana `clinico?: Clinico` (ausente = servicio anterior).
// ResultadoAnalisis gana `aviso_clinico?: string` y `modelo_clinico?: Modelo | null`.
```

**Correcciones de contrato (revisión 1.1, 2026-11-12).**

- **Servicio anterior.** En Pydantic `clinico`, `aviso_clinico` y `modelo_clinico`
  son obligatorios; en TypeScript son opcionales, porque el frontend debe
  tolerar un servicio que aún no los envía. La ausencia se resuelve en un solo
  punto, `clinicoDe(una)`, que devuelve `no_concluyente` con
  `modelo_no_entrenado`. La UI no usa `?.` suelto sobre `clinico`.
- **Valores desconocidos.** La UI ramifica con `estado === 'ok'`; cualquier otro
  valor se trata como no concluyente. El mensaje por motivo recibe `string` y
  cae a un texto genérico si el motivo no se conoce (la unión cerrada de TS no
  protege contra un string nuevo que llegue por red).
- **Confianza.** Es la probabilidad **bruta** del softmax sobre las 9 clases,
  sin renormalizar al quitar `otra`. Umbrales y orden de `alternativas` usan
  ese mismo valor. Por eso `confianza` de la predicha puede ser ≥ la de cada
  alternativa, y la suma mostrada no tiene por qué dar 1.
- **Redondeo.** Quien produce el dato redondea a 3 decimales; ninguna capa lo
  valida.

**Correcciones tras QA (2026-11-12).**

- **`ok` incompleto.** Un bloque con `estado: "ok"` y `reporte` ausente o
  `null`, `clase` que no es texto o `alternativas` que no es lista viola el
  contrato, pero puede llegar por red (servicio con un bug o
  de otra versión). `clinicoDe(una)` lo trata como `no_concluyente` con
  `motivo: "clasificacion_fallida"`: la uña muestra el mensaje de ese motivo,
  sin clase ni alternativas, cuenta como no concluyente en el resumen y la
  pantalla no falla. Es el mismo punto único que ya resuelve el `clinico`
  ausente; la UI sigue sin comprobaciones sueltas.
- **Alternativas sin `sin_senales`.** Ver decisión 9.
- **`etiquetas.json` con valores que no son texto.** Ver «Lo que el servicio
  exige del modelo exportado».

La unión discriminada reproduce las invariantes: el compilador impide leer
`reporte` sin comprobar antes `estado === 'ok'`. El frontend **no** tiene un
mapa propio de nombres de clase: los nombres llegan en `reporte.nombre` y
`alternativas[].nombre`. Así, añadir o renombrar una clase no rompe la UI.

### Archivo de textos clínicos (dato, no código)

Es un archivo de datos que una persona no programadora puede editar. Se
recomienda TOML porque lo lee la librería estándar. Vive junto al servicio y se
versiona: no contiene datos de nadie.

```toml
estado_revision = "pendiente"   # "pendiente" | "revisado"
revisado_por = ""               # nombre y profesión de quien revisó
fecha_revision = ""             # AAAA-MM-DD

[clases.linea_oscura]
nombre = "Banda oscura longitudinal"
descripcion = "…"
asociaciones = ["…"]
recomendacion = "… evaluación dermatológica …"
# una tabla por cada id público (8). `otra` no tiene texto.
```

### Lo que el servicio exige del modelo exportado

El servicio lee `etiquetas.json` y `metadatos.json` (formato actual) más dos
campos nuevos, que escribe la tarea 2.3:

- `metadatos.tarea == "estado_clinico"`, y las etiquetas deben ser exactamente
  los 9 ids de la tabla. Cada valor de `etiquetas.json` debe ser texto: una
  lista, un objeto o un número en su lugar es un modelo inutilizable, no un
  error de arranque (QA 2026-11-12: un valor no hashable lanzaba `TypeError`
  al compararlo con la lista cerrada y tumbaba el servicio).
- `metadatos.umbral_no_concluyente` (ya existe) y
  `metadatos.umbral_sin_senales` (nuevo). Cualquiera de los dos puede ser
  `null`.

Si algo de esto no se cumple, el modelo **no se carga**: se registra el motivo
y el servicio responde `modelo_no_entrenado`.

## Goals / Non-Goals

**Goals:**
- Que todo el camino quede listo (guarda, partición por series, métricas,
  inferencia, contrato, UI y arnés) para que el equipo solo tenga que limpiar,
  entrenar y copiar el modelo.
- Que sin modelo el servicio siga respondiendo como hoy, más un bloque clínico
  que lo dice.
- Que el error más grave (afirmar `sin_senales` sobre una línea oscura) tenga
  una barrera explícita y una métrica que lo cuente.

**Non-Goals:**
- Entrenar, limpiar o particionar `Nail.zip` (lo hace el equipo, tareas U).
- Agregar el modelo de `estado` estético.
- Distribuir los pesos a un servidor. Igual que con el segmentador, se copian
  a mano a la carpeta de modelos. La forma definitiva sigue pendiente con
  nv-devops (README de `services/vision` §2).
- La vía de foto de una sola uña (plan B).
- Recortar la uña con la máscara del segmentador antes de clasificarla. Es la
  siguiente palanca si el arnés muestra que el recorte de MediaPipe no se
  parece a las fotos de entrenamiento (ver Riesgos).

## Decisions

1. **Misma respuesta, UI colapsada.** Los motivos y lo descartado están en
   `proposal.md`. «No se muestra de inmediato» es una regla de la interfaz, no
   un secreto: el resultado viaja en la respuesta y queda visible en las
   herramientas del navegador. Es aceptable porque es la misma persona que
   subió la foto.

2. **Guarda por tarea, con la lista cerrada en el código.**
   - `estado_clinico` es la única tarea a la que se le permiten clases
     clínicas. Su lista de clases debe coincidir **exactamente** con los 9 ids
     de la tabla: no se puede añadir ninguno (tampoco `melanoma`) ni quitar
     ninguno.
   - `forma`, `estado` y cualquier otra tarea siguen rechazando
     `TERMINOS_CLINICOS` y, además, **cualquiera de los 9 ids clínicos**. Hoy
     la guarda no detecta `linea_beau`, `una_terry` ni `mancha_blanca` porque
     no contienen ningún término de la lista. Con este cambio quedan cubiertos.
   - Las fichas externas (`uso = "solo_particion"`) siguen igual.

3. **Lado mínimo por tarea** (pendiente de Q2). Es una opción de
   configuración que sí tiene dos valores pedidos hoy: 224 para `forma` y
   `estado`, y uno menor para `estado_clinico`, porque con 224 `linea_mees` se
   queda en 0 fotos. Si el usuario elige 224 y ampliar las fotos en la
   normalización, esta opción no se implementa.

4. **Partición por series.**
   - Un archivo `archivo,serie` agrupa las fotos que son la misma uña. Una
     foto que no aparece en el archivo es una serie por sí sola.
   - La partición sigue estratificada por clase, pero cada serie cae entera en
     una sola partición, y `verificar` lo comprueba.
   - Sin archivo de series, la partición es idéntica a la de hoy (misma
     huella), así que `forma` y `estado` no cambian.
   - `estado_clinico` **exige** el archivo: sin él no particiona.
   - `comparar` rehace la misma partición de forma determinista, como hace
     hoy, así que no hay que pasarle un manifiesto aparte.

5. **Abstención en este orden, por cada uña:**
   1. Si no hay clasificador utilizable, `modelo_no_entrenado`.
   2. Si la clasificación de esa uña lanza una excepción,
      `clasificacion_fallida`. La forma y las demás uñas no se ven afectadas.
   3. Si la clase con mayor probabilidad es `otra`, `clase_otra`. Se comprueba
      antes que la confianza.
   4. Si `umbral_no_concluyente` es `null` o la confianza queda por debajo,
      `confianza_baja`.
   5. Si la clase es `sin_senales` y `umbral_sin_senales` es `null` o la
      confianza queda por debajo, `confianza_baja`.
   6. En cualquier otro caso, `ok`.

   Las mismas reglas se aplican en dos sitios: en el entrenamiento, para
   calcular las métricas después de la abstención (tarea 2.3), y en el
   servicio (tarea 3.2). Si una métrica se calcula con reglas distintas de las
   que aplica el servicio, mide un sistema que no existe. Por eso las reglas
   se escriben una sola vez si los dos entornos pueden importarlas. Si no
   pueden (Colab no tiene las dependencias del API), se duplican, y **una
   misma tabla de casos** prueba las dos copias.

6. **`umbral_sin_senales` se calibra en validación.**
   - Sea C el conjunto de confianzas de las fotos de validación cuya clase
     real **no** es `sin_senales` (incluida `otra`) y que el modelo predijo
     como `sin_senales`.
   - Si C está vacío, `umbral_sin_senales = umbral_no_concluyente`.
   - Si no, es la menor confianza **mayor que `max(C)`** entre las fotos de
     validación predichas como `sin_senales` (todas correctas, por
     construcción), y nunca menor que `umbral_no_concluyente`. Si no existe
     ninguna, es `null`, y el sistema nunca dirá `sin_senales`. Se usa el
     mismo criterio de candidatos que `calibrar_umbral`: las confianzas
     observadas.
   - Si `umbral_no_concluyente` es `null`, este también es `null`.

   Se descartó una regla del tipo «no decir `sin_senales` si `linea_oscura`
   tiene más de X %» porque agrega un número fijado a ojo. Este umbral sale de
   los datos y cubre todas las clases.

7. **Entrada del clasificador idéntica a la del entrenamiento.** El recorte
   de 224 se pasa de BGR a RGB y entra como float32 en el rango 0–255, igual
   que `entrenamiento.datos.cargar_imagen`. Un test lo comprueba píxel a píxel
   contra esa función. Una confusión entre BGR y RGB no da error y degrada el
   modelo sin que nadie lo note.

8. **Textos.**
   - Encuadre fijo: describen lo que **se ve**, nunca lo que la persona
     **tiene**.
   - Ningún texto contiene «tienes», «padeces», «sufres», «melanoma»,
     «cáncer», «benigno/a», «no es grave», «sana/sano» ni «saludable», y toda
     `recomendacion` nombra a un profesional.
   - `linea_oscura` recomienda **evaluación dermatológica**, sin nombrar ni
     descartar causas.
   - `sin_senales` dice que no se ven las señales que el sistema reconoce, y
     **no** que la uña esté sana.
   - El archivo nace con `estado_revision = "pendiente"`. La primera versión la
     redacta nv-vision como borrador, y una profesional lo revisa antes de
     producción (U.7).

9. **La UI no pinta porcentajes.**
   - Muestra el nombre de la señal, la descripción, las asociaciones y la
     recomendación.
   - Las alternativas aparecen solo en resultados `ok` con una clase distinta
     de `sin_senales`, como nombres sin número (pendiente de Q5).
   - En `sin_senales` no se muestran alternativas: se mostraría «podría ser
     una línea oscura» justo después de afirmar que no se ve nada.
   - El reverso también vale: `sin_senales` **nunca** es alternativa de una
     señal. Las alternativas excluyen `otra`, `sin_senales` y la clase
     predicha, y siguen siendo siempre 2.

   **Descartado (2026-11-12): dejar `sin_senales` como alternativa posible.**
   La primera versión de esta decisión solo excluía `otra` y la predicha. QA
   encontró que, con `linea_oscura` al 0,80 y `sin_senales` segunda, la UI
   mostraba «Otras señales parecidas: Sin señales reconocidas y …» justo
   debajo de una recomendación de evaluación dermatológica. Leído por una
   clienta, eso dice «puede que no tengas nada» y debilita la única acción que
   el reporte pide. Es el mismo error que esta decisión ya evitaba en el
   sentido contrario. Se descartó también mostrar `sin_senales` solo cuando su
   confianza supera cierto valor: agrega un número fijado a ojo (mismo motivo
   que en la decisión 6) y no cambia la lectura de la frase.

10. **Un solo botón para toda la sección**, no uno por uña.
    - La decisión 2 del dueño dice «un botón», y una mano con cinco botones
      ensucia la tarjeta.
    - El bloque expandido muestra el aviso clínico, un resumen (por mano si hay
      más de una) y el resultado de cada uña, en el mismo orden que las
      tarjetas.
    - Si ninguna uña tiene clasificador (`modelo_no_entrenado` o falta
      `clinico`), el bloque muestra solo «El reporte clínico aún no está
      disponible».

## Política de datos (biométricos y de salud)

Un resultado clínico, aunque sea orientativo, es un dato de salud. Las fotos
de manos son datos biométricos.

| Qué | Dónde | Cuánto tiempo | Quién lo lee | Cómo se borra |
|---|---|---|---|---|
| Foto subida y recortes | Memoria del proceso; Starlette usa un temporal si pasa de 1 MB | Lo que dura la petición | Nadie, fuera del proceso | Lo libera el proceso o Starlette al terminar |
| Bloque `clinico` | Solo en la respuesta HTTP y en la memoria de la pestaña | Hasta que se cierra o se recarga la pestaña | La persona que subió la foto | No se escribe en logs, `localStorage`, `sessionStorage` ni Supabase |
| Logs del servicio | Salida del proceso | Según el hosting | Equipo | Nunca contienen imagen, recorte, clase, confianza ni texto clínico; solo contadores y errores sin datos |
| Fotos del arnés y su anotación | Disco de quien lo ejecuta, **fuera del repo** | Propuesta: hasta el 2026-12-18 (igual que el README de `services/vision` §7), **pendiente de confirmar** (U.8) | El equipo, con consentimiento escrito de cada persona | Borrado manual. El arnés se niega a leer o escribir dentro del repositorio |
| Resultados del arnés por foto | Ruta que indique quien lo ejecuta, fuera del repo | Igual que las fotos | El equipo | Igual que las fotos |
| `Nail.zip` | `datasets/` en la raíz, **sin ignorar en git**, igual que `datasets.zip` (`preparacion-modelo.md` §9) | Igual que la FICHA §9 | El equipo | Ver Riesgos |

## Métricas de aceptación del modelo (propuesta, pendiente de Q4)

Se calculan con la partición por series. Las calcula el código (tareas 2.3 y
2.5) y la decisión de habilitar el modelo es del usuario (U.9).

**En test** (las escribe `comparar` en `comparativa.md`, con veredicto por
línea):

| Id | Métrica | Umbral propuesto |
|---|---|---|
| M1 | Fotos de `linea_oscura` o `acropaquia` informadas como `sin_senales` | **0** |
| M2 | Fotos de cualquier clase ≠ `sin_senales` (incluida `otra`) informadas como `sin_senales` | ≤ 1 |
| M3 | Precisión de las predicciones aceptadas | ≥ 0,90 |
| M4 | Cobertura (fracción de fotos con resultado `ok`) | ≥ 0,30 |
| — | Por clase: n, aceptadas correctas, abstenidas, aceptadas como otra clase, aceptadas como `sin_senales`, y recall estricto con IC 95 % de Wilson | se informa, sin umbral |

**En el arnés de fotos de celular** (lo escribe el arnés, tarea 2.5):

| Id | Métrica | Umbral propuesto |
|---|---|---|
| H1 | Uñas anotadas como `linea_oscura` o `acropaquia` informadas como `sin_senales` | 0 |
| H2 | Uñas anotadas como `sin_senales` que reciben una señal `ok` distinta (falsa alarma) | ≤ 10 % |
| H3 | Respuestas con error | 0 |
| — | Fotos con mano, uñas por foto, cobertura, distribución por clase y motivo, latencia p50/p95 con y sin clasificador, y desglose por subgrupo (esmalte, tono de piel, luz) | se informa |

Con 9 fotos de test por clase, M1 = 0 es compatible con una tasa real de hasta
~30 % (IC 95 %). Las métricas sirven para **impedir** habilitar un modelo malo,
no para **demostrar** que uno es bueno.

## Risks / Trade-offs

- **Licencia.** «Unknown» en Kaggle. Usarla más allá de una demo académica
  sin aclararla es un riesgo legal (U.1).
- **Regulación.** Un software que señala condiciones de la uña puede
  considerarse un dispositivo médico, aunque se presente como orientación, y
  un resultado clínico es un dato sensible. La Ley 21.719 de protección de
  datos (publicada el 2024-12-13) entraría en vigencia el 2026-12-01; la fecha
  está **sin verificar**. Hace falta una revisión legal antes de producción
  (U.8). Esta spec no la sustituye.
- **Distribución distinta.** Se entrena con recortes web ajustados a una uña
  de 60–150 px y se clasifica un recorte de punta de dedo de 224 px tomado con
  celular, con piel alrededor y a menudo con esmalte. Es probable que el
  modelo se abstenga mucho o falle de forma sistemática. Solo el arnés lo
  mide. La siguiente palanca, fuera de este cambio, es recortar con la máscara
  del segmentador.
- **`acropaquia` se ve de lado**, y MediaPipe recorta la uña de frente. Esa
  clase puede ser casi imposible de reconocer en producción, y M1 la vigila.
- **Sesgo de tono de piel** (FICHA §5): un modelo podría asociar la piel
  oscura a `linea_oscura`, cuyo origen étnico es una causa frecuente. Las
  falsas alarmas por tono se miden en el desglose por subgrupo del arnés.
- **Umbrales calibrados con ~9 fotos por clase.** Serán ruidosos y pueden
  quedar en `null`. En ese caso el comportamiento correcto es abstenerse
  siempre, y no es un fallo.
- **El agente nv-vision tiene como límite «no nombrar patologías como
  hecho».** El encuadre de esta spec («señal compatible con…, consulta a un
  profesional») es coherente con ese límite, pero el agente puede negarse a
  redactar los textos. Si pasa, el dueño debe decidir si actualiza
  `.claude/agents/nv-vision.md`. No lo hace ningún agente.
- **`datasets/` y `datasets.zip` no están ignorados en git**
  (`preparacion-modelo.md` §9). Un `git add .` subiría fotos sin licencia.
  Es un riesgo previo que este cambio agrava, porque el equipo trabajará con
  `Nail.zip`.

## Open Questions

| # | Pregunta | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| Q1 | ¿Con qué se ejecuta el `.tflite` en el servicio? | a) `cv2.dnn.readNetFromTFLite` (sin dependencia nueva) · b) `ImageClassifier` de MediaPipe (sin dependencia nueva, pero exige metadatos TFLite de normalización que la exportación de Keras no escribe) · c) `ai-edge-litert` (dependencia nueva; hay que confirmar rueda para Python 3.14) · d) TensorFlow en el API (pesado; los requisitos de entrenamiento indican Python 3.11–3.13) | a, si el spike 3.1 demuestra que coincide con Keras; si no, c | 3.2 |
| Q2 | ¿Lado mínimo de `estado_clinico`? | a) 64 px por tarea (≈ 350 fotos; `linea_mees` 18) · b) 224 y ampliar en la normalización (inventa detalle; la resolución ya está correlacionada con la clase) · c) 96 px (`linea_mees` 10, `acropaquia` 11) | a | 2.1 (solo la opción por tarea), U.4 |
| Q3 | ¿Se programan herramientas para la limpieza o solo se valida su resultado? | a) Partición por series + informe de casi-duplicados candidatos (dHash ≤ 4, solo como ayuda para revisar a mano) · b) Solo partición por series · c) Solo validar | a. La FICHA §4 ya mostró que el hash solo no sirve para agrupar, pero sí para encontrar candidatos entre 540 fotos | 2.4 |
| Q4 | ¿Se aceptan los umbrales M1–M4 y H1–H3? | Los propuestos · otros | Los propuestos | U.9 |
| Q5 | ¿Se muestran las alternativas en la UI? | a) Nombres sin número, solo en `ok` ≠ `sin_senales`, y nunca `sin_senales` entre ellas (decisión 9, 2026-11-12) · b) No mostrarlas y quitarlas del contrato | a. Las pidió el dueño, y el número es lo que confunde, no el nombre | Nada: 5.2 implementa a salvo que se indique otra cosa |
