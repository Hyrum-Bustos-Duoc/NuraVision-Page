# Spec Delta

## Purpose
Recomendaciones orientativas de categorías de diseño de uñas según la forma
predominante del análisis, servidas con el contrato `RecomendacionesDiseno` de
`design.md` y mostradas tras un botón propio, separado del reporte clínico.
Nunca transportan ni muestran imágenes.

## ADDED Requirements

### Requirement: Contrato de recomendaciones
El servicio de recomendaciones SHALL recibir solo `forma` (una de las 5 formas o ausente) y SHALL responder con el shape `RecomendacionesDiseno` de `design.md`. Una combinación de `estado`, `base` y `motivo_general` fuera de la tabla de la regla de selección MUST NOT poder construirse. `recomendaciones` SHALL tener entre 1 y 3 elementos si `estado = "ok"` y 0 si `estado = "sin_datos"`, y MUST NOT incluir la categoría `otro`. `aviso` SHALL ser el texto fijo de `design.md`.

#### Scenario: Forma con datos suficientes
- **WHEN** las reglas cargadas tienen para `cuadrada` las recomendaciones `francesa`, `color_solido` y `glitter` y se pide `forma = cuadrada`
- **THEN** la respuesta es `estado: "ok"`, `base: "forma"`, `motivo_general: null`, `forma: "cuadrada"` y esas 3 recomendaciones en ese orden, cada una con `nombre` y `descripcion` no vacíos

#### Scenario: Forma con pocos datos
- **WHEN** la lista de `redonda` en las reglas está vacía, la lista `general` no, y se pide `forma = redonda`
- **THEN** la respuesta es `estado: "ok"`, `base: "general"`, `motivo_general: "pocos_datos_forma"`, `forma: "redonda"` y las recomendaciones de `general`

#### Scenario: Sin forma
- **WHEN** se piden recomendaciones sin `forma`
- **THEN** la respuesta es `estado: "ok"`, `base: "general"`, `motivo_general: "sin_forma"`, `forma: null` y las recomendaciones de `general`

#### Scenario: Forma inválida
- **WHEN** se pide `forma = bailarina`, `forma = ""` o `forma = CUADRADA`
- **THEN** la respuesta es un error 400 con `codigo: "forma_invalida"` y no se devuelve ninguna recomendación

#### Scenario: Invariantes del contrato
- **WHEN** se intenta construir una respuesta `ok` con `base: null`, una `sin_datos` con recomendaciones, una `ok` con 4 recomendaciones o una con la categoría `otro`
- **THEN** la validación rechaza cada una

#### Scenario: La petición no lleva imagen
- **WHEN** la UI pide recomendaciones después de un análisis
- **THEN** la petición contiene solo el parámetro `forma` (o ninguno): ni la foto, ni recortes, ni coordenadas, ni datos de las uñas

### Requirement: Degradación sin reglas
Sin un artefacto de reglas válido (no existe, no se puede leer, no cumple el shape `ReglasDiseno`, o incluye `otro`, una categoría desconocida o una recomendación con `imagenes < 5`), el servicio SHALL seguir respondiendo, cada petición válida SHALL devolver `estado: "sin_datos"` con `version_reglas: null`, y el motivo SHALL quedar en el log sin datos de la petición más allá de la forma. Nada de esto MUST producir un 5xx ni afectar a `POST /vision/analizar`.

#### Scenario: Sin artefacto
- **WHEN** el artefacto de reglas no existe y se pide `forma = ovalada`
- **THEN** la respuesta es 200 con `estado: "sin_datos"`, `recomendaciones: []`, `version_reglas: null`, y `POST /vision/analizar` responde igual que antes de este cambio

#### Scenario: Artefacto inválido
- **WHEN** el artefacto trae una recomendación con `categoria: "otro"` o con `imagenes: 3`
- **THEN** no se carga ninguna regla, el motivo queda en el log y toda petición válida devuelve `sin_datos`

#### Scenario: General vacía
- **WHEN** el artefacto es válido pero `general` está vacía y la forma pedida no tiene lista
- **THEN** la respuesta es `estado: "sin_datos"` con la `version_reglas` del artefacto

