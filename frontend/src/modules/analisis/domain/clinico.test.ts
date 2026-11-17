import { describe, expect, it } from 'vitest'
import type { AlternativaClinica, Clinico, ClaseClinica, MotivoClinico, UnaDetectada } from './analisis.types'
import { AVISO_CLINICO_POR_DEFECTO, CLINICO_NO_DISPONIBLE, avisoClinicoDe, clinicoDe, mensajeMotivoClinico, resumenClinico } from './clinico'

function una(mano: number | null, clinico?: Clinico): UnaDetectada {
  return {
    dedo: mano === null ? null : 'indice',
    mano,
    esquinas: [],
    recorte: '',
    forma: null,
    aspecto: null,
    punta: null,
    forma_fiable: false,
    contorno: [],
    calidad: { brillo: 128, lado_origen: 400 },
    ...(clinico ? { clinico } : {}),
  }
}

function ok(clase: ClaseClinica): Extract<Clinico, { estado: 'ok' }> {
  return {
    estado: 'ok',
    motivo: null,
    clase,
    confianza: 0.9,
    alternativas: [
      { clase: 'onicolisis', nombre: 'Onicólisis', confianza: 0.05 },
      { clase: 'mancha_blanca', nombre: 'Mancha blanca', confianza: 0.02 },
    ],
    reporte: { nombre: 'n', descripcion: 'd', asociaciones: [], recomendacion: 'r' },
  }
}

function nc(motivo: MotivoClinico): Clinico {
  return { estado: 'no_concluyente', motivo, clase: null, confianza: null, alternativas: [], reporte: null }
}

const REPORTE_GENERICO = { nombre: 'Señal sin identificar', descripcion: 'd', asociaciones: [], recomendacion: 'r' }

function inespecifica(): Clinico {
  return { estado: 'senal_inespecifica', motivo: null, clase: null, confianza: null, alternativas: [], reporte: REPORTE_GENERICO, p_alguna_senal: 0.71 }
}

