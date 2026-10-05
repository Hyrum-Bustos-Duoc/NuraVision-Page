import { CONTENIDO_POR_DEFECTO } from './contenido.defecto'
import { contenidoDesdeGuardado, fragmentosConEnfasis, mezclarContenido, motivoParaNoGuardarContenido } from './contenido.reglas'

describe('contenidoDesdeGuardado', () => {
  it('sin nada guardado devuelve el contenido original', () => {
    expect(contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, {})).toEqual(CONTENIDO_POR_DEFECTO)
    expect(contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, null)).toEqual(CONTENIDO_POR_DEFECTO)
  })

  it('respeta lo guardado y completa lo que falta', () => {
    const c = contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, {
      portada: { titulo: 'Hola *mundo*' },
      anuncios: ['Solo uno'],
    })
    expect(c.portada.titulo).toBe('Hola *mundo*')
    expect(c.portada.descripcion).toBe(CONTENIDO_POR_DEFECTO.portada.descripcion)
    expect(c.anuncios).toEqual(['Solo uno'])
    expect(c.footer).toEqual(CONTENIDO_POR_DEFECTO.footer)
  })

  it('ignora valores con otro tipo', () => {
    const c = contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, { portada: { titulo: 42 }, anuncios: 'texto' })
    expect(c.portada.titulo).toBe(CONTENIDO_POR_DEFECTO.portada.titulo)
    expect(c.anuncios).toEqual(CONTENIDO_POR_DEFECTO.anuncios)
  })

  it('acepta una imagen guardada y vuelve a null si se borra', () => {
    expect(contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, { imagenes: { login: 'https://x/y.jpg' } }).imagenes.login).toBe(
      'https://x/y.jpg',
    )
    expect(mezclarContenido<string | null>(null, 'https://x')).toBe('https://x')
    expect(mezclarContenido<string | null>(null, 5)).toBeNull()
  })

  it('en el analisis solo acepta ids conocidos', () => {
    const c = contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, {
      analisis: { manos: { label: 'Uñas' }, inventado: { label: 'X' } },
    })
    expect(c.analisis.manos.label).toBe('Uñas')
    expect(c.analisis.manos.tips).toEqual(CONTENIDO_POR_DEFECTO.analisis.manos.tips)
    expect(c.analisis).not.toHaveProperty('inventado')
  })
})

describe('fragmentosConEnfasis', () => {
  it('marca lo que va entre asteriscos', () => {
    expect(fragmentosConEnfasis('Belleza, *cuidado* en casa')).toEqual([
      { texto: 'Belleza, ', enfasis: false, salto: false },
      { texto: 'cuidado', enfasis: true, salto: false },
      { texto: ' en casa', enfasis: false, salto: false },
    ])
  })

  it('conserva los saltos de linea', () => {
    expect(fragmentosConEnfasis('Una foto.\nTu rutina *completa*.')).toEqual([
      { texto: 'Una foto.', enfasis: false, salto: false },
      { texto: 'Tu rutina ', enfasis: false, salto: true },
      { texto: 'completa', enfasis: true, salto: false },
      { texto: '.', enfasis: false, salto: false },
    ])
  })

  it('muestra tal cual un asterisco sin pareja', () => {
    expect(fragmentosConEnfasis('5* estrellas')).toEqual([{ texto: '5* estrellas', enfasis: false, salto: false }])
  })
})

describe('motivoParaNoGuardarContenido', () => {
  it('acepta el contenido original', () => {
    expect(motivoParaNoGuardarContenido(CONTENIDO_POR_DEFECTO)).toBeNull()
  })

  it('rechaza un titulo vacio o demasiados anuncios', () => {
    const base = structuredClone(CONTENIDO_POR_DEFECTO)
    expect(motivoParaNoGuardarContenido({ ...base, portada: { ...base.portada, titulo: ' ' } })).not.toBeNull()
    expect(motivoParaNoGuardarContenido({ ...base, anuncios: Array(11).fill('x') })).not.toBeNull()
  })
})
