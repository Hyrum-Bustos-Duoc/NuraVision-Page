import { CONTENIDO_POR_DEFECTO } from './contenido.defecto'
import {
  contenidoDesdeGuardado,
  crearFiltroImagenes,
  esCorreoSimple,
  fragmentosConEnfasis,
  MAX_FOTOS_CARRUSEL,
  mezclarContenido,
  motivoParaNoGuardarContenido,
} from './contenido.reglas'

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

describe('fotos y correo', () => {
  const permitida = crearFiltroImagenes('https://abc.supabase.co/')

  it('acepta el bucket y Unsplash, y descarta otros origenes', () => {
    const bucket = 'https://abc.supabase.co/storage/v1/object/public/contenido/login-1.jpg'
    const c = contenidoDesdeGuardado(
      CONTENIDO_POR_DEFECTO,
      { imagenes: { login: bucket, bandaIA: 'https://rastreo.example/p.gif' } },
      permitida,
    )
    expect(c.imagenes.login).toBe(bucket)
    expect(c.imagenes.bandaIA).toBe(CONTENIDO_POR_DEFECTO.imagenes.bandaIA)
    expect(contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, { imagenes: { login: null } }, permitida).imagenes.login).toBeNull()
    expect(permitida('https://images.unsplash.com/photo-1')).toBe(true)
    expect(permitida('data:image/png;base64,xx')).toBe(false)
  })

  it('acepta rutas locales del carrusel y rechaza las que salen de el', () => {
    expect(permitida('/carrusel/inicio/inicio-01.jpg')).toBe(true)
    expect(permitida('//evil.com/x.jpg')).toBe(false)
    expect(permitida('/carrusel/../x.jpg')).toBe(false)
    expect(permitida('/carrusel/../x')).toBe(false)
    expect(permitida('/carrusel/%2e%2e/x.jpg')).toBe(false)
    expect(permitida('/carrusel//evil.com/x.jpg')).toBe(false)
    expect(permitida('javascript:alert(1)//carrusel/x.jpg')).toBe(false)
    expect(permitida('/otra/x.jpg')).toBe(false)
  })

  it('rechaza URLs del bucket que se resuelven fuera de el', () => {
    const base = 'https://abc.supabase.co/storage/v1/object/public/contenido/'
    expect(permitida(`${base}carrusel-estudio-1.jpg`)).toBe(true)
    expect(permitida('https://images.unsplash.com/photo-1?w=800&q=80')).toBe(true)
    expect(permitida(`${base}../otro/x.jpg`)).toBe(false)
    expect(permitida(`${base}./../otro/x.jpg`)).toBe(false)
    expect(permitida(`${base}%2e%2e/otro/x.jpg`)).toBe(false)
    expect(permitida(`${base}%2E%2E/otro/x.jpg`)).toBe(false)
    expect(permitida(`${base}.%2e/otro/x.jpg`)).toBe(false)
    expect(permitida(`${base}.\t./otro/x.jpg`)).toBe(false)
    expect(permitida(`${base}..\\otro\\x.jpg`)).toBe(false)
    expect(permitida(`${base}x%2f..%2f..%2fotro.jpg`)).toBe(false)
    expect(permitida(`${base}x%5c..%5cotro.jpg`)).toBe(false)
    expect(permitida(`${base}`.replace('https://', 'https://user@'))).toBe(false)
  })

  it('valida un correo sin parametros', () => {
    expect(esCorreoSimple('hola@estudionura.cl')).toBe(true)
    expect(esCorreoSimple('hola@estudionura.cl?bcc=otro@x.com')).toBe(false)
  })
})

