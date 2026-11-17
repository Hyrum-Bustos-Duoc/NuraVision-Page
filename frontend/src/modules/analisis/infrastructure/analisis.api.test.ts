import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorAnalisis } from '../domain/analisis.types'
import { analizarFoto, mensajeNoConcluyente, MAX_BYTES_FOTO } from './analisis.api'

const FOTO = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'mano.jpg', { type: 'image/jpeg' })

function responder(estado: number, cuerpo: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: estado })))
}

async function codigoDelError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa
  } catch (error) {
    if (error instanceof ErrorAnalisis) return error.codigo
    throw error
  }
  throw new Error('se esperaba un error y no hubo ninguno')
}

afterEach(() => vi.unstubAllGlobals())

describe('analizarFoto', () => {
  it('envia la foto en el campo "foto" y devuelve el resultado', async () => {
    const resultado = { estado: 'ok', motivo: null, manos: 1, unas: [], forma_predominante: null, aviso: 'x', modelo: { nombre: 'm', version: '1' } }
    responder(200, resultado)
    expect(await analizarFoto(FOTO)).toEqual(resultado)

    const [url, opciones] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/vision\/analizar$/)
    const cuerpo = (opciones as RequestInit).body as FormData
    expect(cuerpo.get('foto')).toBe(FOTO)
  })

  it('un resultado no concluyente llega como respuesta normal, no como error', async () => {
    responder(200, { estado: 'no_concluyente', motivo: 'sin_mano', manos: 0, unas: [] })
    expect((await analizarFoto(FOTO)).motivo).toBe('sin_mano')
  })

  it('traduce los codigos del servicio', async () => {
    responder(400, { codigo: 'imagen_invalida', detalle: 'no es JPEG' })
    expect(await codigoDelError(analizarFoto(FOTO))).toBe('imagen_invalida')
    responder(503, { codigo: 'modelo_no_disponible', detalle: 'falta el modelo' })
    expect(await codigoDelError(analizarFoto(FOTO))).toBe('modelo_no_disponible')
  })

  it('un cuerpo que no es del servicio (502 del proxy) se trata como servicio caido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })))
    expect(await codigoDelError(analizarFoto(FOTO))).toBe('servicio_no_disponible')
  })

  it('sin conexion con el servicio es servicio caido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await codigoDelError(analizarFoto(FOTO))).toBe('servicio_no_disponible')
  })

  it('una peticion abortada es "cancelado", no un fallo del servicio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('abortada', 'AbortError')))
    expect(await codigoDelError(analizarFoto(FOTO))).toBe('cancelado')
  })

  it('abortar mientras se lee el cuerpo tambien es "cancelado"', async () => {
    // fetch ya resolvio con las cabeceras; la clienta cambia de foto mientras
    // llega el JSON y el navegador rechaza json() con AbortError.
    const abortado = { ok: true, status: 200, json: () => Promise.reject(new DOMException('abortada', 'AbortError')) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(abortado))
    expect(await codigoDelError(analizarFoto(FOTO))).toBe('cancelado')
  })

  it('no sube una foto de mas de 10 MB', async () => {
    const enorme = new File([new Uint8Array(MAX_BYTES_FOTO + 1)], 'grande.jpg', { type: 'image/jpeg' })
    vi.stubGlobal('fetch', vi.fn())
    expect(await codigoDelError(analizarFoto(enorme))).toBe('imagen_muy_grande')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('mensajeNoConcluyente', () => {
  it('distingue foto pequena de foto sin mano', () => {
    expect(mensajeNoConcluyente('imagen_pequena')).toMatch(/muy pequeña/)
    expect(mensajeNoConcluyente('sin_mano')).toMatch(/No encontramos una mano/)
    // sin_mano tambien significa que la foto no parece una uña de cerca: se ofrecen las dos salidas.
    expect(mensajeNoConcluyente('sin_mano')).toMatch(/uña vista de cerca/)
  })
})
