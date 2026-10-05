# Spec Delta

## Purpose
Elementos globales del sitio público: barra de anuncios, navbar, footer con newsletter, tipografía y paleta.

## ADDED Requirements

### Requirement: Barra de anuncios
Las pantallas con navbar SHALL mostrar sobre él una franja oscura con los mensajes en desplazamiento continuo. Con `prefers-reduced-motion` SHALL quedar estática.

#### Scenario: Movimiento reducido
- **WHEN** el sistema pide reducir el movimiento
- **THEN** la franja no se desplaza

### Requirement: Navbar y footer globales
Toda pantalla pública con navbar SHALL mostrar el footer oscuro. Login, registro y paneles internos SHALL seguir sin navbar ni footer. El navbar SHALL incluir Tienda, el botón de Nuva y el carrito con contador, y en móvil SHALL mantener visibles el carrito y Nuva.

#### Scenario: Sesión iniciada
- **WHEN** hay sesión de clienta
- **THEN** el menú muestra Inicio, Servicios, Tienda, Profesionales, Reservar y Mis reservas, y cerrar sesión sigue cerrando la sesión de Supabase

### Requirement: Newsletter
El footer SHALL permitir suscribirse con un correo válido. La suscripción SHALL ser idempotente y no SHALL revelar si el correo ya estaba registrado.

#### Scenario: Correo repetido
- **WHEN** se suscribe dos veces el mismo correo
- **THEN** ambas veces se confirma «Listo, te suscribiste a Rituales Nura.»
