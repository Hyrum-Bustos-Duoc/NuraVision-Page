// @vitest-environment jsdom
/**
 * QA 2026-11-12 (tercera pasada, tarea 6.1): entradas que ReporteClinicoContrato.test.tsx
 * no cubre. Cada caso toca una rama distinta de clinicoDe / avisoClinicoDe o del render:
 * aviso que no es texto, HTML en los textos (no debe inyectarse), textos enormes,
 * campos extra, un ok sin nada mas, alternativas que no son lista y un resumen con
 * unas mezcladas ok / rotas / no concluyentes.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResultadoAnalisis, UnaDetectada } from '../domain/analisis.types'
import { AVISO_CLINICO_POR_DEFECTO, mensajeMotivoClinico } from '../domain/clinico'
import { ReporteClinico } from './ReporteClinico'

const FALLIDA = mensajeMotivoClinico('clasificacion_fallida')
const HTML = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b>negrita</b>'

function okCrudo(cambios: Record<string, unknown> = {}): unknown {
  return {
    estado: 'ok',
    motivo: null,
    clase: 'linea_beau',
    confianza: 0.9,
    alternativas: [
      { clase: 'linea_mees', nombre: 'Línea de Mees', confianza: 0.05 },
      { clase: 'onicolisis', nombre: 'Onicólisis', confianza: 0.03 },
    ],
    reporte: { nombre: 'Línea de Beau', descripcion: 'd', asociaciones: ['a'], recomendacion: 'Consulta' },
    ...cambios,
  }
}

const DEDOS: UnaDetectada['dedo'][] = ['pulgar', 'indice', 'medio', 'anular', 'menique']

// Igual que analisis.api.ts: el JSON se castea sin validar.
function crudo(clinicos: unknown[], aviso_clinico: unknown = 'Aviso del servicio'): ResultadoAnalisis {
  return JSON.parse(
    JSON.stringify({
      estado: 'ok',
      motivo: null,
      manos: 1,
      unas: clinicos.map((clinico, i) => ({
        dedo: DEDOS[i],
        mano: 1,
        esquinas: [],
        recorte: '',
        forma: null,
        aspecto: null,
        punta: null,
        forma_fiable: false,
        contorno: [],
        clinico,
      })),
      forma_predominante: null,
      aviso: 'x',
      modelo: { nombre: 'm', version: '1' },
      aviso_clinico,
      modelo_clinico: { nombre: 'c', version: '1' },
    }),
  ) as ResultadoAnalisis
}

async function abrir(r: ResultadoAnalisis) {
  render(<ReporteClinico resultado={r} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ver reporte clínico' }))
  return screen.getByTestId('reporte-clinico')
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (window as { __xss?: number }).__xss
})

describe('aviso_clinico que no es texto', () => {
  it.each([null, 7, { texto: 'x' }, ['a']])('%j usa el aviso por defecto sin romper', async (aviso) => {
    const panel = await abrir(crudo([okCrudo()], aviso))
    expect(within(panel).getByRole('note')).toHaveTextContent(AVISO_CLINICO_POR_DEFECTO)
  })
})

describe('HTML en los textos del servicio', () => {
  it('se pinta como texto y no crea elementos ni ejecuta nada', async () => {
    const reporte = { nombre: HTML, descripcion: HTML, asociaciones: [HTML], recomendacion: HTML }
    const alternativas = [
      { clase: 'linea_mees', nombre: HTML, confianza: 0.05 },
      { clase: 'onicolisis', nombre: 'Onicólisis', confianza: 0.03 },
    ]
    const panel = await abrir(crudo([okCrudo({ reporte, alternativas })], HTML))
    expect(panel.querySelector('img, script, b')).toBeNull()
    expect(within(panel).getByRole('note')).toHaveTextContent(HTML)
    expect((window as { __xss?: number }).__xss).toBeUndefined()
  })
})

describe('tamanos y campos fuera de lo esperado', () => {
  it('textos de 200.000 caracteres se pintan sin romper', async () => {
    const largo = 'x'.repeat(200_000)
    const reporte = { nombre: largo, descripcion: largo, asociaciones: [largo], recomendacion: largo }
    const panel = await abrir(crudo([okCrudo({ reporte })]))
    expect(within(panel).getByTestId('clinico-una').textContent?.length).toBeGreaterThan(800_000)
  })

  it('campos extra en reporte, alternativas y bloque se ignoran', async () => {
    const reporte = { nombre: 'Línea de Beau', descripcion: 'd', asociaciones: ['a'], recomendacion: 'r', html: HTML, porcentaje: 0.97 }
    const alternativas = [
      { clase: 'linea_mees', nombre: 'Línea de Mees', confianza: 0.05, extra: { a: 1 } },
      { clase: 'onicolisis', nombre: 'Onicólisis', confianza: 0.03 },
    ]
    const panel = await abrir(crudo([okCrudo({ reporte, alternativas, diagnostico: 'Melanoma' })]))
    const una = within(panel).getByTestId('clinico-una')
    expect(una).toHaveTextContent('Línea de Beau')
    expect(una).not.toHaveTextContent('Melanoma')
    expect(una).not.toHaveTextContent('97')
  })
})

describe('ok con la forma rota de maneras que la otra suite no prueba', () => {
  it.each<[string, unknown]>([
    ['solo estado ok', { estado: 'ok' }],
    ['alternativas como objeto', okCrudo({ alternativas: { 0: { clase: 'linea_mees', nombre: 'x', confianza: 0 } } })],
    ['alternativas null', okCrudo({ alternativas: null })],
    ['reporte null', okCrudo({ reporte: null })],
    ['reporte lista', okCrudo({ reporte: ['Línea de Beau'] })],
    ['asociaciones null', okCrudo({ reporte: { nombre: 'n', descripcion: 'd', asociaciones: null, recomendacion: 'r' } })],
    ['descripcion numero', okCrudo({ reporte: { nombre: 'n', descripcion: 3, asociaciones: [], recomendacion: 'r' } })],
    ['alternativa con nombre vacio', okCrudo({ alternativas: [{ clase: 'linea_mees', nombre: ' ', confianza: 0.1 }] })],
    ['alternativa con clase null', okCrudo({ alternativas: [{ clase: null, nombre: 'x', confianza: 0.1 }] })],
    ['alternativa con confianza null', okCrudo({ alternativas: [{ clase: 'linea_mees', nombre: 'x', confianza: null }] })],
  ])('%s cae a clasificacion_fallida', async (_, roto) => {
    const panel = await abrir(crudo([roto, okCrudo({ clase: 'linea_oscura' })]))
    const [rota, sana] = within(panel).getAllByTestId('clinico-una')
    expect(rota).toHaveTextContent(FALLIDA)
    expect(sana).toHaveTextContent('Línea de Beau')
  })
})

describe('mano con unas mezcladas', () => {
  it('el resumen cuenta las rotas y las raras como no concluyentes y las sanas siguen', async () => {
    const panel = await abrir(
      crudo([
        okCrudo(),
        okCrudo({ reporte: {} }),
        { estado: 'no_concluyente', motivo: 'confianza_baja', clase: null, confianza: null, alternativas: [], reporte: null },
        okCrudo({ alternativas: [{ clase: 'sin_senales', nombre: 'Sin señales reconocidas', confianza: 0.2 }] }),
        'texto',
      ]),
    )
    expect(within(panel).getByTestId('resumen-clinico')).toHaveTextContent(
      'De 5 uñas, 1 muestra una señal para consultar, 0 no muestran señales reconocidas y 4 no fueron concluyentes.',
    )
    const unas = within(panel).getAllByTestId('clinico-una')
    expect(unas[0]).toHaveTextContent('Línea de Beau')
    expect(unas[1]).toHaveTextContent(FALLIDA)
    expect(unas[3]).toHaveTextContent(FALLIDA)
    expect(panel).not.toHaveTextContent('Sin señales reconocidas')
  })
})

describe('asociaciones repetidas', () => {
  // Ni clinicoDe ni el esquema Pydantic ni cargar_textos impiden repetidos, asi que
  // la key de cada asociacion incluye su posicion (QA 2026-11-12).
  it('no produce avisos de React por keys duplicadas', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reporte = { nombre: 'n', descripcion: 'd', asociaciones: ['igual', 'igual'], recomendacion: 'r' }
    await abrir(crudo([okCrudo({ reporte })]))
    expect(error.mock.calls.map((c) => String(c[0])).join('\n')).not.toMatch(/same key/)
  })
})
