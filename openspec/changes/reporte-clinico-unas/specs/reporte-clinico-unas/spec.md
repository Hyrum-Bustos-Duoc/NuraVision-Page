# Spec Delta

## Purpose
Reporte clínico orientativo por uña en el análisis de fotos de manos: bloque
`clinico` en la respuesta de `POST /vision/analizar`, reglas de abstención,
textos editables, privacidad y presentación tras un botón expandible. Es una
señal para consultar a un profesional, no un diagnóstico.

## ADDED Requirements

### Requirement: Bloque clínico por uña
Cada elemento de `unas[]` en la respuesta de `POST /vision/analizar` SHALL incluir un bloque `clinico` con el shape del contrato de `design.md`. Una combinación que viole las invariantes (por ejemplo `estado = "ok"` con `reporte = null`, o `no_concluyente` con `clase` distinta de `null`) MUST NOT poder construirse. La respuesta SHALL incluir siempre `aviso_clinico` y `modelo_clinico`. Los campos de forma existentes MUST NOT cambiar de nombre, tipo ni valor por este cambio.

#### Scenario: Invariantes del bloque
- **WHEN** se intenta construir un bloque clínico `ok` sin `reporte`, o `no_concluyente` con `confianza`
- **THEN** la validación lo rechaza

#### Scenario: Resultado concluyente
- **WHEN** el clasificador devuelve una clase pública aceptada por las reglas de abstención
- **THEN** el bloque trae `estado: "ok"`, `motivo: null`, `clase`, `confianza` redondeada a 3 decimales, exactamente 2 `alternativas` ordenadas de mayor a menor confianza (sin `otra`, sin `sin_senales` y sin la clase predicha) y el `reporte` de esa clase

#### Scenario: Sin señales nunca es alternativa
- **WHEN** con `umbral_no_concluyente` 0,70 el clasificador devuelve `linea_oscura` 0,80, `sin_senales` 0,12, `onicolisis` 0,03, `linea_mees` 0,02 y el resto por debajo
- **THEN** el bloque es `ok` con `clase: "linea_oscura"` y `alternativas` es exactamente `onicolisis` y `linea_mees`, en ese orden; `sin_senales` no aparece en `alternativas`

#### Scenario: Siempre dos alternativas
- **WHEN** el bloque es `ok` con cualquier clase predicha, incluida `sin_senales`
- **THEN** `alternativas` tiene exactamente 2 elementos, ninguno es `otra`, `sin_senales` ni la clase predicha

#### Scenario: Sin uñas en la foto
- **WHEN** la foto no tiene mano o no tiene uñas visibles (`estado: "no_concluyente"` del análisis)
- **THEN** `unas` es `[]`, no hay bloques clínicos, y `aviso_clinico` sigue presente

#### Scenario: Varias uñas con resultados distintos
- **WHEN** una foto tiene una uña clasificada `linea_beau` y otra `sin_senales`
- **THEN** cada uña trae su propio bloque y la respuesta no incluye ningún resultado clínico agregado por foto ni por mano

### Requirement: Degradación sin modelo clínico
Sin un clasificador clínico utilizable (falta el archivo, está dañado, sus etiquetas no son exactamente los 9 ids de `design.md` o alguna no es texto, su `metadatos.tarea` no es `estado_clinico`, o falta o es inválido el archivo de textos), el servicio SHALL arrancar, `POST /vision/analizar` SHALL responder 200 con la forma intacta y cada uña con `clinico = {estado: "no_concluyente", motivo: "modelo_no_entrenado", clase: null, confianza: null, alternativas: [], reporte: null}`, y `modelo_clinico` SHALL ser `null`. Ningún caso clínico MUST producir un 5xx.

#### Scenario: Sin modelo
- **WHEN** se analiza una foto con una mano visible y no existe el modelo clínico
- **THEN** la respuesta es 200, las uñas traen las mismas formas que sin este cambio y todas tienen `clinico.motivo = "modelo_no_entrenado"`

#### Scenario: Modelo con etiquetas que no corresponden
- **WHEN** el modelo instalado tiene en `etiquetas.json` las clases de `forma`
- **THEN** no se carga, se registra el motivo en el log sin datos de imagen, `/salud` informa `clasificador_clinico_cargado: false` y las uñas salen con `modelo_no_entrenado`

#### Scenario: Etiquetas que no son texto
- **WHEN** el `etiquetas.json` instalado trae un valor que no es texto (por ejemplo `{"0": ["linea_beau"], "1": {"a": 1}, …}`)
- **THEN** el servicio arranca, `/salud` responde `ok: true` con `clasificador_clinico_cargado: false`, el motivo queda en el log sin datos de imagen y `POST /vision/analizar` responde 200 con las uñas en `modelo_no_entrenado`

