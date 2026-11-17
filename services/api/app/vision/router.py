from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from .esquemas import ErrorApi, ResultadoAnalisis
from .unas import AnalizadorUnas, ImagenInvalida

router = APIRouter(prefix="/vision", tags=["vision"])

# Mismo tope que muestra el frontend ("max. 10 MB").
MAX_BYTES = 10 * 1024 * 1024


def _error(status: int, codigo: str, detalle: str) -> HTTPException:
    return HTTPException(status_code=status, detail=ErrorApi(codigo=codigo, detalle=detalle).model_dump())


@router.post(
    "/analizar",
    response_model=ResultadoAnalisis,
    responses={400: {"model": ErrorApi}, 413: {"model": ErrorApi}, 503: {"model": ErrorApi}},
)
def analizar(request: Request, foto: UploadFile = File(...)) -> ResultadoAnalisis:
    """Detecta las manos de la foto y devuelve un recorte por cada una.

    La foto se procesa en memoria: no se guarda en disco ni se registra.
    """
    analizador: AnalizadorUnas | None = request.app.state.analizador
    if analizador is None:
        raise _error(503, "modelo_no_disponible", request.app.state.motivo_sin_modelo)

    # Se lee un byte de mas para distinguir "justo 10 MB" de "demasiado grande"
    # sin cargar en memoria un archivo arbitrariamente grande.
    contenido = foto.file.read(MAX_BYTES + 1)
    if len(contenido) > MAX_BYTES:
        raise _error(413, "imagen_muy_grande", "La imagen supera los 10 MB.")
    try:
        return analizador.analizar(contenido)
    except ImagenInvalida as exc:
        raise _error(400, "imagen_invalida", str(exc)) from exc
