# Design

## Context

- `servicios.categoria` es texto libre y nullable (0001). El frontend la
  normaliza en `servicio.mapper.ts` (`toCategoria`): ids del dominio, sinónimos
  (`manicure` → `unas`, `estilismo` → `cabello`, `estetica` → `piel`) y, si no
  reconoce el valor o viene null, **cae en `unas`**. El servicio real
  «manicure rapida» tiene categoría null y es de uñas por ese camino.
- `servicios.precio_base` es `numeric(10,2)`. Con variantes (0011) el precio
  real es el de la opción elegida, que puede ser mayor **o menor** que
  `precio_base`; `precioDesde()` en el dominio devuelve el mínimo de las
  opciones.
- `reservas` se inserta directo desde el navegador (anon y authenticated) y sin
  `.select()`: la invitada no puede leer de vuelta su fila (0003). El UPDATE
  desde el navegador está acotado por columnas a `estado, fecha, hora_inicio,
  hora_fin` (0005, 0006).
- `servicios` tiene lectura pública sin filtro de `activo` (0002) y escritura
  solo para el personal (0010).
- Nuria no crea reservas: rellena el borrador y lleva al paso de confirmación
  del flujo real (carrito-compra, decisión 9). El paso de abono la cubre sin
  trabajo extra.

## Contrato de datos

Una sola fuente de verdad por dato. Montos en **pesos chilenos enteros** (CLP no
usa decimales).

### SQL

```sql
-- servicios
abono integer not null default 0
  constraint servicios_abono_no_negativo check (abono >= 0)

-- reservas
abono integer not null default 0
  constraint reservas_abono_no_negativo check (abono >= 0)
-- Fijado por un trigger BEFORE INSERT:  new.abono := servicios.abono
-- del servicio_id insertado, ignorando lo que envíe el cliente.
-- No se agrega a ningún GRANT UPDATE por columnas: inmutable desde el navegador.
```

### TypeScript (`shared/types/supabase.ts`)

| Tabla | Row | Insert | Update |
|---|---|---|---|
| `servicios` | `abono: number` | `abono?: number` | `abono?: number` |
| `reservas` | `abono: number` | **no se declara** | **no se declara** |

`reservas.Insert` no declara `abono` a propósito: el trigger lo sobrescribe, y
tenerlo en el tipo invitaría a enviarlo creyendo que se respeta.

### Dominio (frontend)

| Entidad | Campo | Origen |
|---|---|---|
| `Servicio`, `DatosServicio` | `abono: number` | `servicios.abono` |
| `Reserva` (módulo reservas) | `abono: number` | `reservas.abono` |
| `ReservaGestion` (admin) | `abono: number` | `reservas.abono` |
| `Booking` local (invitada / sin lectura) | `abono: number` | el `abono` del servicio mostrado al pagar; una reserva local guardada antes de este cambio, sin el campo, se lee como 0 |

Regla única de presentación: **`abono > 0` ⇒ hay paso de pago y se muestra la
línea de abono; `abono = 0` ⇒ no hay paso ni línea.** Nadie decide por
categoría en tiempo de reserva.

No hay Pydantic: `services/api/` no existe.

## Decisions

1. **Lo que decide el paso de pago es `abono > 0`, no la categoría.**
   La categoría en SQL es texto libre y su normalización vive en el frontend;
   decidir por categoría en la base obligaría a duplicar `toCategoria` en SQL y
   las dos copias se separarían. La categoría solo interviene al **escribir**
   (regla del panel, decisión 3) y en el **relleno inicial** (decisión 4).

2. **Check SQL `abono >= 0`, sin `abono <= precio_base`.**
   Se descartó el tope contra `precio_base` propuesto inicialmente: con
   variantes, `precio_base` no es el precio cobrado (una opción puede costar
   menos), así que el check dejaría pasar abonos mayores que lo cobrado y a la
   vez podría rechazar configuraciones válidas. El tope correcto es
   `abono <= precioDesde(servicio)` y lo valida el dominio
   (`motivoParaNoGuardarServicio`), igual que 0011 dejó la forma de las opciones
   al dominio porque comprobarla en un check son varias líneas de SQL sobre
   jsonb.

3. **Servicio de uñas con abono 0: el panel no lo deja guardar.**
   Mensaje: «Los servicios de uñas requieren un abono mayor que $0.» La regla va
   en el dominio, no en la base: el panel siempre escribe el id canónico de la
   categoría (`fromDatosServicio`), así que la comprobación en el dominio es
   exacta para la única vía de escritura que existe.
   *Descartado:* aceptar 0 como «sin abono» también en uñas. Contradice la
   necesidad («todos los servicios de uñas requieren abono») y el incumplimiento
   no se vería en ninguna parte.
   *Descartado:* un check SQL por categoría. Por la decisión 1.
   *Consecuencia aceptada:* un servicio de uñas con precio «desde» 0 no se puede
   guardar (no existe abono > 0 y ≤ 0). Hoy no hay ninguno.
   Otras categorías pueden tener abono (> 0 u 0); el campo se muestra para todas
   porque es la misma columna y ocultarlo por categoría añade una condición sin
   pedirla. Solo uñas lo exige.

