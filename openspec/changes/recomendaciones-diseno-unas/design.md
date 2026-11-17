# Design

## Context

- `POST /vision/analizar` ya devuelve `forma_predominante`: la forma fiable
  más repetida entre las uñas de la foto, o `null` si no hay ninguna o hay
  empate. Solo `cuadrada`, `redonda` y `ovalada` pueden ser fiables, así que
  `forma_predominante` nunca vale `almendra` ni `stiletto`
  (`services/api/app/vision/unas.py`, `etiquetas-forma.md` §4).
- El frontend ya tiene un bloque expandible accesible tras un botón
  (`ReporteClinico`, que reutiliza el patrón de `EditorCarrusel`): monta el
  contenido solo al expandir y no persiste nada en el navegador. El bloque de
  recomendaciones reutiliza ese patrón; no es otro distinto.
- El frontend ya resuelve respuestas rotas del servicio en un único punto
  (`clinicoDe`). Las recomendaciones siguen el mismo criterio con su propio
  punto único.
- El arnés de `services/vision` (`entrenamiento/arnes.py`) ya pasa una carpeta
  de fotos por el análisis real del servicio, en proceso, se niega a leer o
  escribir dentro del repositorio y solo imprime conteos. La comparación de
  forma de la muestra lo reutiliza.
- El único bucket versionado (`contenido`, migración 0014) es público. Esa
  migración advierte que las políticas de `storage.objects` se suman por OR y
  que una política creada desde el dashboard sin filtrar por bucket abre
  cualquier bucket. El bucket de este cambio es el primero privado.
- `services/vision` ya usa Pillow para decodificar, corregir el EXIF y
  normalizar imágenes.
- `insta-dataset.zip`: 2.435 capturas, 1.181.532.857 bytes, en la raíz del
  repositorio y sin versionar. **Este cambio no lo abrió**: su contenido
  (formatos, nombres, duplicados) se conoce cuando la tarea 3.1 lo recorre.

## Goals / Non-Goals

**Goals**
- Recomendar hasta 3 categorías de diseño a partir de la forma predominante,
  con un respaldo general cuando la forma no sirve.
- Etiquetas reproducibles y auditables, versionadas sin imágenes ni datos de
  terceros.
- Saber cuánto coincide el pipeline de forma con la forma vista a ojo en este
  tipo de fotos.
- Guardar copias comprimidas del dataset en un bucket que nadie puede leer
  desde la app.

**Non-Goals**
- Mostrar imágenes del dataset a clientas o al personal desde la app.
- Detectar el diseño que lleva hoy la clienta.
- Mejorar la fiabilidad de almendra y stiletto.
- Enlazar categorías con servicios o productos del catálogo.
- Editar las reglas desde el panel de administración.

## Rebanadas

Cada una entrega algo usable por sí sola:

| Rebanada | Entrega | Tareas |
|---|---|---|
| R1. Criterio validado | Etiquetas de 100 imágenes validadas por el usuario y el acuerdo pipeline↔ojo medido | 2.1, 3.1–3.3, U.1, U.3 |
| R2. Recomendación visible | La clienta ve recomendaciones (con las reglas de la muestra, que darán casi siempre «general» por pocos datos) | 1.1, 3.4, 6.1 o 4.2, 8.x, 9.x |
| R3. Reglas con el dataset completo | Las mismas pantallas con las reglas de las ~2.435 imágenes | 3.5, 3.4 de nuevo, U.4 |
| R4. Copias en Storage | Copias comprimidas de las imágenes aptas en el bucket privado | 4.1, 5.1, 3.6, U.5 |

R2 no espera a R3: el contrato no cambia al reemplazar el artefacto de reglas.
R4 no bloquea a ninguna, pero espera a R3: solo se suben las imágenes
etiquetadas como aptas (minimización: las no aptas pueden ser memes, rostros o
promociones y no aportan nada).

## Contrato de datos

Es lo primero que se acuerda. Los tipos de Python (Pydantic en el servicio,
o validación en la agregación), TypeScript en
`frontend/src/modules/analisis/domain` y, si Q1 = b, SQL describen los mismos
objetos. nv-contracts los revisa antes (1.1) y después (9.2).

### Identificadores

```
Forma            = "almendra" | "cuadrada" | "ovalada" | "redonda" | "stiletto"   # ya existe
FormaEtiqueta    = Forma | "otra_forma" | "no_determinable"
CategoriaDiseno  = "color_solido" | "francesa" | "degradado" | "glitter"
                 | "cromado" | "arte_a_mano" | "pedreria_3d" | "otro"
MotivoNoApta     = "sin_unas_visibles" | "collage" | "no_es_foto_de_unas" | "duplicada"
```