#### Scenario: Falla al clasificar una uña
- **WHEN** el clasificador lanza una excepción con la segunda de tres uñas
- **THEN** la respuesta es 200, esa uña trae `motivo: "clasificacion_fallida"`, las otras dos traen su resultado y las tres conservan su forma

### Requirement: Reglas de abstención
El servicio SHALL aplicar a cada uña, en este orden, las reglas de la decisión 5 de `design.md`: sin modelo → `modelo_no_entrenado`; excepción → `clasificacion_fallida`; clase `otra` → `clase_otra`; umbral nulo o confianza bajo `umbral_no_concluyente` → `confianza_baja`; clase `sin_senales` con `umbral_sin_senales` nulo o confianza por debajo → `confianza_baja`; en otro caso `ok`. La clase `otra` MUST NOT aparecer en ningún campo de la respuesta.

#### Scenario: Clase otra
- **WHEN** la mayor probabilidad es de `otra`, incluso con confianza 0,99
- **THEN** el bloque es `no_concluyente` con `motivo: "clase_otra"` y `otra` no aparece en la respuesta

#### Scenario: Confianza bajo el umbral
- **WHEN** el umbral es 0,70 y la clase predicha `linea_beau` tiene 0,69
- **THEN** el bloque es `no_concluyente` con `motivo: "confianza_baja"` y sin clase ni alternativas

#### Scenario: Modelo sin umbral
- **WHEN** `metadatos.umbral_no_concluyente` es `null`
- **THEN** toda uña sale `no_concluyente` con `motivo: "confianza_baja"`

#### Scenario: Sin señales bajo su umbral propio
- **WHEN** `umbral_no_concluyente` es 0,70, `umbral_sin_senales` es 0,90 y la predicción es `sin_senales` con 0,85
- **THEN** el bloque es `no_concluyente` con `motivo: "confianza_baja"`

#### Scenario: Sin señales nunca afirmable
- **WHEN** `umbral_sin_senales` es `null` y la predicción es `sin_senales` con 0,99
- **THEN** el bloque es `no_concluyente` con `motivo: "confianza_baja"`

#### Scenario: Entrada igual a la del entrenamiento
- **WHEN** se toma un recorte de 224×224 en BGR del servicio
- **THEN** el tensor que recibe el clasificador es idéntico, píxel a píxel, al que produce `entrenamiento.datos.cargar_imagen` para ese mismo recorte guardado como PNG

### Requirement: Textos clínicos editables
Los textos del reporte SHALL leerse de un archivo de datos editable sin tocar código, con una entrada (`nombre`, `descripcion`, `asociaciones`, `recomendacion`) por cada uno de los 8 ids públicos y un estado de revisión que nace `pendiente`. Ningún texto MUST afirmar un diagnóstico ni que la persona padece algo. El texto de `linea_oscura` SHALL recomendar evaluación dermatológica y MUST NOT nombrar ni descartar causas. El texto de `sin_senales` MUST NOT afirmar que la uña está sana.

#### Scenario: Falta una clase en el archivo
- **WHEN** el archivo de textos no tiene entrada para `una_terry`
- **THEN** el clasificador clínico no se carga y las uñas salen con `modelo_no_entrenado`

#### Scenario: Lenguaje de diagnóstico
- **WHEN** un test recorre todos los textos
- **THEN** ninguno contiene «tienes», «padeces», «sufres», «melanoma», «cáncer», «benigno», «benigna», «no es grave», «sana», «sano» ni «saludable» como palabras completas (sin distinguir mayúsculas ni tildes), y toda `recomendacion` contiene «profesional», «dermatólog» o «médic»

#### Scenario: Línea oscura
- **WHEN** se lee el texto de `linea_oscura`
- **THEN** su `recomendacion` contiene «dermatológ»

#### Scenario: Marca de revisión
- **WHEN** se lee el archivo de textos tal como lo entrega este cambio
- **THEN** su estado de revisión es `pendiente`

### Requirement: Privacidad del resultado clínico
El servicio MUST NOT escribir en logs la imagen, los recortes, la clase, la confianza ni los textos de ningún análisis. El frontend MUST NOT persistir el resultado clínico en `localStorage`, `sessionStorage`, cookies ni Supabase. El resultado clínico SHALL existir solo en la respuesta HTTP y en la memoria de la pestaña.

#### Scenario: Logs limpios
- **WHEN** se analiza una foto con un clasificador falso que devuelve `linea_oscura` y se capturan todos los registros de log
- **THEN** ninguno contiene `linea_oscura`, el nombre de la clase, la confianza ni datos de imagen

