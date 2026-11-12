# Spec Delta

## Purpose
Entrenamiento y evaluación de la tarea `estado_clinico` sin debilitar la guarda
de las tareas estéticas: lista cerrada de clases, partición por series,
métricas que cuentan la abstención, arnés de fotos reales y registro de
datasets candidatos. Nada de esto ejecuta la limpieza ni el entrenamiento de
`Nail.zip`: eso lo hace el equipo.

## ADDED Requirements

### Requirement: Guarda clínica por tarea
La carga de la configuración SHALL aceptar clases clínicas solo en la tarea `estado_clinico`, y solo si su lista de clases coincide exactamente con los 9 ids de `design.md`. Cualquier otra tarea MUST rechazarse si alguna de sus clases contiene un término de `TERMINOS_CLINICOS` o coincide con uno de esos 9 ids. La lista de 9 ids SHALL vivir en el código, no en `config.toml`. Las fichas externas con `uso = "solo_particion"` SHALL seguir rechazándose como configuración de entrenamiento.

#### Scenario: Configuración por defecto
- **WHEN** se carga el `config.toml` del repositorio
- **THEN** carga sin error con las tareas `forma`, `estado` y `estado_clinico`

#### Scenario: Id clínico en una tarea estética
- **WHEN** se añade `mancha_blanca` a las clases de `estado`
- **THEN** la carga falla con un mensaje que nombra la tarea y la clase

#### Scenario: Término clínico en forma
- **WHEN** se añade `onicolisis` a las clases de `forma`
- **THEN** la carga falla, igual que hoy

#### Scenario: Clase extra en la tarea clínica
- **WHEN** se añade `melanoma` a las clases de `estado_clinico`
- **THEN** la carga falla

#### Scenario: Clase faltante en la tarea clínica
- **WHEN** se quita `otra` de las clases de `estado_clinico`
- **THEN** la carga falla

#### Scenario: Otra tarea clínica con otro nombre
- **WHEN** se define una tarea `clinica2` con las mismas 9 clases
- **THEN** la carga falla

### Requirement: Lado mínimo por tarea
Una tarea SHALL poder declarar su propio lado mínimo de foto. Si no lo declara, SHALL aplicarse el global (224). Este requisito depende de Q2: si el dueño elige 224 con ampliación, se retira.

#### Scenario: Foto chica en la tarea clínica
- **WHEN** `estado_clinico` declara 64 y una foto de su dataset mide 70 px de lado menor
- **THEN** se acepta, y la misma foto en `forma` se rechaza con `resolucion_insuficiente`

### Requirement: Partición por series
La partición SHALL aceptar un archivo `archivo,serie` que agrupa fotos de la misma uña, y SHALL poner cada serie entera en una sola partición, manteniendo la estratificación por clase. La verificación del manifiesto SHALL fallar si una serie aparece en dos particiones. Sin archivo de series, la partición SHALL ser idéntica a la actual. `estado_clinico` MUST exigir el archivo de series.

#### Scenario: Serie unida
- **WHEN** tres fotos de `acropaquia` comparten la serie `s7`
- **THEN** las tres quedan en la misma partición

#### Scenario: Manifiesto alterado
- **WHEN** se edita un manifiesto para mover una foto de la serie `s7` a otra partición y se recalcula su huella
- **THEN** la verificación falla y nombra la serie

#### Scenario: Sin series en tareas estéticas
- **WHEN** se particiona `forma` sin archivo de series, con el mismo dataset y la misma semilla que antes del cambio
- **THEN** la huella es idéntica a la anterior

#### Scenario: Tarea clínica sin series
- **WHEN** se particiona `estado_clinico` sin archivo de series
- **THEN** falla con un mensaje que pide el archivo

#### Scenario: Serie con dos clases
- **WHEN** una serie contiene una foto de `linea_mees` y otra de `mancha_blanca`
- **THEN** todas las fotos de esa serie se rechazan con `etiqueta_conflictiva`

#### Scenario: Serie que nombra un archivo inexistente
- **WHEN** el archivo de series menciona una foto que no está en el dataset
- **THEN** la partición falla y la consola muestra el número de filas inválidas, sin nombres de archivo

#### Scenario: Carpetas de Kaggle sin renombrar
- **WHEN** se particiona `estado_clinico` sobre las carpetas originales (`black line`, `beau_s line`…)
- **THEN** falla porque las carpetas no coinciden con las clases

### Requirement: Métricas con abstención y umbral de sin señales
El entrenamiento de `estado_clinico` SHALL calibrar `umbral_sin_senales` en validación según la decisión 6 de `design.md` y SHALL exportarlo en `metadatos.json` junto a `tarea: "estado_clinico"`. El informe de la comparativa SHALL incluir, por clase y en test, después de aplicar las reglas de abstención: n, aceptadas correctas, abstenidas, aceptadas como otra clase, aceptadas como `sin_senales`, y recall estricto con IC 95 % de Wilson. Además SHALL incluir el valor y el veredicto de M1–M4.

