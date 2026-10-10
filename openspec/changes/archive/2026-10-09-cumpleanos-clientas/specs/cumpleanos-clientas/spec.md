# Spec Delta

## Purpose
Que el personal del estudio vea el cumpleaños que cada clienta declaró al
registrarse y sepa quién cumple en los próximos días, sin exponer el dato a
nadie más.

## ADDED Requirements

### Requirement: Réplica validada del cumpleaños en el alta
Al crearse una cuenta, la base SHALL guardar en `perfiles.fecha_nacimiento` la
fecha de `user_metadata.fecha_nacimiento` solo si es un texto `YYYY-MM-DD` que
corresponde a una fecha existente entre 1920-01-01 y la fecha actual, ambos
incluidos; en cualquier otro caso SHALL guardar `null`. Un valor inválido MUST
NOT hacer fallar el alta de la cuenta.

#### Scenario: Fecha válida
- **WHEN** se registra una cuenta con `fecha_nacimiento = '1990-03-04'`
- **THEN** su fila de `perfiles` tiene `fecha_nacimiento = 1990-03-04`

#### Scenario: Sin cumpleaños
- **WHEN** se registra una cuenta sin la clave `fecha_nacimiento` en `user_metadata`
- **THEN** la cuenta se crea y su `fecha_nacimiento` es `null`

#### Scenario: Fecha inexistente
- **WHEN** se crea una cuenta con `fecha_nacimiento = '1990-02-30'`
- **THEN** la cuenta y su perfil se crean y `fecha_nacimiento` es `null`

#### Scenario: Fecha futura
- **WHEN** se crea una cuenta con `fecha_nacimiento = '2030-01-01'`
- **THEN** la cuenta se crea y `fecha_nacimiento` es `null`

#### Scenario: Anterior al mínimo
- **WHEN** se crea una cuenta con `fecha_nacimiento = '1919-12-31'`
- **THEN** la cuenta se crea y `fecha_nacimiento` es `null`; con `'1920-01-01'` se guarda tal cual

#### Scenario: Tipo o formato incorrecto
- **WHEN** se crea una cuenta con `fecha_nacimiento` igual a `19900304` (número), `''`, `'04-03-1990'`, `'1990-3-4'` o `'1990-03-04T00:00:00Z'`
- **THEN** en cada caso la cuenta se crea y `fecha_nacimiento` es `null`

#### Scenario: El resto del perfil no cambia
- **WHEN** se crea una cuenta con nombre, teléfono, `es_staff` o `profesional_id` en sus metadatos
- **THEN** `nombre`, `telefono`, `email`, `rol` y `profesional_id` quedan con el mismo valor que producía 0010

### Requirement: Conservación del cumpleaños en actualizaciones de la cuenta
Cuando el trigger de actualización de 0010 vuelva a sincronizar un perfil
(cambio de correo o de `app_metadata`), la base SHALL conservar una
`fecha_nacimiento` ya guardada y SHALL rellenarla con la regla de validación
solo si es `null`. Un cambio que afecte únicamente a `user_metadata` MUST NOT
modificar `perfiles.fecha_nacimiento`.

#### Scenario: Cambio de correo con fecha guardada
- **WHEN** una cuenta con `fecha_nacimiento = 1990-03-04` cambia de correo
- **THEN** su `fecha_nacimiento` sigue en 1990-03-04

#### Scenario: Relleno al cambiar app_metadata
- **WHEN** una cuenta con `fecha_nacimiento = null` y `user_metadata.fecha_nacimiento = '1985-07-10'` recibe `es_staff = true`
- **THEN** su `fecha_nacimiento` pasa a 1985-07-10 y su `rol` a `admin`

#### Scenario: Solo user_metadata
- **WHEN** se cambia `user_metadata.fecha_nacimiento` de una cuenta a `'2000-01-01'` sin tocar correo ni `app_metadata`
- **THEN** `perfiles.fecha_nacimiento` conserva su valor anterior

### Requirement: Carga inicial de las cuentas existentes
La migración SHALL rellenar `fecha_nacimiento` de los perfiles existentes que la
tengan en `null`, desde `auth.users.raw_user_meta_data`, con la misma regla de
validación, sin crear ni borrar perfiles y sin modificar otras columnas.
Ejecutarla dos veces SHALL producir el mismo resultado que una.

