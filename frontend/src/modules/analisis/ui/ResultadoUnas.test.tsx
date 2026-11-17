// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Forma, ResultadoAnalisis, UnaDetectada } from '../domain/analisis.types'
import { ResultadoUnas } from './ResultadoUnas'

const ESQUINAS: [number, number][] = [
  [0.1, 0.1],
  [0.2, 0.1],
  [0.2, 0.2],
  [0.1, 0.2],
]

function una(forma: Forma | null, fiable = forma !== null): UnaDetectada {
  return {
    dedo: 'indice',
    mano: 1,
    esquinas: ESQUINAS,
    recorte: 'data:image/jpeg;base64,AAAA',
    forma,
    aspecto: forma ? 1.1 : null,
    punta: forma ? 0.5 : null,
    forma_fiable: forma ? fiable : false,
    calidad: { brillo: 128, lado_origen: 400 },
    clinico: { estado: 'no_concluyente', motivo: 'modelo_no_entrenado', clase: null, confianza: null, alternativas: [], reporte: null },
    contorno: forma
      ? [
          [0.3, 0.3],
          [0.7, 0.3],
          [0.5, 0.8],
        ]
      : [],
  }
}

function resultado(unas: UnaDetectada[], forma_predominante: Forma | null): ResultadoAnalisis {
  return {
    estado: 'ok',
    motivo: null,
    modo: 'mano_completa',
    manos: 1,
    unas,
    forma_predominante,
    aviso: 'x',
    modelo: { nombre: 'm', version: '1' },
    aviso_clinico: 'x',
    modelo_clinico: null,
  }
}

describe('ResultadoUnas: forma', () => {
  it('sin segmentador (todas forma=null) dice "Forma no medida" en cada una y no inventa predominante', () => {
    render(<ResultadoUnas resultado={resultado([una(null), una(null)], null)} fotoUrl="blob:x" />)
    const porUna = screen.getAllByTestId('forma-una')
    expect(porUna).toHaveLength(2)
    porUna.forEach((p) => expect(p).toHaveTextContent('Forma no medida'))
    const resumen = screen.getByTestId('forma-resumen')
    expect(resumen).toHaveTextContent('No pudimos medir la forma')
    expect(resumen).not.toHaveTextContent(/Medimos/)
    // Sin contorno no se dibuja el poligono del contorno sobre el recorte.
    expect(document.querySelectorAll('polygon[stroke-width="2"]')).toHaveLength(0)
  })

  it('muestra la forma predominante y cuantas se midieron', () => {
    render(
      <ResultadoUnas
        resultado={resultado([una('redonda'), una('redonda'), una(null)], 'redonda')}
        fotoUrl="blob:x"
      />,
    )
    const resumen = screen.getByTestId('forma-resumen')
    expect(within(resumen).getByText('Redonda')).toBeInTheDocument()
    expect(resumen).toHaveTextContent('Medimos 2 de 3 uñas')
  })

  it('una forma no fiable se marca como estimación poco fiable', () => {
    render(<ResultadoUnas resultado={resultado([una('almendra', false)], null)} fotoUrl="blob:x" />)
    expect(screen.getByTestId('forma-una')).toHaveTextContent('Almendra (estimación poco fiable)')
    // Hay una medida pero ninguna fiable: no se presenta como "no pudimos medir".
    const resumen = screen.getByTestId('forma-resumen')
    expect(resumen).toHaveTextContent('no podemos asegurar una forma')
    expect(resumen).not.toHaveTextContent('No pudimos medir')
  })
})

describe('ResultadoUnas: primer_plano', () => {
  // Contrato de services/api: primer_plano lleva 0 manos y una sola una sin dedo, mano ni forma.
  const primerPlano: ResultadoAnalisis = {
    ...resultado([{ ...una(null), dedo: null, mano: null }], null),
    modo: 'primer_plano',
    manos: 0,
  }

  it('con dedo null no revienta y no pinta rótulo de dedo ni de mano', () => {
    render(<ResultadoUnas resultado={primerPlano} fotoUrl="blob:x" />)
    expect(screen.getByRole('heading', { name: 'Encontramos 1 uña' })).toBeInTheDocument()
    expect(screen.getByAltText('Tu uña vista de cerca')).toBeInTheDocument()
    const tarjeta = screen.getByRole('listitem')
    expect(tarjeta).not.toHaveTextContent(/null|undefined|mano/i)
    expect(tarjeta.querySelectorAll('p')).toHaveLength(1)
  })

  it('explica que no se mide la forma sin la mano y no dibuja el recuadro sobre la foto', () => {
    render(<ResultadoUnas resultado={primerPlano} fotoUrl="blob:x" />)
    const resumen = screen.getByTestId('forma-resumen')
    expect(resumen).toHaveTextContent('no medimos la forma')
    expect(resumen).not.toHaveTextContent('No pudimos medir')
    expect(document.querySelectorAll('polygon')).toHaveLength(0)
    expect(screen.getByAltText('Tu fotografía')).toBeInTheDocument()
    expect(screen.queryByText(/Los recuadros/)).not.toBeInTheDocument()
    expect(screen.getByText(/una sola uña vista de cerca/)).toBeInTheDocument()
  })

  it('mano_completa sigue dibujando recuadros y el rótulo del dedo', () => {
    render(<ResultadoUnas resultado={resultado([una(null)], null)} fotoUrl="blob:x" />)
    expect(screen.getByAltText('Tu fotografía con las uñas marcadas')).toBeInTheDocument()
    expect(screen.getByAltText('Uña del dedo índice')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Índice')
    expect(document.querySelectorAll('polygon')).toHaveLength(1)
    expect(screen.getByText(/Los recuadros/)).toBeInTheDocument()
  })
})