#### Scenario: Ningún falso sin señales en validación
- **WHEN** en validación ninguna foto de otra clase se predice `sin_senales`
- **THEN** `umbral_sin_senales` es igual a `umbral_no_concluyente`

#### Scenario: Falso sin señales con confianza alta
- **WHEN** una foto de `linea_oscura` de validación se predice `sin_senales` con 0,93, el umbral general es 0,70 y la menor confianza de una predicción `sin_senales` correcta por encima de 0,93 es 0,96
- **THEN** `umbral_sin_senales` es 0,96

#### Scenario: Sin señales imposible de afirmar
- **WHEN** el falso `sin_senales` de mayor confianza tiene una confianza que ninguna predicción `sin_senales` correcta supera
- **THEN** `umbral_sin_senales` es `null`

#### Scenario: Veredicto M1
- **WHEN** en test una foto de `acropaquia` queda aceptada como `sin_senales`
- **THEN** la línea M1 del informe marca «no cumple» con el conteo 1

#### Scenario: Tareas estéticas sin cambios
- **WHEN** se entrena `forma`
- **THEN** su `metadatos.json` no incluye `umbral_sin_senales` y sus métricas se calculan como hoy

### Requirement: Arnés de fotos reales
SHALL existir un arnés que pase una carpeta de fotos de celular por el mismo análisis que usa el servicio (MediaPipe, forma y bloque clínico) y calcule las métricas H1–H3 y las informativas de `design.md`. La anotación (archivo, dedo opcional, clase esperada opcional y columnas libres de subgrupo) SHALL ser opcional. La consola SHALL mostrar solo conteos y métricas, nunca nombres de archivo. El arnés MUST negarse a leer fotos o escribir resultados dentro del repositorio. Sin modelo clínico, SHALL funcionar e informar la cobertura de MediaPipe con todas las uñas en `modelo_no_entrenado`.

#### Scenario: Salida dentro del repo
- **WHEN** se indica como salida una ruta dentro del repositorio
- **THEN** termina con error antes de procesar ninguna foto

#### Scenario: Sin anotación
- **WHEN** se ejecuta sin archivo de anotación
- **THEN** informa fotos con mano, uñas por foto, distribución de estado, motivo y clase, y latencia p50/p95, y marca H1 y H2 como «sin anotación»

#### Scenario: Falsa alarma
- **WHEN** 10 uñas anotadas `sin_senales` reciben 2 resultados `ok` con `mancha_blanca`
- **THEN** H2 informa 20 % y «no cumple»

#### Scenario: Sin modelo
- **WHEN** se ejecuta sin modelo clínico instalado
- **THEN** termina sin error y todas las uñas cuentan como `modelo_no_entrenado`

#### Scenario: Nombres fuera de la consola
- **WHEN** se ejecuta sobre una carpeta con fotos cuyos nombres contienen nombres de personas
- **THEN** ninguno aparece en la salida de consola

### Requirement: Informe de casi-duplicados candidatos
(Pendiente de Q3.) SHALL existir una herramienta que liste pares candidatos de casi-duplicados dentro de un dataset (dHash de 64 bits, distancia ≤ 4) para revisarlos a mano. MUST NOT asignar series de forma automática. La consola SHALL mostrar solo el número de pares, y la lista nominal SHALL escribirse fuera del repositorio.

#### Scenario: Copia girada
- **WHEN** el dataset contiene una foto y su copia recortada un 5 % por el borde
- **THEN** el par aparece como candidato

#### Scenario: Fotos distintas
- **WHEN** el dataset contiene dos fotos sin relación
- **THEN** el par no aparece

### Requirement: Registro de datasets candidatos
El índice de datasets SHALL registrar cada dataset abierto candidato con su URL, la licencia declarada, si esa licencia se verificó en la página de origen (con fecha) o quedó sin verificar (con motivo), las clases que coinciden con las de `estado_clinico` y si deriva de `arthitaya/nail-dataset`. Un dataset con clases fuera de la lista cerrada (por ejemplo melanoma) SHALL figurar como «no utilizable» con el motivo. Ninguno SHALL usarse para entrenar sin su FICHA.

#### Scenario: Dataset con melanoma
- **WHEN** se registra `nail-diseases-2`, que incluye melanoma acral
- **THEN** figura como no utilizable para `estado_clinico`, con ese motivo

#### Scenario: Licencia no comprobable
- **WHEN** la página del dataset responde 403
- **THEN** la licencia figura «sin verificar (403, 2026-11-12)» y no como CC BY 4.0
