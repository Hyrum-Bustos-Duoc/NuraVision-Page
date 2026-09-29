# Guia de implementacion

Como poner a trabajar el equipo de agentes y como levantar el microservicio
Python que hoy no existe. Cinco pasos, en orden.

---

## Paso 1 · Comprobar que los agentes cargan

Los diez archivos ya estan en `.claude/agents/`. Claude Code los descubre solo.

```
> /agents
```

Deberias ver `nv-pm`, `nv-tech-lead`, `nv-qa`, `nv-frontend`, `nv-supabase`,
`nv-fastapi`, `nv-vision`, `nv-rls-auditor`, `nv-devops`, `nv-contracts`.

Prueba en frio, sin tocar nada — el auditor es de solo lectura, asi que es el
arranque mas seguro:

```
> nv-rls-auditor: audita las politicas actuales en supabase/migrations/
```

Si vuelve con su bloque JSON y un veredicto, el equipo funciona.

**Antes de seguir**, encarga esta auditoria de verdad. Las migraciones 0001–0006
ya estan aplicadas y nadie las ha revisado con esta lente.

---

## Paso 2 · Primera tarea real, de punta a punta

Elige algo pequeno que cruce dos capas. Recomendado: la sincronizacion de tipos,
porque es donde este repo tiene deuda silenciosa.

```
> nv-contracts: compara supabase/migrations/ con
  frontend/src/shared/types/supabase.ts y reporta divergencias
```

Caso concreto a vigilar: `servicios.categoria` es `text` nullable en
[0001_esquema_inicial.sql](../../supabase/migrations/0001_esquema_inicial.sql).
Si el tipo de TypeScript dice `string` sin `| null`, cualquier acceso directo a
esa propiedad revienta con la primera fila sin categoria.

Con los hallazgos en la mano, el ciclo es:

```
nv-contracts (drift) → nv-supabase o nv-frontend (arreglo) → nv-qa (confirma)
→ tu apruebas → commit
```

---

## Paso 3 · Andamiaje de `services/api/`

El microservicio no existe todavia. Pideselo a nv-fastapi:

```
> nv-fastapi: crea el andamiaje de services/api segun tu system prompt,
  con un endpoint /health y la configuracion por entorno
```

Estructura acordada:

```
services/api/
  pyproject.toml           # Python 3.12; fastapi, pydantic, pydantic-ai,
                           # pydantic-settings, opencv-python, pytest, ruff
  Dockerfile
  .env.example             # NOMBRES de variables, nunca valores
  app/
    main.py                # FastAPI(), CORS del dominio del front, routers
    config.py              # pydantic-settings: Settings(BaseSettings)
    schemas/               # modelos Pydantic v2 = contrato publico
    routers/               # un archivo por recurso
    services/              # logica de negocio, sin FastAPI dentro
    agents/                # agentes Pydantic AI, output_type SIEMPRE tipado
    vision/                # territorio de nv-vision
  tests/
    fixtures/              # imagenes fijas para pruebas reproducibles
```

Forma canonica de un agente Pydantic AI en este proyecto:

```python
from pydantic import BaseModel, Field
from pydantic_ai import Agent

class Hallazgo(BaseModel):
    feature: str
    observation: str
    confidence: float = Field(ge=0.0, le=1.0)

class ResultadoAnalisis(BaseModel):
    status: str                      # ok | inconclusive | rejected
    findings: list[Hallazgo]
    disclaimer: str

analista = Agent(
    "claude-sonnet-5",
    output_type=ResultadoAnalisis,   # sin esto, entra texto libre a tu base
    system_prompt="...",
)
```

El `output_type` no es un detalle de estilo: es la frontera entre una salida de
modelo y un dato que tu aplicacion guarda.

**Frontera de confianza.** Este servicio habla con Postgres por el service role.
Eso lo convierte en el unico sitio donde vive ese secreto, y en el sitio donde
hay que revalidar todo lo que llega del navegador, aunque el front ya lo haya
validado.

---

## Paso 4 · Pipeline de vision

```
> nv-vision: implementa el pipeline de analisis de manos en
  services/api/app/vision/, por etapas y con fixtures
```

Etapas, cada una funcion pura y testeable por separado:

```
validar → normalizar → detectar region → extraer caracteristicas
        → agente Pydantic AI → resultado + confianza
```

Dos limites que no se mueven:

- **No es un dispositivo medico.** El resultado es una observacion estetica con
  su grado de confianza, no un diagnostico clinico.
- **Las fotos de manos son datos biometricos.** No van a logs, no salen a
  terceros no acordados, y su retencion la define nv-pm por escrito.

Cuando el pipeline devuelva resultados estables, nv-fastapi lo expone como
endpoint y nv-contracts propaga el schema al cliente TypeScript.

---

## Paso 5 · Conectar el front y desplegar

```
> nv-frontend: agrega la pantalla de diagnostico que consume POST /v1/diagnostico
> nv-devops: prepara el CI y el plan de despliegue del servicio a Cloud Run
```

La linea de secretos, que es donde mas barato es equivocarse:

| Variable                    | Donde vive         | Publica? |
|-----------------------------|--------------------|----------|
| `VITE_SUPABASE_URL`         | bundle de Vercel   | si       |
| `VITE_SUPABASE_ANON_KEY`    | bundle de Vercel   | si       |
| `VITE_API_URL`              | bundle de Vercel   | si       |
| `SUPABASE_SERVICE_ROLE_KEY` | solo Cloud Run     | **no**   |
| `ANTHROPIC_API_KEY`         | solo Cloud Run     | **no**   |

Todo lo que lleve prefijo `VITE_` viaja dentro del JavaScript que descarga el
navegador. Si un secreto parece necesitar ese prefijo para funcionar, la llamada
esta en el sitio equivocado y debe mudarse al servicio Python.

nv-devops nunca despliega por su cuenta: entrega el plan con su rollback y
espera tu OK.

---

## Checklist de cierre de cualquier tarea

1. El agente dueno devolvio `status: "done"` con su JSON completo.
2. Verificacion del front en verde, con el flag correcto:
   `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npm run build && npm run lint`.
3. Si se toco SQL: `nv-rls-auditor` con `verdict: "safe"`.
4. Si cambio un contrato: `nv-contracts` con `status: "in_sync"`.
5. `nv-qa` con `verdict: "pass"` y la salida de comandos pegada.
6. `nv-tech-lead` con `verdict: "approved"`.
7. Tu apruebas el commit. Rama con prefijo, commit atomico, mensaje en
   imperativo, a tu nombre.
