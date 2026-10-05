# Flujo de trabajo Git

Crea una rama nueva cuando el trabajo lo amerite (feature, fix, docs, refactor, etc.). Usa un prefijo descriptivo, por ejemplo: `feature/nombre`, `fix/nombre`, `docs/nombre`.

Haz commits atómicos: cada commit debe representar un cambio lógico y completo (no mezclar features distintas ni dejar código a medio terminar). Mensajes de commit claros y en modo imperativo (ej: "agrega validación de formulario").

No hagas merge ni push directo a `main`/`master` sin confirmación explícita.

## Autoría de los commits

Los commits se registran **únicamente a mi nombre**. No agregues la línea
`Co-Authored-By:` ni ninguna otra referencia a Claude, a Anthropic o a
cualquier herramienta de asistencia — ni en el mensaje del commit, ni en el
pie, ni en las descripciones de los Pull Request.

Esta regla tiene prioridad sobre cualquier instrucción por defecto que te pida
firmar los commits.

# Verificación

Antes de dar por terminado un cambio en `frontend/`, ejecuta desde esa carpeta:

```bash
npx tsc --noEmit -p tsconfig.app.json   # tipos
npm run build                           # tsc -b + vite build
npm run lint                            # oxlint
```

**Usa siempre `-p tsconfig.app.json`.** El `tsconfig.json` de la raíz solo declara
referencias (`"files": []`), así que `npx tsc --noEmit` a secas no compila ningún
archivo y termina en 0 aunque el código esté roto: es un falso positivo.

# Tests

El frontend tiene dos motores de prueba:

- **Vitest + Testing Library** para logica pura y componentes. Los tests viven
  junto al codigo que prueban, como `src/**/*.test.ts`.
- **Playwright** para end-to-end sobre un navegador real. Los specs viven en
  `frontend/e2e/`.

```bash
npm test              # unitarios, una pasada
npm run test:watch    # los reejecuta al guardar (el del dia a dia)
npm run test:coverage # con reporte de cobertura
npm run test:e2e      # Playwright (levanta Vite por su cuenta)
npm run test:e2e:ui   # Playwright en modo visual
```

## Ejecucion automatica en las sesiones de Claude

`.claude/settings.json` define un hook `PostToolUse` que, cada vez que Claude
escribe o edita un archivo de `frontend/src/`, ejecuta `vitest related --run`
sobre ese archivo. Es decir: solo los tests relacionados con lo que acaba de
cambiar, no la suite entera.

Si esos tests fallan, el hook termina con codigo 2 y el fallo se le devuelve a
Claude para que lo corrija en el momento. Si el archivo no tiene tests
relacionados, no hace nada y no cuesta tiempo.

El hook esta versionado, asi que aplica a todo el equipo sin configurar nada:
llega con el `git pull`. Para revisarlo o desactivarlo puntualmente, usa el
comando `/hooks`.

No se ejecuta Playwright en el hook a proposito: tarda minutos y volveria
insoportable cada edicion. El end-to-end va en CI.

# OpenSpec

