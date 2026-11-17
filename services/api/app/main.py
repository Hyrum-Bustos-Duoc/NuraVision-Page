import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .vision import clinico
from .vision.router import router as vision_router
from .vision.unas import AnalizadorUnas, ModeloNoDisponible

RAIZ = Path(__file__).resolve().parent.parent
RUTA_MODELO = Path(os.environ.get("VISION_MODELO", RAIZ / "models" / "hand_landmarker.task"))
RUTA_SEGMENTADOR = Path(os.environ.get("VISION_SEGMENTADOR", RAIZ / "models" / "segmentador_unas.xml"))
# Carpeta `exportado/` del entrenamiento de estado_clinico, copiada a mano (tarea U.5).
RUTA_CLINICO = Path(os.environ.get("VISION_CLINICO", RAIZ / "models" / "estado_clinico"))
# Se versiona con el codigo: son textos, no datos de nadie.
RUTA_TEXTOS_CLINICOS = Path(__file__).resolve().parent / "vision" / "textos_clinicos.toml"
# Origenes del frontend en desarrollo. En produccion se fija con VISION_ORIGENES.
ORIGENES = os.environ.get(
    "VISION_ORIGENES", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
# Lo que ve el cliente en el 503. El motivo real (con la ruta del servidor) va solo al log.
MOTIVO_SIN_MODELO = "El modelo de deteccion de manos no esta instalado en el servidor."

log = logging.getLogger(__name__)


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    # El modelo se carga una sola vez, al arrancar, no en cada peticion.
    app.state.analizador = None
    app.state.motivo_sin_modelo = ""
    clasificador = clinico.cargar_opcional(RUTA_CLINICO, RUTA_TEXTOS_CLINICOS)
    try:
        app.state.analizador = AnalizadorUnas(RUTA_MODELO, RUTA_SEGMENTADOR, clasificador)
    except ModeloNoDisponible as exc:
        # La API arranca igual: /salud lo informa y /vision/analizar responde 503.
        log.error("Sin detector de manos: %s", exc)
        app.state.motivo_sin_modelo = MOTIVO_SIN_MODELO
    # Misma condicion que clinico.parece_una(): sin embedding o sin referencia la
    # puerta dice siempre que no y toda foto sin mano sale sin_mano. Es silencioso
    # (QA 2026-11-17: la referencia esta git-ignorada, falta en todo clon nuevo),
    # por eso va a /salud y a WARNING, que el nivel por defecto de uvicorn si muestra.
    con_puerta = clasificador is not None and clasificador.embeber is not None and clasificador.referencia is not None
    if clasificador is not None and not con_puerta:
        log.warning(
            "Analisis de primer plano desactivado: el modelo no expone embedding o falta o no es valida %s."
            " Las fotos sin mano saldran sin_mano",
            RUTA_CLINICO / clinico.ARCHIVO_REFERENCIA,
        )
    app.state.primer_plano_activo = app.state.analizador is not None and con_puerta
    yield


app = FastAPI(title="NuraVision API", version="0.1.0", lifespan=ciclo_de_vida)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ORIGENES if o.strip()],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)
app.include_router(vision_router)


@app.exception_handler(StarletteHTTPException)
async def error_http(_: Request, exc: StarletteHTTPException):
    # Los errores propios ya traen {codigo, detalle}; el resto (404, 405...) se adapta.
    detalle = exc.detail if isinstance(exc.detail, dict) else {"codigo": "error", "detalle": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=detalle)


@app.exception_handler(RequestValidationError)
async def error_validacion(_: Request, __: RequestValidationError):
    # Falta el campo "foto" o no es un archivo.
    return JSONResponse(
        status_code=400,
        content={"codigo": "imagen_invalida", "detalle": "Falta el archivo en el campo 'foto'."},
    )


@app.get("/salud")
def salud(request: Request) -> dict:
    analizador = request.app.state.analizador
    return {
        "ok": True,
        "modelo_cargado": analizador is not None,
        "segmentador_cargado": analizador is not None and analizador.mide_forma,
        "clasificador_clinico_cargado": analizador is not None and analizador.clasifica,
        "primer_plano_activo": request.app.state.primer_plano_activo,
    }