Definiciones de etiquetado (las aplica quien etiqueta, Claude o el usuario):

| Categoría | Qué cuenta |
|---|---|
| `color_solido` | Un solo color de esmalte por uña, sin decoración. Incluye nude y un color distinto por uña |
| `francesa` | Punta de otro color que la base, incluida la francesa de color y la micro francesa |
| `degradado` | Transición continua entre colores (ombré, baby boomer) |
| `glitter` | Purpurina o brillo en partículas, en toda la uña o en parte |
| `cromado` | Acabado espejo, metálico, perlado o aurora |
| `arte_a_mano` | Dibujos, líneas, flores, patrones, marmolado o animal print. Incluye calcomanías: a ojo no se distinguen de lo pintado |
| `pedreria_3d` | Strass, piedras, relieve o apliques |
| `otro` | Con diseño que no encaja en ninguna. **Nunca se recomienda** |

- `sin_diseno`: uña natural o con brillo transparente, sin color ni
  decoración. Cualquier color es `con_diseno` con al menos `color_solido`.
- Una imagen `con_diseno` lleva entre 1 y 3 categorías, sin repetir. Las
  combinaciones (francesa con glitter) son lo normal en nail art; obligar a
  elegir una «principal» hace que dos personas etiqueten distinto.
- `forma`: la forma predominante de las uñas visibles. `otra_forma` para las
  que no son ninguna de las 5 (bailarina/coffin, squoval).
  `no_determinable` si no se ven bien las puntas.
- `motivo_no_apta`: `sin_unas_visibles` (no hay uñas o están tapadas),
  `collage` (varias manos o diseños distintos en la misma captura),
  `no_es_foto_de_unas` (texto, promoción, rostro) y `duplicada` (la misma
  publicación ya está etiquetada con otro sha256: otro recorte de la misma
  foto).

### Registro de etiqueta (uno por imagen, versionado)

```
EtiquetaImagen {
  sha256: string                 # 64 hex en minúsculas, del archivo original dentro del zip
  lote: "muestra" | "resto"
  apta: boolean
  motivo_no_apta: MotivoNoApta | null      # no null si y solo si apta = false
  forma: FormaEtiqueta | null              # null si y solo si apta = false
  diseno: "con_diseno" | "sin_diseno" | null   # null si y solo si apta = false
  categorias: CategoriaDiseno[]            # 1..3 sin repetir si con_diseno; [] en otro caso
  calidad: {                               # null si y solo si apta = false
    esmalte_parejo: boolean | null         # null = no evaluable; siempre null si sin_diseno
    cuticula_limpia: boolean | null
    bordes_limpios: boolean | null
    forma_simetrica: boolean | null
  } | null
  etiquetado_por: "claude" | "usuario"     # "usuario" si el usuario cambió algún campo
  criterios: string                        # fecha AAAA-MM-DD de la versión de estas definiciones; hoy "2026-11-17"
}
```

- **`bien_hecha` no se guarda: se calcula.** `true` si los 4 criterios son
  `true`; `false` si alguno es `false`; `null` en otro caso. Guardarlo
  permitiría que contradiga a los criterios.
- **Lo que el registro no puede contener:** nombre de archivo, ruta, username,
  texto libre, descripción de personas ni ningún dato de la captura además de
  las etiquetas. Un validador rechaza cualquier campo que no esté en este
  shape.
- El sha256 del zip completo y la lista de los 100 sha256 de la muestra quedan
  en la ficha del dataset.

### Artefacto de reglas (salida de la agregación)

```
ReglasDiseno {
  version: string            # "AAAA-MM-DD+<primeros 12 hex del sha256 del archivo de etiquetas>"
  imagenes: { etiquetadas: int, aptas: int, con_diseno: int }
  categorias: { [c in CategoriaDiseno sin "otro"]: { nombre: string, descripcion: string } }  # 7, textos no vacíos
  por_forma: { [f in Forma]: { imagenes_con_diseno: int, recomendaciones: Recomendacion[] } }  # las 5 formas, siempre
  general: Recomendacion[]
}

Recomendacion {
  categoria: CategoriaDiseno     # nunca "otro"
  frecuencia: number             # n(f,c) / N(f), 0..1, 3 decimales
  afinidad: number               # frecuencia / frecuencia general de c, >= 0, 2 decimales
  imagenes: int                  # n(f,c), >= 5
}
```

