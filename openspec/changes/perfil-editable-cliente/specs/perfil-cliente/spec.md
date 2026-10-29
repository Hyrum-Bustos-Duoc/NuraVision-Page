# perfil-cliente

## Purpose
Que una persona con cuenta vea y corrija sus propios datos personales (nombre,
teléfono y cumpleaños) y que la corrección llegue al panel del personal y al
resto de la aplicación, sin poder tocar ningún otro campo de su cuenta.

## ADDED Requirements

### Requirement: Corrección del perfil propio por una sola vía
La base SHALL ofrecer a toda cuenta con sesión la función
`actualizar_mi_perfil(p_nombre, p_telefono, p_fecha_nacimiento)`, que
reemplaza `nombre`, `telefono` y `fecha_nacimiento` de la fila de `perfiles`
cuyo `id` es `auth.uid()` y devuelve una fila con los tres valores guardados.
La función MUST NOT modificar ninguna otra columna ni ninguna otra fila, y
MUST NOT poder ejecutarla una visitante sin sesión.

#### Scenario: Guardado válido
- **WHEN** una clienta con sesión llama a la función con `('Ana Pérez', '+56912345678', '1990-03-04')`
- **THEN** su fila de `perfiles` queda con esos tres valores, la función devuelve `{nombre: 'Ana Pérez', telefono: '+56912345678', fecha_nacimiento: '1990-03-04'}` y `rol`, `email`, `profesional_id` y `creado_en` no cambian

#### Scenario: Solo su propia fila
- **WHEN** la clienta A llama a la función
- **THEN** ninguna fila distinta de la de A cambia

#### Scenario: Sin sesión
- **WHEN** se llama a la función con la anon key y sin sesión
- **THEN** la petición falla con error de permisos y ninguna fila cambia

#### Scenario: El UPDATE directo sigue cerrado
- **WHEN** una clienta con sesión hace `update perfiles set nombre = 'X', rol = 'admin'` sobre su fila por PostgREST
- **THEN** afecta 0 filas y su fila conserva todas sus columnas

#### Scenario: Sin fila de perfil
- **WHEN** llama a la función una cuenta con sesión que no tiene fila en `perfiles`
- **THEN** falla con `P0001` «No encontramos tu perfil. Escríbenos para revisarlo.» y no se inserta ninguna fila

### Requirement: Reglas de los campos
La función SHALL recortar del nombre, en ambos bordes, los mismos caracteres
en blanco que `String.prototype.trim` (espacio, tab, saltos de línea, NBSP y
demás espacios Unicode) y SHALL rechazar con
`P0001`, sin modificar nada: un nombre vacío tras recortar o de más de 120
caracteres; un teléfono que no sea `''` ni cumpla `^\+56[2-9][0-9]{8}$`; y una
fecha de nacimiento no nula fuera de 1920-01-01 a la fecha actual. Un teléfono
`''` o `null` SHALL guardarse como `''`, y una fecha `null` SHALL guardarse
como `null`.

#### Scenario: Nombre vacío o solo espacios
- **WHEN** se llama con `p_nombre` igual a `''`, `'   '`, `null`, `E'\t'`, `E'\n'`, `E'\r'` o `E'\u00a0'` (NBSP)
- **THEN** falla con «Necesitamos tu nombre.» y la fila no cambia

#### Scenario: Nombre con espacios alrededor
- **WHEN** se llama con `p_nombre = '  Ana  '`, o con `'Ana'` rodeado de tab, salto de línea o NBSP
- **THEN** se guarda `'Ana'`

#### Scenario: Límite de longitud del nombre
- **WHEN** se llama con un nombre de 120 caracteres y después con uno de 121
- **THEN** el primero se guarda; el segundo falla con «El nombre admite hasta 120 caracteres.»

#### Scenario: Teléfono no canónico
- **WHEN** se llama con `p_telefono` igual a `'912345678'`, `'+56 9 1234 5678'`, `'+56012345678'` o `'+5491234567'`
- **THEN** cada llamada falla con «El teléfono debe ser un número chileno de 9 dígitos.»

#### Scenario: Teléfono vacío
- **WHEN** se llama con `p_telefono` igual a `''` o `null`
- **THEN** `perfiles.telefono` queda `''`

