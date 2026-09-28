# Equipo de agentes de NuraVision

Diez subagentes de Claude Code, uno por archivo en esta carpeta. Se invocan
desde la sesion principal con la herramienta Agent, por su `name`.

Modelo de coordinacion: **router plano**. La sesion principal es el orquestador
y delega directamente al especialista. No hay agentes llamando a agentes.

## `_SHARED.md`: el contrato comun

Todo agente lee [`_SHARED.md`](_SHARED.md) antes de su primera accion. Ahi viven,
en un solo sitio, las cosas que de otro modo habria que repetir diez veces y
que se desincronizarian a la primera:

- los hechos del repo (stack real, estado de cada capa, rama base);
- la deuda ya auditada, para que nadie la redescubra ni la ignore;
- el metodo de cuatro fases y la disciplina de evidencia;
- el protocolo de escalado y el presupuesto de incertidumbre;
- la **economia del codigo** (seccion 12): buscar antes de crear, la regla de
  tres, que se considera bulto y que no se recorta nunca;
- la **honestidad del reporte** (seccion 13): nada de calificar el propio
  trabajo ni de suavizar hallazgos;
- la **autorevision obligatoria** (seccion 14) antes de emitir el reporte;
- el envoltorio JSON comun y la tabla de duenos de ruta.

Las secciones 12 a 14 son las que evitan el modo de fallo mas caro de un equipo
de agentes: codigo que compila, pasa el lint, cumple la spec, y aun asi deja el
repositorio peor que antes.

Cuando cambie un hecho del proyecto, se edita ahi y no en los diez archivos.

## Diagrama de arquitectura

```
                            ┌─────────────────┐
                            │     USUARIO     │
                            └────────┬────────┘
                                     │  peticion
                            ┌────────▼─────────┐
                            │ SESION PRINCIPAL │  ← unica que hace git commit/push
                            │   (orquestador)  │    y solo con OK explicito
                            └────────┬─────────┘
                                     │  delega (contrato JSON de vuelta)
         ┌───────────────┬───────────┼───────────┬───────────────┐
         │               │           │           │               │
   ╔═════▼══════╗  ╔═════▼══════╗    │     ╔═════▼══════╗  ╔═════▼══════╗
   ║  PLANIFICA ║  ║  REVISA    ║    │     ║ IMPLEMENTA ║  ║  ENTREGA   ║
   ╚════════════╝  ╚════════════╝    │     ╚════════════╝  ╚════════════╝
   ┌────────────┐  ┌────────────┐    │     ┌────────────┐  ┌────────────┐
   │   nv-pm    │  │nv-tech-lead│    │     │nv-frontend │  │ nv-devops  │
   │  specs +   │  │   review   │    │     │ Vite/React │  │Vercel/CloudRun│
   │   tasks    │  │  routing   │    │     └─────┬──────┘  └─────┬──────┘
   └─────┬──────┘  └─────┬──────┘    │           │               │
         │               │           │     ┌─────▼──────┐        │
         │         ┌─────▼──────┐    │     │nv-supabase │        │
         │         │   nv-qa    │    │     │ SQL + RLS  │        │
         │         │  tests     │    │     └─────┬──────┘        │
         │         └─────┬──────┘    │           │               │
         │               │           │     ┌─────▼──────┐        │
         │         ┌─────▼──────┐    │     │ nv-fastapi │        │
         │         │nv-rls-     │    │     │ endpoints  │        │
         │         │  auditor   │    │     └─────┬──────┘        │
         │         └─────┬──────┘    │           │               │
         │               │           │     ┌─────▼──────┐        │
         │         ┌─────▼──────┐    │     │ nv-vision  │        │
         │         │nv-contracts│◄───┼─────┤ OpenCV+AI  │        │
         │         │  SQL↔TS↔PY │    │     └────────────┘        │
         │         └────────────┘    │                           │
         └───────────────┬───────────┴───────────────────────────┘
                         │  reportan; NO escriben en el repo compartido
              ┌──────────▼───────────────────────────────────┐
              │            SUPERFICIE DEL REPO               │
              ├──────────────┬──────────────┬────────────────┤
              │  frontend/   │  supabase/   │  services/api/ │
              │  Vite+React  │  migraciones │  FastAPI +     │
              │  Tailwind 4  │  + RLS       │  Pydantic AI   │
              └──────┬───────┴──────┬───────┴───────┬────────┘
                     │              │               │
                  Vercel        Supabase        Cloud Run
                (anon key)     (Postgres)    (service role,
                                              secretos reales)
```

### Quien escribe donde

