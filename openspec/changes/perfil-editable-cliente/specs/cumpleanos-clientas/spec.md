# cumpleanos-clientas

## MODIFIED Requirements

### Requirement: Rango válido ante escrituras directas
La base SHALL rechazar cualquier escritura en `perfiles.fecha_nacimiento` de un
valor anterior a 1920-01-01 o posterior a la fecha actual, venga de quien venga.
Desde 0017, una clienta con sesión MUST NOT poder modificar ninguna columna de
su propia fila de `perfiles` por UPDATE directo; la única vía por la que corrige
su cumpleaños (y su nombre y teléfono) es la función `actualizar_mi_perfil`
de la capacidad `perfil-cliente`.

#### Scenario: El personal escribe una fecha futura
- **WHEN** una cuenta con `es_staff = true` hace `update perfiles set fecha_nacimiento = '2099-01-01'` sobre cualquier fila
- **THEN** la base rechaza la escritura por el check y la fila conserva su valor

#### Scenario: La clienta escribe una fecha futura en su perfil
- **WHEN** una clienta con sesión hace `update perfiles set fecha_nacimiento = '2099-01-01'` sobre su propia fila
- **THEN** la petición no devuelve error, afecta 0 filas por RLS y la fila conserva todas sus columnas

#### Scenario: La clienta intenta cambiar su rol
- **WHEN** una clienta con sesión hace `update perfiles set rol = 'admin'` sobre su propia fila
- **THEN** afecta 0 filas y el panel la sigue mostrando como «Clienta»

#### Scenario: La clienta corrige su cumpleaños por la función
- **WHEN** una clienta con sesión llama a `actualizar_mi_perfil` con `p_fecha_nacimiento = '1991-05-06'`
- **THEN** su `fecha_nacimiento` pasa a 1991-05-06 y el panel muestra el nuevo día y mes
