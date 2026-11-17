import {
  ErrorAnalisis,
  type CodigoErrorAnalisis,
  type ResultadoAnalisis,
} from '../domain/analisis.types'
import { esObjeto } from '../domain/clinico'

/**
 * Direccion del servicio de vision (services/api). En local es uvicorn en el
 * puerto 8000; se cambia con VITE_VISION_API_URL en frontend/.env.local.
 */
const BASE = String(import.meta.env.VITE_VISION_API_URL ?? 'http://localhost:8000').replace(
  /\/+$/,
  '',
)

/** Mismo tope que aplica el servicio: se avisa antes de subir 10 MB para nada. */
export const MAX_BYTES_FOTO = 10 * 1024 * 1024

const MENSAJES: Record<CodigoErrorAnalisis, string> = {
  imagen_invalida:
    'No pudimos leer esta imagen. Intenta con una foto en formato JPG o PNG, con buena luz.',
  imagen_muy_grande: 'La imagen supera los 10 MB. Prueba con una foto más liviana.',
  modelo_no_disponible:
    'El servicio de análisis no está listo en este momento. Intenta nuevamente en unos minutos.',
  servicio_no_disponible:
    'El servicio de análisis no está disponible en este momento. Intenta nuevamente en unos minutos.',
  cancelado: 'Se canceló el análisis.',
}

const CODIGOS_DEL_API: readonly string[] = [
  'imagen_invalida',
  'imagen_muy_grande',
  'modelo_no_disponible',
]

function errorDe(codigo: CodigoErrorAnalisis): ErrorAnalisis {
  return new ErrorAnalisis(codigo, MENSAJES[codigo])
}

/** Saca el codigo de {codigo, detalle}; si el cuerpo no es eso, se trata como servicio caido. */
async function codigoDeRespuesta(respuesta: Response): Promise<CodigoErrorAnalisis> {
  try {
    const cuerpo: unknown = await respuesta.json()
    if (cuerpo !== null && typeof cuerpo === 'object' && 'codigo' in cuerpo) {
      const codigo = (cuerpo as { codigo: unknown }).codigo
      if (typeof codigo === 'string' && CODIGOS_DEL_API.includes(codigo)) {
        return codigo as CodigoErrorAnalisis
      }
    }
  } catch {
    // Un 502 del proxy o una pagina HTML no es JSON.
  }
  return 'servicio_no_disponible'
}

/**
 * Envia la foto al servicio y devuelve las unas detectadas.
 *
 * Un resultado "no_concluyente" (por ejemplo, sin mano en la foto) NO es un
 * error: llega como respuesta normal y quien llama decide que decirle a la clienta.
 */
export async function analizarFoto(foto: File, senal?: AbortSignal): Promise<ResultadoAnalisis> {
  if (foto.size > MAX_BYTES_FOTO) throw errorDe('imagen_muy_grande')

  const cuerpo = new FormData()
  cuerpo.append('foto', foto)

  let respuesta: Response
  try {
    respuesta = await fetch(`${BASE}/vision/analizar`, { method: 'POST', body: cuerpo, signal: senal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw errorDe('cancelado')
    // Sin conexion, servicio apagado o CORS: para la clienta es lo mismo.
    throw errorDe('servicio_no_disponible')
  }

  if (!respuesta.ok) throw errorDe(await codigoDeRespuesta(respuesta))
  let datos: unknown
  try {
    datos = await respuesta.json()
  } catch (error) {
    // El cuerpo tambien se aborta: cambiar de foto mientras llega el JSON.
    if (error instanceof DOMException && error.name === 'AbortError') throw errorDe('cancelado')
    throw errorDe('servicio_no_disponible')
  }
  // Mismo trato que un cuerpo ilegible: el servicio no cumple su contrato.
  if (!unasConCalidad(datos)) throw errorDe('servicio_no_disponible')
  return datos as ResultadoAnalisis
}

/**
 * `calidad` es obligatoria en cada una desde que el servicio la mide siempre
 * (esquemas.py, CalidadUna). Una una sin ella, o con valores fuera de rango, es un
 * servicio que no habla este contrato. El resto del cuerpo no se valida aqui: el
 * bloque clinico lo valida clinicoDe.
 */
function unasConCalidad(datos: unknown): boolean {
  return esObjeto(datos) && Array.isArray(datos.unas) && datos.unas.every((u) => esObjeto(u) && calidadValida(u.calidad))
}

function calidadValida(c: unknown): boolean {
  return (
    esObjeto(c) &&
    typeof c.brillo === 'number' &&
    c.brillo >= 0 &&
    c.brillo <= 255 &&
    typeof c.lado_origen === 'number' &&
    Number.isInteger(c.lado_origen) &&
    c.lado_origen >= 0
  )
}

/** Texto para el estado "no concluyente": que paso y que hacer. */
export function mensajeNoConcluyente(motivo: ResultadoAnalisis['motivo']): string {
  if (motivo === 'unas_no_visibles') {
    return 'Vimos tu mano, pero no se alcanzan a ver las uñas: los dedos están doblados o quedan fuera de la foto. Abre la mano mostrando el dorso, con los dedos estirados y dentro del encuadre.'
  }
  if (motivo === 'imagen_pequena') {
    return 'La foto es muy pequeña para ver tus uñas. Acércate un poco o usa una foto de mayor tamaño.'
  }
  // sin_mano: no hay mano y la foto tampoco parece una sola uña vista de cerca.
  return 'No encontramos una mano en la foto, ni una uña vista de cerca. Muestra la mano abierta con el dorso y las uñas hacia la cámara, o acerca la cámara a una sola uña para que ocupe casi toda la foto, con buena luz natural.'
}
