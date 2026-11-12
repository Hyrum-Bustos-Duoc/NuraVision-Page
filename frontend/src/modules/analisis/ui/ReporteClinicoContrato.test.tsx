// @vitest-environment jsdom
/**
 * QA 2026-11-12 (reverificacion 6.1): respuestas que violan el contrato del bloque
 * clinico mas alla de las tres roturas que cubre «Resultado ok incompleto».
 *
 * El JSON de /vision/analizar llega sin validar (analisis.api.ts lo castea) y la
 * ruta /analisis no esta envuelta en ErrorBoundary: un error de render deja la
 * pagina entera en blanco. clinicoDe valida la forma completa de un `ok` y lo
 * convierte en clasificacion_fallida si algo no cuadra.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ResultadoAnalisis, UnaDetectada } from '../domain/analisis.types'
import { AVISO_CLINICO_POR_DEFECTO, mensajeMotivoClinico } from '../domain/clinico'
import { ReporteClinico } from './ReporteClinico'

const FALLIDA = mensajeMotivoClinico('clasificacion_fallida')

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
    reporte: { nombre: 'Línea de Beau', descripcion: 'd', asociaciones: ['a'], recomendacion: 'Consulta a un profesional' },
    ...cambios,
  }
}

function okConReporte(reporte: unknown): unknown {
  return okCrudo({ reporte })
}

// El JSON entra como `unknown` y se castea igual que en analisis.api.ts: asi el
// test reproduce lo que llega por red, no lo que el tipo promete.
function una(clinico: unknown, dedo: UnaDetectada['dedo']): UnaDetectada {
  return JSON.parse(
    JSON.stringify({
      dedo,
      mano: 1,
      esquinas: [],
      recorte: '',
      forma: null,
      aspecto: null,
      punta: null,
      forma_fiable: false,
      contorno: [],
      clinico,
    }),
  ) as UnaDetectada
}

function resultado(unas: UnaDetectada[], aviso_clinico = 'Señal orientativa. No es un diagnóstico médico.'): ResultadoAnalisis {
  return {
    estado: 'ok',
    motivo: null,
    manos: 1,
    unas,
    forma_predominante: null,
    aviso: 'x',
    modelo: { nombre: 'm', version: '1' },
    aviso_clinico,
    modelo_clinico: { nombre: 'c', version: '1' },
  }
}

async function abrir(r: ResultadoAnalisis) {
  render(<ReporteClinico resultado={r} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ver reporte clínico' }))
  return screen.getByTestId('reporte-clinico')
}

/** La una rota va primero y una sana despues: la sana debe seguir viendose. */
async function esperarFallidaYVecinaSana(clinicoRoto: unknown) {
  const panel = await abrir(resultado([una(clinicoRoto, 'indice'), una(okCrudo({ clase: 'linea_oscura' }), 'medio')]))
  const [rota, sana] = within(panel).getAllByTestId('clinico-una')
  expect(rota).toHaveTextContent(FALLIDA)
  expect(sana).toHaveTextContent('Línea de Beau')
}

describe('ReporteClinico con un ok que viola el contrato por dentro', () => {
  // Antes rompian la pagina (TypeError o "Objects are not valid as a React child").
  it.each<[string, unknown]>([
    ['reporte sin asociaciones (objeto vacio)', okConReporte({})],
    ['reporte con asociaciones que no es lista', okConReporte({ nombre: 'n', descripcion: 'd', asociaciones: 'texto', recomendacion: 'r' })],
    ['reporte con nombre que no es texto', okConReporte({ nombre: { a: 1 }, descripcion: 'd', asociaciones: [], recomendacion: 'r' })],
    ['reporte que es un texto y no un objeto', okConReporte('Línea de Beau')],
    ['reporte con recomendacion vacia', okConReporte({ nombre: 'n', descripcion: 'd', asociaciones: [], recomendacion: '  ' })],
    ['reporte con una asociacion que no es texto', okConReporte({ nombre: 'n', descripcion: 'd', asociaciones: [1], recomendacion: 'r' })],
    ['alternativas con un elemento null', okCrudo({ alternativas: [null, { clase: 'linea_mees', nombre: 'x', confianza: 0 }] })],
    ['alternativa sin confianza numerica', okCrudo({ alternativas: [{ clase: 'linea_mees', nombre: 'x', confianza: '0.1' }] })],
  ])('%s cae a clasificacion_fallida y la vecina sana se sigue viendo', async (_, roto) => {
    await esperarFallidaYVecinaSana(roto)
  })

  it('alternativas con nombre que no es texto no se pintan como [object Object]', async () => {
    const panel = await abrir(resultado([una(okCrudo({ alternativas: [{ nombre: { a: 1 } }, { nombre: 'x' }] }), 'indice')]))
    expect(panel).not.toHaveTextContent('[object Object]')
    expect(within(panel).getByTestId('clinico-una')).toHaveTextContent(FALLIDA)
  })

  // El schema Pydantic (Clinico) acepta estas alternativas; solo decidir() las impide.
  // Si llegan, el servicio rompio su contrato: no se filtran, se descarta el ok entero.
  it.each([
    ['sin_senales', { clase: 'sin_senales', nombre: 'Sin señales reconocidas', confianza: 0.1 }],
    ['otra', { clase: 'otra', nombre: 'Otra cosa', confianza: 0.1 }],
    ['la clase predicha', { clase: 'linea_beau', nombre: 'Línea de Beau repetida', confianza: 0.1 }],
  ])('una alternativa %s cae a clasificacion_fallida y no se muestra', async (_, prohibida) => {
    const alternativas = [prohibida, { clase: 'linea_mees', nombre: 'Línea de Mees', confianza: 0.05 }]
    const panel = await abrir(resultado([una(okCrudo({ alternativas }), 'indice'), una(okCrudo({ clase: 'linea_oscura' }), 'medio')]))
    const [rota, sana] = within(panel).getAllByTestId('clinico-una')
    expect(rota).toHaveTextContent(FALLIDA)
    expect(rota).not.toHaveTextContent(prohibida.nombre)
    expect(rota).not.toHaveTextContent('Línea de Mees')
    expect(sana).toHaveTextContent('Línea de Beau')
  })

  // Un bloque clinico no debe pintarse sin aviso, y `??` no cubre el texto vacio.
  it.each(['', '   '])('aviso_clinico %j usa el aviso por defecto', async (aviso) => {
    const panel = await abrir(resultado([una(okCrudo(), 'indice')], aviso))
    expect(panel.firstElementChild).toHaveTextContent(AVISO_CLINICO_POR_DEFECTO)
  })
})

describe('ReporteClinico con datos fuera de contrato que no rompen', () => {
  it('una clase fuera de las 8 publicas no rompe la pagina', async () => {
    const panel = await abrir(resultado([una(okCrudo({ clase: 'melanoma' }), 'indice')]))
    expect(within(panel).getAllByTestId('clinico-una')).toHaveLength(1)
  })

  it('un clinico que no es objeto cae al mensaje generico sin romper', async () => {
    const panel = await abrir(resultado([una('texto', 'indice'), una(okCrudo(), 'medio')]))
    const [rara, sana] = within(panel).getAllByTestId('clinico-una')
    expect(rara).toHaveTextContent(mensajeMotivoClinico('desconocido'))
    expect(sana).toHaveTextContent('Línea de Beau')
  })

  it('un ok con alternativas vacias se pinta sin la linea de alternativas', async () => {
    const panel = await abrir(resultado([una(okCrudo({ alternativas: [] }), 'indice')]))
    expect(panel).not.toHaveTextContent('Otras señales parecidas')
  })
})