describe('clinicoDe', () => {
  it('sin `clinico` (servicio anterior) devuelve no concluyente por modelo_no_entrenado', () => {
    expect(clinicoDe(una(1))).toBe(CLINICO_NO_DISPONIBLE)
    expect(CLINICO_NO_DISPONIBLE).toMatchObject({ estado: 'no_concluyente', motivo: 'modelo_no_entrenado' })
  })

  it('con `clinico` lo devuelve tal cual', () => {
    const c = ok('linea_beau')
    expect(clinicoDe(una(1, c))).toBe(c)
  })

  // Simulan un servicio roto que dice `ok` sin los campos que la UI lee.
  it.each([
    ['sin reporte', { reporte: null }],
    ['sin clase', { clase: null }],
    ['con alternativas que no son lista', { alternativas: null }],
    ['con reporte sin asociaciones', { reporte: { nombre: 'n', descripcion: 'd', recomendacion: 'r' } }],
    ['con descripcion vacia', { reporte: { nombre: 'n', descripcion: '', asociaciones: [], recomendacion: 'r' } }],
    ['con una alternativa null', { alternativas: [null, { clase: 'linea_mees', nombre: 'x', confianza: 0.1 }] }],
    ['con una alternativa sin_senales', { alternativas: [{ clase: 'sin_senales', nombre: 'x', confianza: 0.1 }] }],
    ['con una alternativa otra', { alternativas: [{ clase: 'otra', nombre: 'x', confianza: 0.1 }] }],
    ['con la clase predicha como alternativa', { alternativas: [{ clase: 'linea_beau', nombre: 'x', confianza: 0.1 }] }],
  ])('un ok %s se trata como no concluyente por clasificacion_fallida', (_, rotura) => {
    const roto: Clinico = JSON.parse(JSON.stringify({ ...ok('linea_beau'), ...rotura }))
    expect(clinicoDe(una(1, roto))).toMatchObject({
      estado: 'no_concluyente',
      motivo: 'clasificacion_fallida',
      reporte: null,
      alternativas: [],
    })
  })

  it.each<ClaseClinica>(['linea_mees', 'acropaquia'])(
    'un ok de %s se devuelve como no concluyente sin clase, reporte ni alternativas',
    (clase) => {
      const c = clinicoDe(una(1, ok(clase)))
      expect(c).toEqual({ estado: 'no_concluyente', motivo: 'senal_no_mostrada', clase: null, confianza: null, alternativas: [], reporte: null })
      // Sin mensaje propio: cae en el genérico para no delatar que hubo una señal.
      expect(c.estado === 'no_concluyente' && mensajeMotivoClinico(c.motivo)).toBe(mensajeMotivoClinico('x'))
    },
  )

  it('quita linea_mees y acropaquia de las alternativas sin tocar el resto ni el original', () => {
    const c = ok('linea_beau')
    const original: AlternativaClinica[] = [
      { clase: 'acropaquia', nombre: 'a', confianza: 0.05 },
      { clase: 'mancha_blanca', nombre: 'Mancha blanca', confianza: 0.02 },
    ]
    const r = clinicoDe(una(1, { ...c, alternativas: original }))
    expect(r).toMatchObject({ estado: 'ok', clase: 'linea_beau', alternativas: [original[1]] })
    expect(original).toHaveLength(2)
  })

  it('senal_inespecifica se devuelve con su reporte y sin clase, motivo ni alternativas', () => {
    expect(clinicoDe(una(1, inespecifica()))).toEqual(inespecifica())
  })

  it('senal_inespecifica que cuela clase o alternativas (servicio roto) las pierde', () => {
    const colada: Clinico = JSON.parse(
      JSON.stringify({ ...inespecifica(), motivo: 'clase_no_fiable', clase: 'linea_beau', confianza: 0.4, alternativas: [{ clase: 'onicolisis', nombre: 'Onicólisis', confianza: 0.1 }] }),
    )
    expect(clinicoDe(una(1, colada))).toEqual(inespecifica())
  })

  it.each([
    ['sin reporte', { reporte: null }],
    ['con asociaciones (delatarian la señal)', { reporte: { ...REPORTE_GENERICO, asociaciones: ['Psoriasis'] } }],
    ['con nombre vacio', { reporte: { ...REPORTE_GENERICO, nombre: ' ' } }],
  ])('senal_inespecifica %s cae a clasificacion_fallida', (_, rotura) => {
    const roto: Clinico = JSON.parse(JSON.stringify({ ...inespecifica(), ...rotura }))
    expect(clinicoDe(una(1, roto))).toMatchObject({ estado: 'no_concluyente', motivo: 'clasificacion_fallida', reporte: null })
  })

  it('un ok roto cuenta como no concluyente en el resumen', () => {
    const roto: Clinico = JSON.parse(JSON.stringify({ ...ok('linea_beau'), reporte: null }))
    expect(resumenClinico([una(1, roto), una(1, ok('linea_oscura'))])).toEqual({
      disponible: true,
      manos: [{ mano: 1, total: 2, conSenal: 1, sinSenales: 0, noConcluyentes: 1 }],
    })
  })
})

describe('avisoClinicoDe', () => {
  it('usa el aviso recibido si tiene texto', () => {
    expect(avisoClinicoDe('Aviso del servicio')).toBe('Aviso del servicio')
  })

  it.each([undefined, null, '', '   ', 42])('con %j usa el aviso por defecto', (aviso) => {
    expect(avisoClinicoDe(aviso)).toBe(AVISO_CLINICO_POR_DEFECTO)
  })
})