### Requirement: Botón de recomendaciones de diseño
Tras un análisis con resultado, la pantalla SHALL mostrar un botón «Ver recomendaciones de diseño», separado del botón del reporte clínico y con el mismo patrón accesible (`aria-expanded`, `aria-controls`, operable con teclado). Antes de pulsarlo MUST NOT existir en el DOM ningún texto de recomendación ni el aviso de recomendaciones, y MUST NOT haberse hecho la petición. Abrir o cerrar este bloque MUST NOT cambiar el estado del reporte clínico, y viceversa. Ningún texto del reporte clínico SHALL aparecer dentro del bloque de recomendaciones ni ningún texto de recomendaciones dentro del reporte clínico. Nada del bloque SHALL persistirse en `localStorage`, `sessionStorage` ni cookies.

#### Scenario: Antes de pulsar
- **WHEN** se muestra el resultado de un análisis con `forma_predominante = "ovalada"`
- **THEN** el botón está visible con `aria-expanded="false"`, no se ha enviado ninguna petición de recomendaciones y el DOM no contiene el aviso de recomendaciones

#### Scenario: Pulsar carga una vez
- **WHEN** se pulsa el botón, se cierra y se vuelve a abrir
- **THEN** se envía exactamente una petición, con `forma = ovalada`, y al reabrir se muestran las mismas recomendaciones

#### Scenario: Bloques independientes
- **WHEN** se abre el reporte clínico y después el bloque de recomendaciones, y se cierra el de recomendaciones
- **THEN** el reporte clínico sigue abierto y su contenido no cambió, y el bloque de recomendaciones no contiene el aviso clínico ni nombres de señales clínicas

#### Scenario: Análisis no concluyente
- **WHEN** el análisis responde `no_concluyente` (sin mano, imagen pequeña o uñas no visibles)
- **THEN** no aparece el botón y no se envía ninguna petición de recomendaciones

#### Scenario: Nueva foto
- **WHEN** con el bloque abierto o con la petición en curso, la clienta elige otra foto
- **THEN** el bloque desaparece, una respuesta que llegue después de la petición anterior no se pinta, y tras el nuevo análisis el botón vuelve a estar cerrado

### Requirement: Contenido del bloque de recomendaciones
Al abrir el bloque, la UI SHALL mostrar el aviso, una línea que diga la base y hasta 3 categorías con su `nombre` y su `descripcion`, en el orden recibido. MUST NOT mostrar imágenes, ni `frecuencia`, `afinidad` o `imagenes` en ninguna forma (porcentaje, barra o número).

| Caso | Línea de base |
|---|---|
| `base: forma` | «Diseños frecuentes para uñas {forma}» |
| `base: general`, `sin_forma` | «No pudimos reconocer con seguridad la forma de tus uñas. Estos son los diseños más frecuentes en general.» |
| `base: general`, `pocos_datos_forma` | «Aún tenemos pocos ejemplos de uñas {forma}. Estos son los diseños más frecuentes en general.» |
| `base: general`, motivo desconocido | «Estos son los diseños más frecuentes en general.» |
| `sin_datos` | «Todavía no tenemos recomendaciones de diseño.» (sin aviso ni lista) |

#### Scenario: Con forma
- **WHEN** la respuesta es `ok` con `base: "forma"`, `forma: "cuadrada"` y 2 recomendaciones
- **THEN** el bloque muestra el aviso, la línea con «cuadrada» y las 2 categorías en ese orden, sin ningún número ni imagen

#### Scenario: Respaldo general
- **WHEN** la respuesta es `ok` con `base: "general"` y `motivo_general: "sin_forma"`
- **THEN** el bloque muestra la línea de `sin_forma` y las recomendaciones generales

#### Scenario: Sin datos
- **WHEN** la respuesta es `sin_datos`
- **THEN** el bloque muestra «Todavía no tenemos recomendaciones de diseño.», sin lista, y la pantalla sigue funcionando

#### Scenario: Error de red
- **WHEN** la petición falla por red, por tiempo de espera o con un 5xx
- **THEN** el bloque muestra «No pudimos cargar las recomendaciones.» y un botón «Reintentar»; el resultado del análisis y el reporte clínico siguen visibles; pulsar «Reintentar» envía una petición nueva

#### Scenario: Respuesta con forma rota
- **WHEN** llega un 200 con `estado: "ok"` y una recomendación con `nombre: "  "`, o con `recomendaciones: []`, o con `estado: "quizas"`
- **THEN** el bloque se pinta como `sin_datos`, sin «[object Object]» ni página en blanco

#### Scenario: Aviso vacío
- **WHEN** llega `aviso: ""` o un `aviso` que no es texto
- **THEN** se muestra el texto fijo del aviso de `design.md`
