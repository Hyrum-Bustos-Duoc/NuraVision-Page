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

// Una.esquinas en esquemas.py: exactamente 4 pares (x, y).
const ESQUINAS = [
  [0.1, 0.1],
  [0.2, 0.1],
  [0.2, 0.2],
  [0.1, 0.2],
]

describe('analizarFoto', () => {
  it('envia la foto en el campo "foto" y devuelve el resultado', async () => {
    const resultado = {
      estado: 'ok',
      motivo: null,
      modo: 'mano_completa',
      manos: 1,
      unas: [{ dedo: 'indice', mano: 1, esquinas: ESQUINAS, calidad: { brillo: 120, lado_origen: 300 } }],
      forma_predominante: null,
      aviso: 'x',
      modelo: { nombre: 'm', version: '1' },
    }
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

  describe('calidad de cada uña', () => {
    const unaCon = (calidad?: unknown) => ({
      dedo: 'indice',
      mano: 1,
      esquinas: ESQUINAS,
      recorte: '',
      forma: null,
      aspecto: null,
      punta: null,
      forma_fiable: false,
      contorno: [],
      ...(calidad === undefined ? {} : { calidad }),
    })
    const conUnas = (unas: unknown[]) => ({ estado: 'ok', motivo: null, modo: 'mano_completa', manos: 1, unas, forma_predominante: null, aviso: 'x', modelo: { nombre: 'm', version: '1' } })

    it('con calidad valida devuelve el resultado', async () => {
      const cuerpo = conUnas([unaCon({ brillo: 0, lado_origen: 0 }), unaCon({ brillo: 255, lado_origen: 900 })])
      responder(200, cuerpo)
      expect(await analizarFoto(FOTO)).toEqual(cuerpo)
    })

    it('una uña sin calidad (servicio anterior) se trata como servicio caido', async () => {
      responder(200, conUnas([unaCon({ brillo: 120, lado_origen: 300 }), unaCon()]))
      expect(await codigoDelError(analizarFoto(FOTO))).toBe('servicio_no_disponible')
    })

    it.each([
      ['null', null],
      ['sin lado_origen', { brillo: 120 }],
      ['brillo > 255', { brillo: 256, lado_origen: 300 }],
      ['brillo negativo', { brillo: -1, lado_origen: 300 }],
      ['brillo como texto', { brillo: '120', lado_origen: 300 }],
      ['lado_origen decimal', { brillo: 120, lado_origen: 63.9 }],
      ['lado_origen negativo', { brillo: 120, lado_origen: -1 }],
    ])('calidad %s se trata como servicio caido', async (_, calidad) => {
      responder(200, conUnas([unaCon(calidad)]))
      expect(await codigoDelError(analizarFoto(FOTO))).toBe('servicio_no_disponible')
    })

    it('un cuerpo sin lista de unas se trata como servicio caido', async () => {
      responder(200, { estado: 'ok', motivo: null })
      expect(await codigoDelError(analizarFoto(FOTO))).toBe('servicio_no_disponible')
    })
  })

  // ResultadoAnalisis._invariantes en esquemas.py. Pydantic no deja salir estos cuerpos;
  // si llegan, el servicio no habla este contrato.
  describe('invariantes del resultado', () => {
    const CALIDAD = { brillo: 120, lado_origen: 300 }
    const deMano = (dedo: string, mano = 1) => ({ dedo, mano, forma: 'ovalada', esquinas: ESQUINAS, calidad: CALIDAD })
    const deCerca = { dedo: null, mano: null, forma: null, esquinas: ESQUINAS, calidad: CALIDAD }
    const base = { motivo: null, forma_predominante: null, aviso: 'x', modelo: { nombre: 'm', version: '1' } }
    const primerPlano = { ...base, estado: 'ok', modo: 'primer_plano', manos: 0, unas: [deCerca] }
    const manoCompleta = { ...base, estado: 'ok', modo: 'mano_completa', manos: 2, unas: [deMano('indice'), deMano('pulgar', 2)] }

    it.each([
      ['primer_plano con 0 manos y 1 uña sin dedo, mano ni forma', primerPlano],
      ['primer_plano con la uña sin el campo forma (default None)', { ...primerPlano, unas: [{ dedo: null, mano: null, esquinas: ESQUINAS, calidad: CALIDAD }] }],
      ['mano_completa con dedo y mano en cada uña', manoCompleta],
      ['no_concluyente con modo null y sin uñas', { ...base, estado: 'no_concluyente', motivo: 'sin_mano', modo: null, manos: 0, unas: [] }],
    ])('acepta %s', async (_, cuerpo) => {
      responder(200, cuerpo)
      expect(await analizarFoto(FOTO)).toEqual(cuerpo)
    })

    it.each([
      ['ok sin uñas', { ...manoCompleta, unas: [] }],
      ['ok sin modo', { ...manoCompleta, modo: null }],
      ['ok sin el campo modo', { ...base, estado: 'ok', manos: 1, unas: [deMano('indice')] }],
      ['no_concluyente con modo', { ...base, estado: 'no_concluyente', motivo: 'sin_mano', modo: 'mano_completa', manos: 0, unas: [] }],
      ['no_concluyente con uñas', { ...manoCompleta, estado: 'no_concluyente', motivo: 'sin_mano', modo: null }],
      ['primer_plano con 1 mano', { ...primerPlano, manos: 1 }],
      ['primer_plano con 2 uñas', { ...primerPlano, unas: [deCerca, deCerca] }],
      ['primer_plano con dedo', { ...primerPlano, unas: [{ ...deCerca, dedo: 'indice' }] }],
      ['primer_plano con mano', { ...primerPlano, unas: [{ ...deCerca, mano: 1 }] }],
      ['primer_plano con forma', { ...primerPlano, unas: [{ ...deCerca, forma: 'ovalada' }] }],
      ['mano_completa con una uña sin dedo', { ...manoCompleta, unas: [deMano('indice'), { ...deMano('pulgar'), dedo: null }] }],
      ['mano_completa con una uña sin mano', { ...manoCompleta, unas: [{ ...deMano('indice'), mano: null }] }],
      ['una uña que no es objeto', { ...manoCompleta, unas: [deMano('indice'), null] }],
      // QA 2026-11-17: dedo y mano son obligatorios en Pydantic (sin default); ausentes no son null.
      ['primer_plano con la uña sin el campo dedo', { ...primerPlano, unas: [{ mano: null, forma: null, esquinas: ESQUINAS, calidad: CALIDAD }] }],
      ['primer_plano con la uña sin el campo mano', { ...primerPlano, unas: [{ dedo: null, forma: null, esquinas: ESQUINAS, calidad: CALIDAD }] }],
      ['primer_plano sin el campo manos', { ...primerPlano, manos: undefined }],
      ['unas que no es lista', { ...manoCompleta, unas: { 0: deMano('indice') } }],
      // ResultadoUnas recorre u.esquinas sin defenderse: una ausente tumbaba la pantalla.
      ['mano_completa con una uña sin esquinas', { ...manoCompleta, unas: [deMano('indice'), { ...deMano('pulgar', 2), esquinas: undefined }] }],
      ['primer_plano con la uña sin esquinas', { ...primerPlano, unas: [{ ...deCerca, esquinas: undefined }] }],
      ['una uña con 3 esquinas', { ...manoCompleta, unas: [{ ...deMano('indice'), esquinas: ESQUINAS.slice(0, 3) }] }],
      ['una esquina que no es un par', { ...manoCompleta, unas: [{ ...deMano('indice'), esquinas: [...ESQUINAS.slice(0, 3), [0.1]] }] }],
      ['una esquina con coordenada de texto', { ...manoCompleta, unas: [{ ...deMano('indice'), esquinas: [...ESQUINAS.slice(0, 3), [0.1, '0.2']] }] }],
      // Literal de modo y estado, y manos Field(ge=0) entero.
      ['mano_completa sin el campo manos', { ...manoCompleta, manos: undefined }],
      ['manos decimal', { ...manoCompleta, manos: 1.5 }],
      ['manos de texto', { ...manoCompleta, manos: '2' }],
      ['el estado senal_inespecifica (es del bloque clinico, no del resultado)', { ...base, estado: 'senal_inespecifica', modo: null, manos: 0, unas: [] }],
    ])('%s se trata como servicio caido', async (_, cuerpo) => {
      responder(200, cuerpo)
      expect(await codigoDelError(analizarFoto(FOTO))).toBe('servicio_no_disponible')
    })

    // QA 2026-11-17: divergencias con Pydantic (Literal de modo y estado, manos ge=0),
    // cerradas en resultadoValido.
    it.each([
      ['ok con un modo que el contrato no conoce', { ...manoCompleta, modo: 'zoom' }],
      ['un estado que el contrato no conoce', { ...base, estado: 'error', modo: null, manos: 0, unas: [] }],
      ['mano_completa con manos negativo', { ...manoCompleta, manos: -1 }],
    ])('%s se trata como servicio caido', async (_, cuerpo) => {
      responder(200, cuerpo)
      expect(await codigoDelError(analizarFoto(FOTO))).toBe('servicio_no_disponible')
    })
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
  })

  // primer_plano puede estar apagado en el servidor: el mensaje no puede afirmar que se
  // busco una uña de cerca ni pedir solo ese camino.
  it('sin_mano pide la mano completa y deja la uña de cerca como alternativa, sin afirmar que se buscó', () => {
    const m = mensajeNoConcluyente('sin_mano')
    expect(m).toMatch(/mano completa/)
    expect(m).toMatch(/una sola uña/)
    expect(m).toMatch(/bien enfocada/)
    expect(m).not.toMatch(/ni una uña/)
    expect(m).not.toMatch(/acerca la cámara/i)
    expect(m.indexOf('mano completa')).toBeLessThan(m.indexOf('una sola uña'))
  })
})