describe('mensajeMotivoClinico', () => {
  const generico = mensajeMotivoClinico('motivo_que_no_existe')

  it.each<MotivoClinico>([
    'modelo_no_entrenado',
    'foto_insuficiente',
    'confianza_baja',
    'clase_otra',
    'clase_no_fiable',
    'clasificacion_fallida',
  ])('%s tiene un mensaje propio, distinto del genérico', (motivo) => {
    expect(mensajeMotivoClinico(motivo)).not.toBe(generico)
  })

  it('foto_insuficiente pide otra foto con más luz o más cerca', () => {
    expect(mensajeMotivoClinico('foto_insuficiente')).toMatch(/oscura/)
    expect(mensajeMotivoClinico('foto_insuficiente')).toMatch(/pequeña/)
    expect(mensajeMotivoClinico('foto_insuficiente')).toMatch(/otra foto/)
  })

  it('clase_no_fiable no nombra ninguna señal ni insinúa que la hubo', () => {
    const m = mensajeMotivoClinico('clase_no_fiable')
    expect(m).toMatch(/no podemos afirmar nada/i)
    expect(m).not.toMatch(/mees|acropaquia|señal/i)
  })

  it('un motivo desconocido cae al mensaje genérico', () => {
    expect(generico).toMatch(/no pudimos obtener un resultado concluyente/i)
  })
})

describe('resumenClinico', () => {
  it('una mano: 1 señal, 2 sin señales, 2 no concluyentes', () => {
    const r = resumenClinico([
      una(1, ok('linea_beau')),
      una(1, ok('sin_senales')),
      una(1, ok('sin_senales')),
      una(1, nc('confianza_baja')),
      una(1, nc('confianza_baja')),
    ])
    expect(r).toEqual({
      disponible: true,
      manos: [{ mano: 1, total: 5, conSenal: 1, sinSenales: 2, noConcluyentes: 2 }],
    })
  })

  it('dos manos se resumen por separado, en orden de aparición', () => {
    const r = resumenClinico([una(1, ok('linea_beau')), una(2, nc('clase_otra')), una(2, ok('sin_senales'))])
    expect(r).toEqual({
      disponible: true,
      manos: [
        { mano: 1, total: 1, conSenal: 1, sinSenales: 0, noConcluyentes: 0 },
        { mano: 2, total: 2, conSenal: 0, sinSenales: 1, noConcluyentes: 1 },
      ],
    })
  })

  it('primer_plano (mano null) se resume como un grupo con mano null', () => {
    expect(resumenClinico([una(null, ok('sin_senales'))])).toEqual({
      disponible: true,
      manos: [{ mano: null, total: 1, conSenal: 0, sinSenales: 1, noConcluyentes: 0 }],
    })
  })

  it('una clase oculta cuenta como no concluyente en el resumen', () => {
    expect(resumenClinico([una(1, ok('linea_mees')), una(1, ok('acropaquia'))])).toEqual({
      disponible: true,
      manos: [{ mano: 1, total: 2, conSenal: 0, sinSenales: 0, noConcluyentes: 2 }],
    })
  })

  it('senal_inespecifica cuenta como señal para consultar', () => {
    expect(resumenClinico([una(1, inespecifica()), una(1, nc('foto_insuficiente'))])).toEqual({
      disponible: true,
      manos: [{ mano: 1, total: 2, conSenal: 1, sinSenales: 0, noConcluyentes: 1 }],
    })
  })

  it('todas modelo_no_entrenado: no disponible', () => {
    expect(resumenClinico([una(1, nc('modelo_no_entrenado')), una(1, nc('modelo_no_entrenado'))])).toEqual({
      disponible: false,
    })
  })

  it('sin `clinico` en ninguna una (servicio anterior): no disponible', () => {
    expect(resumenClinico([una(1), una(1)])).toEqual({ disponible: false })
  })

  it('sin uñas: no disponible', () => {
    expect(resumenClinico([])).toEqual({ disponible: false })
  })

  it('un estado desconocido que llega por red cuenta como no concluyente', () => {
    // Simula un JSON del servicio con un estado que esta version no conoce.
    const raro = JSON.parse('{"estado":"pendiente","motivo":null,"clase":null,"confianza":null,"alternativas":[],"reporte":null}')
    const r = resumenClinico([una(1, raro), una(1, ok('linea_oscura'))])
    expect(r).toEqual({
      disponible: true,
      manos: [{ mano: 1, total: 2, conSenal: 1, sinSenales: 0, noConcluyentes: 1 }],
    })
  })
})