#### Scenario: Cuenta registrada antes de 0016
- **WHEN** se aplica la migración sobre una cuenta con `user_metadata.fecha_nacimiento = '1992-11-20'`
- **THEN** su perfil queda con `fecha_nacimiento = 1992-11-20`

#### Scenario: Cuentas de 0008 sin metadato
- **WHEN** se aplica la migración
- **THEN** las cuentas sin `fecha_nacimiento` en sus metadatos quedan con `null` y el número de filas de `perfiles` no cambia

### Requirement: Rango válido ante escrituras directas
La base SHALL rechazar cualquier escritura en `perfiles.fecha_nacimiento` de un
valor anterior a 1920-01-01 o posterior a la fecha actual, venga de quien venga.
Desde 0017, una clienta con sesión MUST NOT poder modificar ninguna columna de
su propia fila de `perfiles`.

#### Scenario: El personal escribe una fecha futura
- **WHEN** una cuenta con `es_staff = true` hace `update perfiles set fecha_nacimiento = '2099-01-01'` sobre cualquier fila
- **THEN** la base rechaza la escritura por el check y la fila conserva su valor

#### Scenario: La clienta escribe una fecha futura en su perfil
- **WHEN** una clienta con sesión hace `update perfiles set fecha_nacimiento = '2099-01-01'` sobre su propia fila
- **THEN** la petición no devuelve error, afecta 0 filas por RLS y la fila conserva todas sus columnas

#### Scenario: La clienta intenta cambiar su rol
- **WHEN** una clienta con sesión hace `update perfiles set rol = 'admin'` sobre su propia fila
- **THEN** afecta 0 filas y el panel la sigue mostrando como «Clienta»

### Requirement: Lectura restringida del cumpleaños
`perfiles.fecha_nacimiento` SHALL ser legible solo por el personal
(`es_staff()`), sobre todas las filas, y por cada persona con sesión, sobre su
propia fila. Ningún otro rol SHALL poder leerla.

#### Scenario: Visitante sin sesión
- **WHEN** se consulta `perfiles?select=fecha_nacimiento` con la anon key
- **THEN** la petición se rechaza o devuelve cero filas

#### Scenario: Clienta consultando a otras
- **WHEN** una clienta con sesión consulta `perfiles?select=id,fecha_nacimiento`
- **THEN** recibe exactamente una fila, la suya

#### Scenario: Profesional sin es_staff
- **WHEN** una cuenta profesional sin `es_staff` consulta `perfiles?select=id,fecha_nacimiento`
- **THEN** recibe solo su propia fila

#### Scenario: Personal
- **WHEN** una cuenta con `es_staff = true` consulta `perfiles?select=id,fecha_nacimiento`
- **THEN** recibe todas las filas de `perfiles`

### Requirement: Cumpleaños en la lista de usuarios del panel
El panel de usuarios SHALL mostrar en cada fila el cumpleaños como día y nombre
de mes en español («4 de marzo»), sin año ni edad, o «—» si no hay fecha. La
fecha mostrada MUST ser la guardada, sin desplazarse por zona horaria. Editar un
perfil desde el panel MUST NOT modificar su cumpleaños.

#### Scenario: Fecha sin desplazamiento
- **WHEN** el panel se abre en un navegador con zona `America/Santiago` y una cuenta tiene `fecha_nacimiento = 1990-03-04`
- **THEN** su fila muestra «4 de marzo», no «3 de marzo»

#### Scenario: Sin fecha
- **WHEN** una cuenta tiene `fecha_nacimiento = null`
- **THEN** su fila muestra «—»

#### Scenario: Base sin la migración
- **WHEN** el panel lee `perfiles` en una base donde la columna no existe
- **THEN** la lista carga y todas las filas muestran «—», sin error

#### Scenario: Editar el nombre no toca la fecha
- **WHEN** el personal cambia el nombre de una cuenta con `fecha_nacimiento = 1990-03-04` y recarga
- **THEN** la cuenta sigue con 1990-03-04

