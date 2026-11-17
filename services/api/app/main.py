import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .vision.router import router as vision_router
from .vision.unas import AnalizadorUnas, ModeloNoDisponible

RAIZ = Path(__file__).resolve().parent.parent
RUTA_MODELO = Path(os.environ.get("VISION_MODELO", RAIZ / "models" / "hand_landmarker.task"))
RUTA_SEGMENTADOR = Path(os.environ.get("VISION_SEGMENTADOR", RAIZ / "models" / "segmentador_unas.xml"))
# Origenes del frontend en desarrollo. En produccion se fija con VISION_ORIGENES.
ORIGENES = os.environ.get(
    "VISION_ORIGENES", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    # El modelo se carga una sola vez, al arrancar, no en cada peticion.
    app.state.analizador = None
    app.state.motivo_sin_modelo = ""
    try:
        app.state.analizador = AnalizadorUnas(RUTA_MODELO, RUTA_SEGMENTADOR)
    except ModeloNoDisponible as exc:
        # La API arranca igual: /salud lo informa y /vision/analizar responde 503.
        app.state.motivo_sin_modelo = str(exc)
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
    }
