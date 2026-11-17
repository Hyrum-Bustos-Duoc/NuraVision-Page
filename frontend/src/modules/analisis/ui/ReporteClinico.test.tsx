// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ClaseClinica, Clinico, Dedo, MotivoClinico, ResultadoAnalisis, UnaDetectada } from '../domain/analisis.types'
import { mensajeMotivoClinico } from '../domain/clinico'
import { ReporteClinico } from './ReporteClinico'
import { ResultadoUnas } from './ResultadoUnas'

const AVISO = 'Señal orientativa para consultar con un profesional de la salud. No es un diagnóstico médico.'

const NOMBRES: Record<ClaseClinica, string> = {
  linea_beau: 'Línea de Beau',
  linea_oscura: 'Banda oscura longitudinal',
  acropaquia: 'Acropaquia',
  linea_mees: 'Línea de Mees',
  onicolisis: 'Onicólisis',
  una_terry: 'Uña de Terry',
  mancha_blanca: 'Mancha blanca',
  sin_senales: 'Sin señales reconocidas',
}

function ok(clase: ClaseClinica, confianza = 0.873): Extract<Clinico, { estado: 'ok' }> {
  return {
    estado: 'ok',
    motivo: null,
    clase,
    confianza,
    alternativas: [
      { clase: 'mancha_blanca', nombre: NOMBRES.mancha_blanca, confianza: 0.061 },
      { clase: 'onicolisis', nombre: NOMBRES.onicolisis, confianza: 0.042 },
    ],
    reporte: {
      nombre: NOMBRES[clase],
      descripcion: `Descripción de ${clase}`,
      asociaciones: clase === 'sin_senales' ? [] : [`Asociación de ${clase}`],
      recomendacion: `Consulta con un profesional sobre ${clase}`,
    },
  }
}

function nc(motivo: MotivoClinico): Clinico {
  return { estado: 'no_concluyente', motivo, clase: null, confianza: null, alternativas: [], reporte: null }
}

function una(clinico: Clinico | undefined, dedo: Dedo | null = 'indice', mano: number | null = 1): UnaDetectada {
  return {
    dedo,
    mano,
    esquinas: [],
    recorte: 'data:image/jpeg;base64,AAAA',
    forma: null,
    aspecto: null,
    punta: null,
    forma_fiable: false,
    contorno: [],
    ...(clinico ? { clinico } : {}),
  }
}

function resultado(unas: UnaDetectada[], extra: Partial<ResultadoAnalisis> = {}): ResultadoAnalisis {
  return {
    estado: 'ok',
    motivo: null,
    manos: 1,
    unas,
    forma_predominante: null,
    aviso: 'x',
    modelo: { nombre: 'm', version: '1' },
    aviso_clinico: AVISO,
    modelo_clinico: { nombre: 'clinico', version: '1' },
    ...extra,
  }
}

const boton = () => screen.getByRole('button', { name: 'Ver reporte clínico' })