Definiciones, con valores fijos (no configurables):

- Cuentan solo las imágenes `apta`, `con_diseno` y con `forma` entre las 5
  clases. `otra_forma` y `no_determinable` cuentan en `general`, no en
  `por_forma`.
- `N(f)` = imágenes que cuentan con forma `f`; `n(f,c)` = de ellas, las que
  incluyen `c`. En `general`, `N` y `n` sobre todas las imágenes que cuentan.
- **Soporte mínimo**: una categoría entra en una lista solo si `n ≥ 5`.
- **Datos suficientes para una forma**: `N(f) ≥ 20`. Con menos, la lista de
  esa forma es `[]` aunque alguna categoría tenga 5.
- **Ranking**: por `frecuencia` descendente; empate por `afinidad`
  descendente y después por id de categoría. Máximo 3. (Q3)
- Filtro de calidad: ninguno; `bien_hecha` no filtra. (Q2)

### Contrato de respuesta: `RecomendacionesDiseno`

Entrada: solo `forma: Forma | null`. **Nunca una imagen, un recorte ni
coordenadas.** Si Q1 = a, es `GET /recomendaciones/diseno` con `forma` como
parámetro opcional; si Q1 = b, una función de la base con el mismo argumento.
Una `forma` que no es una de las 5 responde error `forma_invalida` (400 con
`{codigo, detalle}`, el mismo shape de error que ya usa el servicio).

```
RecomendacionesDiseno {
  estado: "ok" | "sin_datos"
  base: "forma" | "general" | null
  motivo_general: "sin_forma" | "pocos_datos_forma" | null
  forma: Forma | null                     # eco de la entrada
  recomendaciones: RecomendacionPublica[] # 1..3 si ok; [] si sin_datos
  aviso: string                           # no vacío
  version_reglas: string | null           # null si no hay reglas cargadas
}

RecomendacionPublica = Recomendacion + { nombre: string, descripcion: string }   # textos no vacíos
```

Texto fijo de `aviso`:
«Sugerencias orientativas según los diseños más frecuentes en publicaciones de
uñas. No evalúan el estado de tus uñas ni reemplazan la asesoría de tu
manicurista.»

**Regla de selección** (en este orden):

| Situación | `estado` | `base` | `motivo_general` | `recomendaciones` |
|---|---|---|---|---|
| Sin reglas cargadas, o reglas inválidas | `sin_datos` | `null` | `null` | `[]` |
| `forma` presente y su lista no vacía | `ok` | `forma` | `null` | la lista de esa forma |
| `forma` presente y su lista vacía, `general` no vacía | `ok` | `general` | `pocos_datos_forma` | `general` |
| `forma = null`, `general` no vacía | `ok` | `general` | `sin_forma` | `general` |
| `general` vacía (y no aplica ninguna fila anterior) | `sin_datos` | `null` | `null` | `[]` |

Las invariantes de la tabla las hace cumplir el esquema del productor: una
combinación fuera de la tabla no se puede construir.

**TypeScript (espejo, unión discriminada):**

```ts
type RecomendacionesDiseno =
  | { estado: 'ok'; base: 'forma'; motivo_general: null; forma: Forma; recomendaciones: RecomendacionPublica[]; aviso: string; version_reglas: string }
  | { estado: 'ok'; base: 'general'; motivo_general: 'sin_forma' | 'pocos_datos_forma'; forma: Forma | null; recomendaciones: RecomendacionPublica[]; aviso: string; version_reglas: string }
  | { estado: 'sin_datos'; base: null; motivo_general: null; forma: Forma | null; recomendaciones: []; aviso: string; version_reglas: string | null }
```

**Resolución en el frontend (un único punto, como `clinicoDe`):** una
respuesta con `estado` desconocido, un `ok` sin recomendaciones, o cualquier
recomendación sin `nombre` o `descripcion` de texto no vacío (solo espacios
cuenta como vacío) se trata entera como `sin_datos`. Un `aviso` vacío o que no
es texto se reemplaza por el texto fijo. Un `motivo_general` desconocido usa el
texto genérico de «general». La UI no lee `frecuencia`, `afinidad` ni
`imagenes`: viajan para auditar el orden y para que Q3 se pueda cambiar sin
tocar el contrato.

## Decisions

1. **La recomendación usa `forma_predominante`, y nada más del análisis.**
   No usa formas no fiables ni la forma de cada uña (ver «Alternativas
   descartadas» en `proposal.md`).
2. **Se carga al pulsar el botón, no durante el análisis.** Quien no pulsa no
   genera la petición, y el análisis no cambia ni tarda más.