#### Scenario: Cumpleaños fuera de rango
- **WHEN** se llama con `p_fecha_nacimiento` igual a `'1919-12-31'` o a mañana
- **THEN** falla con «La fecha de nacimiento no es válida.»; con `'1920-01-01'` y con hoy se guarda

#### Scenario: Borrar el cumpleaños
- **WHEN** una cuenta con `fecha_nacimiento = 1990-03-04` llama con `p_fecha_nacimiento = null`
- **THEN** su `fecha_nacimiento` queda `null`

### Requirement: Copia en los metadatos de la cuenta
En la misma transacción en que guarda `perfiles`, la función SHALL escribir
`nombre`, `telefono` y `fecha_nacimiento` en `user_metadata` de la cuenta,
conservando el resto de sus claves. Si cualquiera de las dos escrituras falla,
ninguna MUST quedar aplicada.

#### Scenario: Metadatos al día
- **WHEN** una cuenta guarda `('Ana Pérez', '', null)`
- **THEN** su `user_metadata` tiene `nombre = 'Ana Pérez'`, `telefono = ''` y `fecha_nacimiento = null`, y cualquier otra clave previa sigue presente

#### Scenario: Un dato borrado no reaparece
- **WHEN** una cuenta registrada con teléfono y cumpleaños los borra con la función y después cambia su correo
- **THEN** su fila de `perfiles` sigue con `telefono = ''` y `fecha_nacimiento = null`

#### Scenario: Rol intacto
- **WHEN** una cuenta guarda su perfil
- **THEN** `app_metadata` no cambia y su `rol` en `perfiles` tampoco

### Requirement: Pantalla «Mi perfil» con la sesión real
Con sesión de Supabase, `/perfil` SHALL mostrar los datos de la fila propia de
`perfiles` y permitir corregir nombre y apellido (un solo campo), teléfono y
cumpleaños; el correo SHALL mostrarse sin poder editarse. Sin sesión, SHALL
redirigir a `/login` una vez resuelta la carga de la sesión. La pantalla MUST
NOT mostrar datos de demostración (puntos del seed, botón de borrar imágenes).

#### Scenario: Acceso con sesión
- **WHEN** una clienta con sesión abre «Mi cuenta» en el encabezado
- **THEN** llega a `/perfil` y ve su nombre, teléfono, cumpleaños y correo tal como están en `perfiles`

#### Scenario: Sin sesión
- **WHEN** una visitante sin sesión abre `/perfil`
- **THEN** termina en `/login`

#### Scenario: Recarga tras guardar
- **WHEN** la clienta cambia su teléfono a `9 8765 4321`, guarda y recarga la página
- **THEN** el campo muestra el teléfono guardado, `+56987654321`

#### Scenario: Teléfono escrito con formato libre
- **WHEN** escribe `+56 9 1234-5678`, `56912345678` o `(2) 2345 6789`
- **THEN** se guarda `+56912345678`, `+56912345678` o `+56223456789` respectivamente

#### Scenario: Error de validación
- **WHEN** deja el nombre vacío o escribe el teléfono `12345678` y pulsa «Guardar cambios»
- **THEN** ve el mensaje junto al campo, no se hace ninguna llamada a la base y lo escrito se conserva

#### Scenario: Fallo de la base
- **WHEN** la función responde con error
- **THEN** la pantalla muestra el mensaje del error si es `P0001` o uno genérico si no, sin toast de éxito y conservando lo escrito

#### Scenario: Fallo al cargar
- **WHEN** la lectura de la fila propia falla
- **THEN** la pantalla muestra un mensaje y un botón «Reintentar» que repite la lectura

#### Scenario: Doble envío
- **WHEN** pulsa «Guardar cambios» dos veces seguidas
- **THEN** se hace una sola llamada a la función

#### Scenario: Nombre nuevo en el resto de la app
- **WHEN** guarda un nombre nuevo
- **THEN** el saludo del encabezado y el contacto precargado de una reserva nueva muestran el nombre nuevo sin cerrar sesión

#### Scenario: Dos pestañas
- **WHEN** guarda el teléfono A en una pestaña y después guarda el teléfono B desde otra que tenía el formulario abierto antes
- **THEN** queda guardado B, y cada pestaña muestra tras su guardado lo que devolvió la base