### Requirement: Filtro de próximos cumpleaños
El panel de usuarios SHALL ofrecer un filtro «Próximos cumpleaños» que, activo,
muestre solo las cuentas cuyo próximo cumpleaños cae entre hoy y hoy + 30 días,
ambos incluidos, ordenadas por días restantes ascendentes. Toda fila cuyo
próximo cumpleaños cae en esa ventana SHALL mostrar la etiqueta «Hoy», «Mañana»
o «en N días», esté el filtro activo o no. El botón SHALL mostrarse como
«Próximos cumpleaños (n)», donde n cuenta las cuentas que el filtro mostraría
con el filtro de rol y la búsqueda vigentes. «Hoy» SHALL ser la fecha local del navegador. El
29 de febrero SHALL contar como 28 de febrero en años no bisiestos. El filtro
SHALL combinarse con el filtro de rol y la búsqueda (las tres condiciones a la
vez). Si ninguna cuenta cumple las condiciones, SHALL mostrar «Nadie cumple
años en los próximos 30 días.» Inactivo, la lista conserva el orden actual.

#### Scenario: Orden y etiquetas
- **WHEN** hoy es 2026-10-08 y hay cuentas con cumpleaños 10-08, 10-09, 10-20 y 11-07
- **THEN** con el filtro activo aparecen en ese orden con «Hoy», «Mañana», «en 12 días» y «en 30 días»

#### Scenario: Borde de la ventana
- **WHEN** hoy es 2026-10-08 y una cuenta cumple el 11-08
- **THEN** no aparece con el filtro activo (faltan 31 días)

#### Scenario: Cumpleaños ya pasado este año
- **WHEN** hoy es 2026-10-08 y una cuenta cumple el 10-07
- **THEN** no aparece con el filtro activo (faltan 364 días)

#### Scenario: Cambio de año
- **WHEN** hoy es 2026-12-20 y una cuenta cumple el 01-05
- **THEN** aparece con «en 16 días»

#### Scenario: 29 de febrero en año no bisiesto
- **WHEN** hoy es 2027-02-27 y una cuenta nació el 2000-02-29
- **THEN** aparece con «Mañana»; el 2027-02-28 aparece con «Hoy»; y su fila muestra «29 de febrero»

#### Scenario: 29 de febrero en año bisiesto
- **WHEN** hoy es 2028-02-28 y una cuenta nació el 2000-02-29
- **THEN** aparece con «Mañana»

#### Scenario: 29 de febrero recién pasado
- **WHEN** hoy es 2027-03-01 y una cuenta nació el 2000-02-29
- **THEN** no aparece con el filtro activo

#### Scenario: Noche en Chile, madrugada en UTC
- **WHEN** en el navegador son las 22:30 del 2026-10-08 en `America/Santiago` (2026-10-09 en UTC) y una cuenta cumple el 10-08
- **THEN** aparece con «Hoy»

#### Scenario: Cambio de horario de septiembre
- **WHEN** hoy es 2026-09-01 y una cuenta cumple el 09-15
- **THEN** aparece con «en 14 días»

#### Scenario: Cuentas sin fecha
- **WHEN** el filtro está activo
- **THEN** ninguna cuenta con `fecha_nacimiento = null` aparece

#### Scenario: Combinado con rol
- **WHEN** el filtro está activo junto al filtro de rol «Clienta»
- **THEN** solo aparecen clientas que cumplen en los próximos 30 días

#### Scenario: Vacío
- **WHEN** el filtro está activo y nadie cumple en los próximos 30 días
- **THEN** se muestra «Nadie cumple años en los próximos 30 días.»

#### Scenario: Etiqueta con el filtro apagado
- **WHEN** hoy es 2026-10-08, el filtro está inactivo y hay cuentas que cumplen el 10-09 y el 12-25
- **THEN** la fila del 10-09 muestra «Mañana» y la del 12-25 no muestra etiqueta de días

#### Scenario: Contador con rol y búsqueda
- **WHEN** hoy es 2026-10-08, hay una clienta «Ana» que cumple el 10-09 y una profesional «Bea» que cumple el 10-10, y el filtro de rol es «Clienta»
- **THEN** el botón dice «Próximos cumpleaños (1)»; al buscar «Bea» dice «Próximos cumpleaños (0)» y, activo, muestra «Nadie cumple años en los próximos 30 días.»