4. **Relleno inicial: 30 % del precio «desde», redondeado al millar, mínimo
   $1.000, nunca mayor que el precio «desde».**
   `abono = least(desde, greatest(1000, round(desde * 0.30 / 1000) * 1000))`,
   con `desde` = mínimo de `variantes.opciones[].precio` si el servicio tiene
   variantes, o `precio_base` si no (misma definición que `precioDesde`).
   Si `desde = 0` el abono queda en 0 y la consulta de comprobación lo señala.
   Se aplica a los servicios que el frontend clasifica como uñas: categoría
   normalizada (minúsculas, sin tildes, sin espacios en los extremos) que **no**
   sea `cabello`, `piel`, `diagnostico`, `estilismo` ni `estetica`. Eso incluye
   null, vacío, `unas`, `uñas`, `manicure` y valores desconocidos, que es
   exactamente lo que hace `toCategoria`. Si se clasificara distinto, el primer
   intento de editar un servicio en el panel fallaría por la decisión 3.
   Con el seed: Manicura Completa 18.000 → 5.000; Esmaltado Tradicional
   12.000 → 4.000; Esmaltado Permanente 22.000 → 7.000; Esculpido 38.000 →
   11.000; manicure rapida 15.000 → 5.000.
   *Descartado:* redondeo a la centena (montos como $5.400 son exactos pero no
   es como se anuncia un abono) y monto fijo (deja de ser proporcional en un
   esculpido de $38.000).

5. **La base fija `reservas.abono`, el navegador no.** Trigger `before insert`
   que copia `servicios.abono`. Sin `security definer`: `servicios` ya es
   legible por anon y authenticated sin filtro de `activo` (0002), así que el
   trigger lee con los permisos de quien inserta. Es una **copia**, mismo
   criterio que `detalles_extra`: cambiar el abono del servicio no reescribe
   reservas pasadas.

6. **El nombre es `reservas.abono`, no `abono_pagado`.** Con pago simulado la
   base no tiene forma de comprobar que hubo pago: la columna registra el abono
   **exigido** al crear la reserva. Llamarla «pagado» afirmaría algo que nadie
   verificó. El comentario de la columna lo dice.

7. **El paso «Abono» va después de «Confirmar» y es el que crea la reserva.**
   En «Confirmar» se revisa y se dan los datos de contacto, como hoy; con abono,
   su botón pasa a «Continuar al abono» y no crea nada. El paso «Abono» muestra
   el monto, el saldo (precio − abono, a pagar en el estudio), el aviso de
   demostración y el formulario; «Pagar abono y reservar» valida el formulario,
   simula la aprobación y crea la reserva con el mecanismo existente. Sin abono,
   el flujo queda exactamente como hoy.
   El estilo visual reutiliza el del paso de pago de `Checkout`.

8. **Formulario de tarjeta de demostración.** Campos: titular (no vacío), número
   (16 dígitos, se aceptan espacios), vencimiento MM/AA no anterior al mes en
   curso, CVV de 3 dígitos. Sin Luhn ni rechazos simulados: nadie los pidió.
   Los valores viven solo en el estado del componente: no van al borrador de la
   reserva, ni a `localStorage`/`sessionStorage`, ni a ninguna petición. Aviso
   visible: «Pago de demostración: no se realiza ningún cobro. No ingreses datos
   de una tarjeta real.»

9. **Si la reserva falla después de «aprobar»** (bloque tomado, red, RLS), se
   queda en el paso «Abono» con el error y el texto «No se realizó ningún
   cobro.», y se puede reintentar sin volver a escribir la tarjeta. Al ser
   simulado no hay nada que revertir.

10. **Cancelar y reprogramar no tocan el abono.** La fila conserva `abono`
    (la columna no es actualizable desde el navegador ni por el personal). No se
    modela devolución: no hay dinero real. Se muestra un texto de política en el
    paso «Abono» y en el detalle de la reserva (texto fijado por el dueño el 2026-10-08: no reembolsable con menos de 24 h; ver tasks.md).
    Reprogramar no vuelve a pedir abono.

## Risks / Trade-offs

- **El abono no es comprobante de pago.** Quien inserte en `reservas` con la
  anon key sin pasar por la interfaz crea una reserva con `abono` > 0 sin haber
  «pagado». Con pago simulado es indistinguible de pasar por el formulario.
  Cuando haya pasarela real, la reserva tendrá que crearse en el servidor tras
  la confirmación del pago; esa es otra propuesta.
- **Carrera de configuración.** Si el personal cambia el abono de un servicio
  mientras una clienta está en el flujo, la base registra el abono nuevo y la
  pantalla mostró el viejo; la invitada no puede leer su fila para enterarse. Se
  acepta: la ventana es un solo flujo de reserva y el cambio de abono es raro.
- **Saldo aproximado en el detalle.** El saldo se calcula con el precio que la
  pantalla ya resuelve (variante acordada, o `precio_base` vigente si no hay
  variante, ver `MyBookings`). `reservas` sigue sin columna de precio; para
  servicios sin variante el saldo puede no ser el del día de la reserva.
- Hasta aplicar la migración, la columna no existe y el mapper la lee
  `undefined`. Debe tratarse como 0 (sin abono), igual que 0010/0011 toleran sus
  columnas ausentes.