3. **Respaldo general en vez de bloque vacío** cuando no hay forma fiable o la
   forma tiene pocos datos, diciendo siempre en cuál de los dos casos estamos.
   Se descartó pedirle a la clienta que elija su forma a mano: es una
   funcionalidad nueva que nadie pidió.
4. **Valores fijos**: hasta 3 recomendaciones, `n ≥ 5`, `N(f) ≥ 20`, muestra
   de 100 con semilla `20261117`, copias de lado mayor ≤ 1080 px, JPEG
   calidad 80, tope de 500 MB y 1 MB por objeto. Cambiar uno es un diff
   revisado de esta spec, no una opción.
5. **Etiquetas con clave sha256 y sin texto libre.** Ver «Registro de
   etiqueta».
6. **Mitigación de usernames, rostros y derechos de terceros.** Las imágenes
   no se muestran a nadie desde la app: el bucket es privado y no tiene ninguna
   política para `anon` ni `authenticated`, ni siquiera para el personal; solo
   lo usa la clave de servicio, desde la máquina de quien sube. Las copias se
   comprimen y se suben sin metadatos (EXIF, XMP, GPS). No se intenta
   difuminar rostros ni usernames: exige detectarlos imagen por imagen y no
   cambia el riesgo si las imágenes nunca se exponen. Si algún día se quiere
   mostrar ejemplos, tendrá que ser con imágenes propias del estudio.
7. **Duplicados exactos.** Dos archivos con el mismo sha256 son una sola
   imagen: se etiqueta y se cuenta una vez. Los casi-duplicados (la misma
   publicación con otro recorte) se marcan `duplicada` a ojo; no se programa
   detección automática.
8. **La comparación con el pipeline reutiliza el arnés.** Se le añade una
   anotación de forma (sha256 → forma a ojo) y la medida de acuerdo; no se
   escribe un segundo arnés.

## Política de datos

| Qué | Dónde | Quién lo lee | Retención | Cómo se borra |
|---|---|---|---|---|
| `insta-dataset.zip` | Raíz del repo, ignorado por Git | Quien tiene la copia local | Q4 | Borrando el archivo |
| Muestra extraída (100) y resto extraído | Directorio nuevo fuera del repo | Usuario; Claude durante el etiquetado | Q4 | Borrando el directorio |
| Imágenes enviadas a Claude para etiquetar | Servicio de IA externo, según su política | El proveedor | La del proveedor | No depende del estudio: por eso se exige autorización escrita (U.1) |
| Etiquetas (sha256 + etiquetas) | Versionadas en `services/vision/datasets` | Cualquiera con acceso al repo | Mientras se usen las reglas | Commit que las borra |
| Resultados por imagen de la comparación | Fuera del repo (el arnés se niega a escribir dentro) | Usuario | Q4 | Borrando la carpeta |
| Conteos agregados de la comparación | Ficha del dataset, versionada | Repo | Permanente | No contienen datos de nadie |
| Copias comprimidas | Bucket privado `referencias-diseno` | Solo la clave de servicio | Q4 | Vaciando el bucket y aplicando el rollback de su migración |
| Artefacto de reglas | Según Q1: repo o base | Público (solo números y textos de categorías) | Mientras se use | Reemplazándolo |
| Petición de recomendaciones | Navegador → servicio | Servicio | No se registra en logs más que la forma | — |

El dataset no contiene datos biométricos de clientas. Puede contener rostros
y usernames de terceros: por eso nada sale del bucket privado.

## Casos límite

| Caso | Comportamiento |
|---|---|
| Análisis con `forma_predominante = null` (almendra/stiletto no fiables, empate, sin contorno) | Botón visible; resultado `base: general`, `motivo_general: sin_forma` |
| Análisis no concluyente (sin mano, foto pequeña, uñas no visibles) | No hay pantalla de resultado, así que no hay botón ni petición |
| Forma con menos de 20 imágenes, o sin categorías con soporte | `base: general`, `motivo_general: pocos_datos_forma` |
| La clienta no lleva diseño | Irrelevante: la recomendación depende solo de la forma |
| Imágenes `sin_diseno` del dataset | Cuentan en `imagenes.aptas`, no en las frecuencias |
| Imágenes sin uñas visibles en el dataset | `apta: false`, `sin_unas_visibles`; fuera de todo cálculo |
| Forma `otra_forma` o `no_determinable` en el dataset | Cuenta solo en `general` |
| Pipeline que no detecta mano en una imagen de la muestra | Se cuenta como «no detectado» en la comparación; la etiqueta a ojo no cambia |
| Sin artefacto de reglas, o artefacto inválido | `sin_datos`; el resto del análisis y el reporte clínico intactos |
| Servicio caído o error de red al pulsar | Mensaje de error y botón «Reintentar» dentro del bloque |
| Nueva foto con la petición en curso o el bloque abierto | El bloque se cierra, la respuesta en curso se descarta |