describe('ReporteClinico: boton', () => {
  it('colapsado al cargar: aria-expanded=false y ni el nombre ni los textos ni el aviso estan en el DOM', () => {
    render(<ReporteClinico resultado={resultado([una(ok('linea_beau'))])} />)
    expect(boton()).toHaveAttribute('aria-expanded', 'false')
    const html = document.body.innerHTML
    expect(html).not.toContain('Línea de Beau')
    expect(html).not.toContain('Descripción de linea_beau')
    expect(html).not.toContain('Consulta con un profesional sobre linea_beau')
    expect(html).not.toContain(AVISO)
  })

  it('expande con el aviso al inicio y vuelve a colapsar', async () => {
    const user = userEvent.setup()
    render(<ReporteClinico resultado={resultado([una(ok('linea_beau'))])} />)

    await user.click(boton())
    expect(boton()).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByTestId('reporte-clinico')
    expect(boton()).toHaveAttribute('aria-controls', panel.id)
    expect(panel.firstElementChild).toHaveTextContent(AVISO)
    expect(within(panel).getByText('Línea de Beau')).toBeInTheDocument()

    await user.click(boton())
    expect(boton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('reporte-clinico')).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('Línea de Beau')
  })

  it('funciona con el teclado (Enter y Espacio)', async () => {
    const user = userEvent.setup()
    render(<ReporteClinico resultado={resultado([una(ok('linea_beau'))])} />)
    await user.tab()
    expect(boton()).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(boton()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(boton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('sin uñas no existe el botón', () => {
    render(<ReporteClinico resultado={resultado([])} />)
    expect(screen.queryByRole('button', { name: 'Ver reporte clínico' })).not.toBeInTheDocument()
  })

  it('al analizar otra foto el bloque vuelve a estar colapsado', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ResultadoUnas resultado={resultado([una(ok('linea_beau'))])} fotoUrl="blob:primera" />,
    )
    await user.click(boton())
    expect(boton()).toHaveAttribute('aria-expanded', 'true')

    rerender(<ResultadoUnas resultado={resultado([una(ok('una_terry'))])} fotoUrl="blob:segunda" />)
    expect(boton()).toHaveAttribute('aria-expanded', 'false')
    expect(document.body.innerHTML).not.toContain('Uña de Terry')
  })
})

describe('ReporteClinico: contenido', () => {
  async function abrir(r: ResultadoAnalisis) {
    const user = userEvent.setup()
    render(<ReporteClinico resultado={r} />)
    await user.click(boton())
    return screen.getByTestId('reporte-clinico')
  }

  it('una uña ok muestra nombre, descripción, asociaciones, recomendación y alternativas solo como nombres', async () => {
    const panel = await abrir(resultado([una(ok('linea_beau'))]))
    expect(panel).toHaveTextContent('Línea de Beau')
    expect(panel).toHaveTextContent('Descripción de linea_beau')
    expect(panel).toHaveTextContent('Asociación de linea_beau')
    expect(panel).toHaveTextContent('Consulta con un profesional sobre linea_beau')
    expect(panel).toHaveTextContent('Otras señales parecidas: Mancha blanca y Onicólisis.')
  })

  it('sin_senales no muestra alternativas', async () => {
    const panel = await abrir(resultado([una(ok('sin_senales'))]))
    expect(panel).toHaveTextContent('Sin señales reconocidas')
    expect(panel).not.toHaveTextContent('Otras señales parecidas')
    expect(panel).not.toHaveTextContent('Mancha blanca')
  })

  it('no muestra porcentajes ni valores de confianza', async () => {
    const panel = await abrir(resultado([una(ok('linea_beau', 0.873)), una(ok('sin_senales', 0.873), 'medio')]))
    const texto = panel.textContent ?? ''
    expect(texto).not.toMatch(/87/)
    expect(texto).not.toContain('0,87')
    expect(texto).not.toContain('0.87')
    expect(texto).not.toContain('%')
    // Ni las confianzas de las alternativas.
    expect(texto).not.toMatch(/0[.,]0[46]/)
  })

  it.each<MotivoClinico>(['confianza_baja', 'clase_otra', 'clasificacion_fallida'])(
    'no concluyente por %s: su mensaje, sin clase ni alternativas',
    async (motivo) => {
      const panel = await abrir(resultado([una(nc(motivo)), una(ok('linea_beau'), 'medio')]))
      const [primera] = within(panel).getAllByTestId('clinico-una')
      expect(primera).toHaveTextContent(mensajeMotivoClinico(motivo))
      expect(primera).not.toHaveTextContent('Otras señales parecidas')
      Object.values(NOMBRES).forEach((n) => expect(primera).not.toHaveTextContent(n))
    },
  )

  it('un motivo desconocido muestra el mensaje genérico y no falla', async () => {
    const raro: Clinico = JSON.parse(
      '{"estado":"no_concluyente","motivo":"motivo_nuevo","clase":null,"confianza":null,"alternativas":[],"reporte":null}',
    )
    const panel = await abrir(resultado([una(raro), una(ok('linea_beau'), 'medio')]))
    const [primera] = within(panel).getAllByTestId('clinico-una')
    expect(primera).toHaveTextContent(mensajeMotivoClinico('motivo_nuevo'))
  })

  it('un estado desconocido se trata como no concluyente', async () => {
    const raro: Clinico = JSON.parse(
      '{"estado":"pendiente","motivo":null,"clase":"linea_beau","confianza":0.9,"alternativas":[],"reporte":{"nombre":"Línea de Beau","descripcion":"d","asociaciones":[],"recomendacion":"r"}}',
    )
    const panel = await abrir(resultado([una(raro), una(ok('sin_senales'), 'medio')]))
    const [primera] = within(panel).getAllByTestId('clinico-una')
    expect(primera).not.toHaveTextContent('Línea de Beau')
    expect(primera).toHaveTextContent(mensajeMotivoClinico('desconocido'))
  })

  it('un ok sin reporte (servicio roto) no deja la página en blanco: cae a clasificacion_fallida', async () => {
    const roto: Clinico = JSON.parse(JSON.stringify({ ...ok('linea_beau'), reporte: null }))
    const panel = await abrir(resultado([una(roto), una(ok('linea_oscura'), 'medio')]))
    const [primera, segunda] = within(panel).getAllByTestId('clinico-una')
    expect(primera).toHaveTextContent(mensajeMotivoClinico('clasificacion_fallida'))
    expect(segunda).toHaveTextContent('Banda oscura longitudinal')
  })

  it('todas modelo_no_entrenado: solo "aún no está disponible", sin lista por uña', async () => {
    const panel = await abrir(resultado([una(nc('modelo_no_entrenado')), una(nc('modelo_no_entrenado'), 'medio')]))
    expect(panel).toHaveTextContent('El reporte clínico aún no está disponible.')
    expect(within(panel).queryAllByTestId('clinico-una')).toHaveLength(0)
    expect(within(panel).queryByTestId('resumen-clinico')).not.toBeInTheDocument()
  })

  it('servicio anterior sin `clinico` ni aviso_clinico: no revienta y dice que no está disponible', async () => {
    const r = resultado([una(undefined), una(undefined, 'medio')])
    delete r.aviso_clinico
    delete r.modelo_clinico
    const panel = await abrir(r)
    expect(panel).toHaveTextContent('El reporte clínico aún no está disponible.')
    expect(within(panel).queryAllByTestId('clinico-una')).toHaveLength(0)
  })

  it('resumen de una mano', async () => {
    const panel = await abrir(
      resultado([
        una(ok('linea_beau'), 'pulgar'),
        una(ok('sin_senales'), 'indice'),
        una(ok('sin_senales'), 'medio'),
        una(nc('confianza_baja'), 'anular'),
        una(nc('confianza_baja'), 'menique'),
      ]),
    )
    expect(within(panel).getByTestId('resumen-clinico')).toHaveTextContent(
      'De 5 uñas, 1 muestra una señal para consultar, 2 no muestran señales reconocidas y 2 no fueron concluyentes.',
    )
    // Mismo orden que las tarjetas de uñas.
    const dedos = within(panel)
      .getAllByTestId('clinico-una')
      .map((li) => li.firstElementChild?.textContent)
    expect(dedos).toEqual(['Pulgar', 'Índice', 'Medio', 'Anular', 'Meñique'])
  })

  it('resumen con dos manos se muestra por separado', async () => {
    const panel = await abrir(
      resultado([una(ok('linea_beau'), 'indice', 1), una(nc('confianza_baja'), 'indice', 2)], { manos: 2 }),
    )
    const resumen = within(panel).getByTestId('resumen-clinico')
    expect(resumen).toHaveTextContent('Mano 1: De 1 uña, 1 muestra una señal para consultar')
    expect(resumen).toHaveTextContent('Mano 2: De 1 uña, 0 muestran una señal para consultar, 0 no muestran señales reconocidas y 1 no fue concluyente.')
    expect(within(panel).getAllByTestId('clinico-una')[1]).toHaveTextContent('Índice · mano 2')
  })

  it.each<ClaseClinica>(['linea_mees', 'acropaquia'])(
    '%s como clase predicha no se nombra: mensaje genérico y cuenta como no concluyente',
    async (clase) => {
      const panel = await abrir(resultado([una(ok(clase)), una(ok('linea_beau'), 'medio')]))
      const [oculta, visible] = within(panel).getAllByTestId('clinico-una')
      expect(oculta).toHaveTextContent(mensajeMotivoClinico('motivo_desconocido'))
      expect(oculta).not.toHaveTextContent(NOMBRES[clase])
      expect(oculta).not.toHaveTextContent(`Descripción de ${clase}`)
      expect(oculta).not.toHaveTextContent('Otras señales parecidas')
      expect(visible).toHaveTextContent('Línea de Beau')
      expect(within(panel).getByTestId('resumen-clinico')).toHaveTextContent(
        'De 2 uñas, 1 muestra una señal para consultar, 0 no muestran señales reconocidas y 1 no fue concluyente.',
      )
    },
  )

  it('linea_mees y acropaquia como alternativas se quitan; el resto se muestra', async () => {
    const c = ok('linea_beau')
    const conOcultas: Clinico = {
      ...c,
      alternativas: [
        { clase: 'linea_mees', nombre: NOMBRES.linea_mees, confianza: 0.06 },
        { clase: 'onicolisis', nombre: NOMBRES.onicolisis, confianza: 0.04 },
      ],
    }
    const soloOcultas: Clinico = {
      ...ok('una_terry'),
      alternativas: [
        { clase: 'acropaquia', nombre: NOMBRES.acropaquia, confianza: 0.06 },
        { clase: 'linea_mees', nombre: NOMBRES.linea_mees, confianza: 0.04 },
      ],
    }
    const panel = await abrir(resultado([una(conOcultas), una(soloOcultas, 'medio')]))
    const [primera, segunda] = within(panel).getAllByTestId('clinico-una')
    expect(primera).toHaveTextContent('Otras señales parecidas: Onicólisis.')
    expect(segunda).toHaveTextContent('Uña de Terry')
    expect(segunda).not.toHaveTextContent('Otras señales parecidas')
    expect(panel).not.toHaveTextContent(NOMBRES.linea_mees)
    expect(panel).not.toHaveTextContent(NOMBRES.acropaquia)
  })

  it('primer_plano (dedo y mano null): sin rótulo de dedo ni "mano", y el reporte se pinta', async () => {
    const panel = await abrir(resultado([una(ok('linea_beau'), null, null)], { modo: 'primer_plano', manos: 0 }))
    const tarjeta = within(panel).getByTestId('clinico-una')
    expect(tarjeta.firstElementChild).toHaveTextContent('Línea de Beau')
    expect(tarjeta).not.toHaveTextContent(/mano|null|undefined/i)
    expect(within(panel).getByTestId('resumen-clinico')).toHaveTextContent(
      'De 1 uña, 1 muestra una señal para consultar, 0 no muestran señales reconocidas y 0 no fueron concluyentes.',
    )
    expect(within(panel).getByTestId('resumen-clinico')).not.toHaveTextContent(/Mano/)
  })

  it('no persiste nada en localStorage ni sessionStorage', async () => {
    localStorage.clear()
    sessionStorage.clear()
    await abrir(resultado([una(ok('linea_oscura'))]))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
