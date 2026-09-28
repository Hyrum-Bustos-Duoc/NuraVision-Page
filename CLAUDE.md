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

# Reporte al finalizar una tarea

Al terminar cualquier tarea, entrega un resumen breve y claro con esta estructura:

**Qué hice:** [resumen de la acción realizada]
**Qué cambió:** [archivos/funciones/módulos afectados]
**Errores o cosas a tener en cuenta:** [warnings, deuda técnica, decisiones que tomé sin confirmar contigo, riesgos]
**Siguiente paso:** [qué sigue o qué necesitas revisar/decidir]

Mantén el reporte corto y directo — evita explicaciones largas o detalles innecesarios que puedan generar confusión.