## Risks / Trade-offs

- **Sesgo de Instagram.** Las capturas muestran tendencias y uñas esculpidas
  largas; la clienta suele tener uñas naturales. La afinidad dice «qué se
  publica con esta forma», no «qué te queda bien». El aviso lo dice.
- **Recomendaciones iguales para todas las formas.** Con ranking por
  frecuencia, `color_solido` podría encabezar todas las listas. U.4 lo revisa
  antes de servir las reglas completas, y Q3 es la salida.
- **Pocas formas fiables con datos.** Solo 3 de las 5 formas pueden llegar
  desde el análisis, y es posible que no lleguen a 20 imágenes cada una en
  Instagram. Entonces casi todo saldrá `general`.
- **El etiquetado a ojo de 2.435 imágenes es caro y lento** y depende del
  criterio validado en U.3.
- **Políticas de `storage.objects` creadas desde el dashboard** sin filtrar
  por bucket abrirían el bucket privado (advertencia de la migración 0014). La
  auditoría 5.1 lo comprueba contra el proyecto real.
- **Cuota de 1 GB compartida con el bucket `contenido`.** El tope de 500 MB
  deja margen, pero el uso real lo confirma el usuario en el dashboard (U.5).

## Open Questions

| # | Pregunta | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| Q1 | ¿Dónde viven las reglas? (abierta el 2026-11-17, decide el usuario) | a) **JSON versionado** junto a las etiquetas; el servicio de `services/api` lo carga al arrancar y expone `GET /recomendaciones/diseno`. Pros: se versiona con las etiquetas de las que sale (mismo commit, mismo diff); se revisa en un PR; sin migración, sin superficie RLS nueva; se prueba con pytest; la API ya es requisito para llegar al botón (sin análisis no hay botón). Contras: cambiar las reglas exige desplegar la API; hoy la API solo admite orígenes localhost (CORS), igual que el análisis. · b) **Tabla en Supabase** + función que aplica la regla de selección, leída por el navegador con la clave anónima. Pros: consistente con el precedente de `preparacion-modelo.md` §7.7; se actualiza sin desplegar la API; consultable en SQL. Contras: cada nueva versión de las etiquetas exige una migración de datos; añade una política de lectura anónima que auditar; la regla de selección queda en SQL y duplica lo que la agregación ya sabe; tipos regenerados en `supabase.ts` | a. La razón del precedente (reglas editoriales del estudio) no aplica a una estadística derivada de etiquetas versionadas, y nadie pidió editarlas desde el panel | 4.2, 5.2, 6.1, 7.1, 8.2 |
| Q2 | ¿Se cuentan solo las imágenes «bien hechas»? | a) Todas las `con_diseno` aptas · b) Solo `bien_hecha = true` | a. Filtrar divide los conteos por forma, que ya pueden quedar bajo 20; `bien_hecha` se informa en la ficha y se reconsidera con los conteos reales de R3 | 3.4 (una regla y su test) |
| Q3 | ¿Ranking por frecuencia o por afinidad? | a) Frecuencia, empate por afinidad · b) Afinidad (lift), con el mismo soporte mínimo | a. La afinidad con conteos de 5–20 es muy ruidosa. Si U.4 muestra listas iguales para todas las formas, cambiar a b | 3.4 (una regla y su test) |
| Q4 | ¿Retención del zip, de las extracciones, de los resultados por imagen y de las copias del bucket? | a) Hasta el 2026-12-18 (cierre del semestre, como el resto de datasets de `services/vision`), salvo renovación escrita · b) Mientras se usen las reglas | a, por consistencia con la política existente; las etiquetas y las reglas no se borran porque no contienen imágenes | U.5 (fecha de borrado en la ficha) |
| Q5 | ¿Qué acuerdo exige la validación de la muestra para escalar? | a) ≥ 85 de 100 sin corrección en `forma` y en `diseno`; en categorías y criterios de calidad se informa el acuerdo y decide el usuario · b) Lo decide el usuario sin umbral | a. Da un criterio falsable; si no se alcanza, se corrigen las definiciones y se etiqueta una muestra nueva de 30 antes de escalar | 3.5 |