describe('carruseles', () => {
  const permitida = crearFiltroImagenes('https://abc.supabase.co/')
  const bucket = 'https://abc.supabase.co/storage/v1/object/public/contenido/carrusel-estudio-1.jpg'
  const leer = (carruseles: unknown) => contenidoDesdeGuardado(CONTENIDO_POR_DEFECTO, { carruseles }, permitida).carruseles

  it('sin nada guardado usa las fotos locales del sitio', () => {
    expect(leer(undefined)).toEqual(CONTENIDO_POR_DEFECTO.carruseles)
    expect(CONTENIDO_POR_DEFECTO.carruseles.estudio[0]).toBe('/carrusel/inicio/inicio-01.jpg')
    expect(CONTENIDO_POR_DEFECTO.carruseles.tienda).toHaveLength(22)
    expect([...CONTENIDO_POR_DEFECTO.carruseles.estudio, ...CONTENIDO_POR_DEFECTO.carruseles.tienda].every(permitida)).toBe(true)
  })

  it('respeta una lista guardada valida y su orden', () => {
    const estudio = [bucket, '/carrusel/inicio/inicio-03.jpg']
    expect(leer({ estudio }).estudio).toEqual(estudio)
    expect(leer({ estudio }).tienda).toEqual(CONTENIDO_POR_DEFECTO.carruseles.tienda)
  })

  it('descarta URL externas, rutas que escapan y valores que no son texto', () => {
    expect(
      leer({ tienda: ['https://rastreo.example/p.gif', bucket, '//evil.com/x.jpg', '/carrusel/../x', 42, null] }).tienda,
    ).toEqual([bucket])
  })

  it('respeta una lista vacia guardada', () => {
    expect(leer({ estudio: [] }).estudio).toEqual([])
  })

  it('un carrusel que no es lista vuelve al original', () => {
    expect(leer({ estudio: 'x' }).estudio).toEqual(CONTENIDO_POR_DEFECTO.carruseles.estudio)
  })

  it('no deja guardar mas fotos del tope', () => {
    const base = structuredClone(CONTENIDO_POR_DEFECTO)
    const muchas = Array(MAX_FOTOS_CARRUSEL + 1).fill(bucket)
    expect(motivoParaNoGuardarContenido({ ...base, carruseles: { ...base.carruseles, tienda: muchas } })).not.toBeNull()
    expect(
      motivoParaNoGuardarContenido({ ...base, carruseles: { ...base.carruseles, tienda: muchas.slice(1) } }),
    ).toBeNull()
  })
})

describe('filtro de origenes: rutas hostiles en carruseles', () => {
  const permitida = crearFiltroImagenes('https://abc.supabase.co/')

  it.each([
    ['backslash como separador', '/carrusel\\..\\x.jpg'],
    ['backslash que el navegador lee como //', '/\\evil.com/carrusel/x.jpg'],
    ['espacio en el nombre', '/carrusel/a b.jpg'],
    ['espacio al inicio', ' /carrusel/x.jpg'],
    ['salto de linea al final', '/carrusel/x.jpg\n'],
    ['tabulador dentro', '/carrusel/\tx.jpg'],
    ['punto simple como segmento', '/carrusel/./x.jpg'],
    ['%2F codificado', '/carrusel/..%2Fx.jpg'],
    ['%2e en mayusculas', '/carrusel/%2E%2E/x.jpg'],
    ['doble codificacion', '/carrusel/%252e%252e/x.jpg'],
    ['parametro de consulta', '/carrusel/x.jpg?u=https://evil.com'],
    ['fragmento', '/carrusel/x.jpg#x'],
    ['extension no imagen', '/carrusel/x.svg'],
    ['doble extension', '/carrusel/x.jpg.html'],
    ['sin extension', '/carrusel/x'],
    ['digitos unicode de ancho completo', '/carrusel/ｘ.jpg'],
    ['esquema javascript', 'javascript:/carrusel/x.jpg'],
    ['esquema data', 'data:/carrusel/x.jpg'],
    ['carpeta vacia', '/carrusel//x.jpg'],
    ['prefijo parecido', '/carruselx/x.jpg'],
  ])('rechaza %s', (_, url) => {
    expect(permitida(url)).toBe(false)
  })

  it('las mayusculas no salen del sitio: /CARRUSEL/ sigue siendo una ruta propia', () => {
    // La regex lleva /i: se acepta, pero es mismo origen y a lo sumo da 404.
    expect(permitida('/CARRUSEL/INICIO/X.JPG')).toBe(true)
  })
})