Cada ruta tiene **un solo** dueno con permiso de escritura. Es lo que evita que
dos agentes se pisen.

| Ruta                                    | Escribe            | Leen |
|-----------------------------------------|--------------------|------|
| `openspec/changes/`, docs               | nv-pm              | todos |
| `frontend/src/`                         | nv-frontend        | todos |
| `frontend/src/shared/types/supabase.ts` | nv-contracts       | todos |
| `supabase/migrations/`                  | nv-supabase        | todos |
| `services/api/app/` (salvo `vision/`)   | nv-fastapi         | todos |
| `services/api/app/vision/`              | nv-vision          | todos |
| `.github/workflows/`, Docker, Vercel    | nv-devops          | todos |
| — (solo lectura)                        | nv-tech-lead, nv-qa, nv-rls-auditor | |

## Contratos entre agentes

Todo agente cierra con un bloque ```json. El envoltorio comun esta en
[`_SHARED.md`](_SHARED.md) seccion 8; cada agente añade sus campos:

```json
{
  "agent": "nv-*",
  "status": "done|needs_review|blocked",
  "confidence": "high|medium|low",
  "summary": "string",
  "evidence": [{"claim": "string", "source": "archivo:linea | comando"}],
  "assumptions": ["string"],
  "risks": ["string"],
  "handoff": [{"to": "nv-*", "why": "string", "blocking": true}],
  "out_of_scope": ["string"],
  "blocked_reason": "string|null"
}
```

Reglas que aplica el orquestador al leer una respuesta:

- `status: "blocked"` o un `handoff` con `blocking: true` → **para la cadena**.
  Encadenar sobre un resultado bloqueado propaga el error.
- `status: "done"` con `confidence: "low"` es contradictorio → es `needs_review`.
- `status: "done"` con verificacion en `fail` es contradictorio → es `blocked`.
- `evidence` vacio en un reporte que afirma haber verificado → se rechaza y se
  vuelve a pedir. No se interpreta la prosa.
- JSON ausente o malformado → se repite la peticion al mismo agente.

### Escalado

Los agentes no eligen entre "lo hago" y "me rindo". Tienen cuatro niveles:

| Nivel | Cuando | Salida |
|---|---|---|
| 0 · resuelvo | Tiene la informacion | `done` |
| 1 · supuesto | Falta un dato, hay opcion razonable | `done` + `assumptions` |
| 2 · revision | Lo hizo pero duda | `needs_review` + `confidence: low` |
| 3 · bloqueado | Avanzar seria inseguro o inutil | `blocked` + razon concreta |

Con un presupuesto: tras **tres** intentos serios sin exito, el agente para y
devuelve lo aprendido en vez de gastar contexto en un cuarto.

## Flujos tipicos

**Feature de UI que necesita una columna nueva**

```
nv-pm (spec+tasks) → nv-supabase (migracion) → nv-rls-auditor (veredicto)
   → nv-contracts (tipos TS) → nv-frontend (UI) → nv-qa (pruebas)
   → nv-tech-lead (review) → usuario aprueba → commit
```

**Diagnostico por imagen**

```
nv-pm → nv-vision (pipeline) → nv-fastapi (endpoint + schemas)
   → nv-contracts (TS del cliente) → nv-frontend (subida y resultado)
   → nv-qa → nv-devops (plan de deploy) → usuario aprueba
```

**Bug reportado**

```
nv-tech-lead (diagnostica y rutea) → agente dueno (arregla) → nv-qa (confirma)
```

## Reglas globales

Heredadas de `CLAUDE.md`, repetidas en cada archivo de agente porque un subagente
no ve el contexto de la sesion principal:

1. **Ningun agente hace `git commit`, `git push` ni `git merge`.** Solo la sesion
   principal, y solo con tu OK explicito.
2. Commits a tu nombre. Sin `Co-Authored-By` ni mencion a herramientas de IA.
3. Verificacion del front, siempre con el flag: `npx tsc --noEmit -p tsconfig.app.json`,
   `npm run build`, `npm run lint`. Sin `-p tsconfig.app.json` tsc no compila
   nada y devuelve 0 aunque el codigo este roto.
4. Los auditores (nv-tech-lead, nv-qa, nv-rls-auditor) son de solo lectura.

## Uso

```
> usa nv-supabase para agregar la tabla de clientes con su RLS
> pide a nv-rls-auditor que revise las politicas de reservas
> nv-contracts: verifica si los tipos siguen cuadrando con el esquema
```

O deja que el orquestador elija: describe la tarea y delegara segun la tabla de
propiedad de arriba.