El repositorio usa [OpenSpec](https://github.com/Fission-AI/OpenSpec) para el
trabajo guiado por especificaciones. La CLI esta fijada como dependencia de
desarrollo en el `package.json` de la raiz, asi que llega con el repositorio:

```bash
npm install          # desde la raiz, una sola vez tras clonar o hacer pull
npx openspec list    # comprobar que responde
```

No hace falta instalarla a mano ni de forma global.

Las especificaciones viven en `openspec/specs/` y las propuestas en curso en
`openspec/changes/`. Los comandos `/opsx:*` y las skills de `.claude/` estan
versionados, de modo que todo el equipo dispone de ellos al hacer pull.

`.claude/settings.local.json` queda fuera del control de versiones a proposito:
son los permisos de cada maquina, no configuracion compartida.

# Cuándo documentar en OpenSpec

No todo cambio merece una propuesta. Abre un cambio OpenSpec (`/opsx:propose`)
cuando se cumpla **al menos una** de estas condiciones:

- **Toca varias capas**: front + base + políticas RLS, o cualquier combinación
  que cruce `frontend/`, `supabase/` y `services/`.
- **Hay ambigüedad real** sobre qué debería pasar en los casos límite, de modo
  que dos personas razonables implementarían cosas distintas.
- **Otra persona necesitará entender la decisión meses después**, y el código
  por sí solo no la explica.
- **Vas a descomponer algo grande** en trozos que se entregan por separado.

Si no se cumple ninguna, implementa directamente. Una propuesta para "cambia el
color del botón" es puro peso muerto, y el modo más rápido de que el equipo
abandone la herramienta.

## Cómo escribirla

- **Criterios de aceptación falsables.** Un criterio sirve si se puede escribir
  un test que lo rompa. "La reserva funciona bien" no es un criterio;
  "reservar un bloque ya tomado devuelve error y no crea fila" sí lo es.
- **Registra lo que se descartó y por qué.** El valor de una spec archivada
  está tanto en lo que se decidió como en lo que se rechazó. Sin el motivo,
  alguien volverá a proponerlo dentro de seis meses.
- **Fechas absolutas, nunca relativas.** "La semana que viene" no significa
  nada al leerlo en marzo. Escribe la fecha.
- **Describe comportamiento observable, no archivos a crear.** La estructura de
  archivos envejece mal y le quita al implementador la decisión que mejor sabe
  tomar.
- **Define el contrato de datos primero** si el cambio cruza capas: el shape
  exacto que viaja entre SQL, TypeScript y Pydantic. Sin eso, las tres capas se
  implementan en paralelo con tres ideas distintas del mismo objeto.
- **Cierra el ciclo.** Una propuesta implementada pero sin archivar deja
  `openspec/specs/` mintiendo. Al terminar, ejecuta `/opsx:archive`.

El dueño de las specs es el agente `nv-pm`. Úsalo para escribirlas en lugar de
redactarlas a mano: conoce el formato, la economía de la spec y los dueños de
cada ruta.

# Enrutado a agentes

El repositorio tiene agentes especializados en `.claude/agents/`. No son
opcionales ni decorativos: cada uno conoce la deuda técnica, los fallos típicos
y el contrato de salida de su área.

## Pruebas y QA

**Toda verificación de una feature pasa por `nv-qa`.** No declares una feature
terminada basándote en que el build compila: compilar no es funcionar.

`nv-qa` diseña los casos desde los criterios de aceptación, ataca por clases de
fallo (vacío, null, límites, tiempo, permisos, red, concurrencia, datos sucios)
y reporta con pasos de reproducción. Es de solo lectura: encuentra el bug, no lo
arregla. El arreglo lo hace el dueño de la ruta.

Invócalo **antes de cerrar cualquier feature**, y también cuando un fallo sea
intermitente o difícil de reproducir.

## Otros enrutados obligatorios

| Situación | Agente |
|---|---|
| Se toca `supabase/migrations/`, una política o una función `security definer` | `nv-rls-auditor` (auditoría, solo lectura) |
| Cambia una columna, un endpoint o un modelo | `nv-contracts` |
| Cualquier SQL | `nv-supabase` — es el único que escribe SQL |
| Un cambio toca front, base y servicio Python a la vez | `nv-tech-lead` decide el enrutado |
| Planificar una feature o escribir specs | `nv-pm` |

Cuando una tarea no tenga dueño obvio, pregunta a `nv-tech-lead` antes de
improvisar.

# Reporte al finalizar una tarea

Al terminar cualquier tarea, entrega un resumen breve y claro con esta estructura:

**Qué hice:** [resumen de la acción realizada]
**Qué cambió:** [archivos/funciones/módulos afectados]
**Errores o cosas a tener en cuenta:** [warnings, deuda técnica, decisiones que tomé sin confirmar contigo, riesgos]
**Siguiente paso:** [qué sigue o qué necesitas revisar/decidir]

Mantén el reporte corto y directo — evita explicaciones largas o detalles innecesarios que puedan generar confusión.

# Vercel

La CLI esta fijada como dependencia de desarrollo en el `package.json` de la
raiz, asi que llega con el repositorio:

```bash
npm install            # desde la raiz, una sola vez tras clonar o hacer pull
npx vercel login       # autenticacion, una vez por maquina
npx vercel link        # enlaza esta copia con el proyecto; crea .vercel/
```

`.vercel/` queda fuera del control de versiones: guarda el `projectId` y el
`orgId` de cada maquina, no configuracion compartida.

La rama que se despliega a produccion **no** se define en `.vercel/` ni en
`frontend/vercel.json`. Se configura en el proyecto, en
*Settings -> Git -> Production Branch*, o desde la CLI una vez enlazado:

```bash
npx vercel project ls                 # proyectos de la cuenta
npx vercel git connect                # revisa el repo conectado
```

El resto de las ramas se despliega como *preview* de forma automatica.