#### Scenario: Nada persistido en el navegador
- **WHEN** se completa un análisis con resultado clínico y se abre el reporte
- **THEN** ninguna clave de `localStorage` ni de `sessionStorage` contiene ids de clase clínica ni textos del reporte

### Requirement: Estado del clasificador en salud
`GET /salud` SHALL incluir `clasificador_clinico_cargado` (booleano), además de los campos actuales.

#### Scenario: Salud sin modelo clínico
- **WHEN** el servicio arranca sin modelo clínico
- **THEN** `/salud` responde `ok: true`, con `modelo_cargado` y `segmentador_cargado` como hoy, y `clasificador_clinico_cargado: false`

### Requirement: Reporte tras un botón
La pantalla de análisis SHALL mostrar el reporte clínico solo después de que la persona pulse el botón «Ver reporte clínico». Antes de pulsarlo, MUST NOT verse ningún nombre de clase, texto del reporte ni el aviso clínico. El botón SHALL indicar su estado con `aria-expanded`, operar con el teclado y volver a colapsar el bloque al pulsarlo de nuevo. Al analizar otra foto, el bloque SHALL volver a estar colapsado. El botón MUST NOT aparecer si el análisis no encontró uñas.

#### Scenario: Colapsado al cargar
- **WHEN** llega un resultado con una uña `linea_beau`
- **THEN** se ve el botón con `aria-expanded="false"` y el texto «Línea de Beau» (o el `reporte.nombre` que corresponda) no está en el documento

#### Scenario: Expandir y colapsar
- **WHEN** se pulsa el botón y después se vuelve a pulsar
- **THEN** primero aparece el bloque con el aviso clínico al inicio y `aria-expanded="true"`, y después desaparece y vuelve a `"false"`

#### Scenario: Nueva foto
- **WHEN** con el bloque abierto se analiza otra foto
- **THEN** el bloque del nuevo resultado empieza colapsado

#### Scenario: Sin uñas
- **WHEN** el análisis responde `no_concluyente` con `motivo: "sin_mano"`
- **THEN** no existe el botón «Ver reporte clínico»

#### Scenario: Servicio sin modelo clínico
- **WHEN** todas las uñas traen `motivo: "modelo_no_entrenado"`, o la respuesta no trae `clinico` (servicio anterior a este cambio)
- **THEN** al expandir se ve solo «El reporte clínico aún no está disponible», sin lista por uña, y la sección de forma se ve igual que antes

### Requirement: Contenido del bloque expandido
El bloque expandido SHALL mostrar el `aviso_clinico` recibido, un resumen y, en el mismo orden que las tarjetas de uñas, el resultado de cada uña identificada por dedo (y por mano si hay más de una). Una uña `ok` SHALL mostrar nombre, descripción, asociaciones y recomendación. Una uña `no_concluyente` SHALL mostrar un mensaje por motivo, sin clase ni alternativas. La UI MUST NOT mostrar porcentajes ni valores de confianza. Las alternativas, si se muestran, SHALL ser solo nombres, solo en resultados `ok` distintos de `sin_senales`, y MUST NOT incluir «Sin señales reconocidas» ni ningún otro nombre de `sin_senales`. Un bloque `ok` sin `reporte`, sin `clase` de texto o sin lista de `alternativas` SHALL tratarse como `no_concluyente` con `motivo: "clasificacion_fallida"`.

#### Scenario: Resumen de una mano
- **WHEN** hay 5 uñas: 1 `linea_beau`, 2 `sin_senales` y 2 `confianza_baja`
- **THEN** el resumen dice que de 5 uñas, 1 muestra una señal para consultar, 2 no muestran señales reconocidas y 2 no fueron concluyentes

#### Scenario: Resumen con dos manos
- **WHEN** `manos` es 2 y hay uñas de las dos
- **THEN** el resumen se muestra por separado para la mano 1 y la mano 2

#### Scenario: Sin porcentajes
- **WHEN** se expande un reporte con `confianza: 0.873`
- **THEN** el bloque no contiene «87», «0,87», «0.87» ni el signo «%»

#### Scenario: Motivo desconocido
- **WHEN** una uña trae un `motivo` que el frontend no conoce
- **THEN** se muestra el mensaje genérico de no concluyente y la pantalla no falla

#### Scenario: Resultado ok incompleto
- **WHEN** una uña trae `clinico` con `estado: "ok"` y `reporte` ausente o `null`, o `clase` que no es texto, o `alternativas` que no es una lista (respuesta que viola el contrato)
- **THEN** al expandir, esa uña muestra el mensaje de `clasificacion_fallida`, sin nombre de clase, descripción ni alternativas; el resumen la cuenta como no concluyente; las demás uñas se muestran normalmente y la pantalla no falla
