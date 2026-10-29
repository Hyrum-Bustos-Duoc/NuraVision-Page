import {
  SesionExpiradaError,
  type BorradorPendiente,
  type BorradorPerfilAlmacen,
  type UsuarioRepository,
} from '../domain/usuario.repository'
import { actualizarMiPerfil, recuperarBorradorPerfil } from './mi-perfil.usecase'

/** Almacen en memoria: lo que se prueba es la decision, no el sessionStorage. */
function almacenFalso(inicial: BorradorPendiente | null = null) {
  let guardado = inicial
  const almacen: BorradorPerfilAlmacen = {
    leer: () => guardado,
    recordar: (p) => {
      guardado = p
    },
    olvidar: () => {
      guardado = null
    },
  }
  return { almacen, actual: () => guardado }
}

function repoFalso() {
  const actualizarPropio = vi.fn<UsuarioRepository['actualizarPropio']>().mockResolvedValue({
    nombre: 'Ana Pérez',
    telefono: '+56912345678',
    fechaNacimiento: null,
  })
  const repo: UsuarioRepository = {
    listar: vi.fn(),
    actualizar: vi.fn(),
    eliminarPerfil: vi.fn(),
    obtenerPropio: vi.fn(),
    actualizarPropio,
  }
  const { almacen, actual } = almacenFalso()
  return { deps: { repo, borradores: almacen }, actualizarPropio, borradorGuardado: actual }
}

const HOY = '2026-10-28'
const valido = { nombre: 'Ana Pérez', telefono: '9 1234 5678', fechaNacimiento: null }

describe('actualizarMiPerfil', () => {
  it.each([
    ['nombre vacio', { ...valido, nombre: '' }],
    ['nombre de 121 caracteres', { ...valido, nombre: 'a'.repeat(121) }],
    ['telefono invalido', { ...valido, telefono: '12345678' }],
  ])('con %s devuelve los errores y no llama a la base', async (_caso, borrador) => {
    const { deps, actualizarPropio } = repoFalso()
    const resultado = await actualizarMiPerfil(deps, 'u1', borrador, HOY)
    expect(resultado.estado).toBe('invalido')
    expect(actualizarPropio).toHaveBeenCalledTimes(0)
  })

  it('con datos validos envia lo normalizado y devuelve lo guardado', async () => {
    const { deps, actualizarPropio } = repoFalso()
    const resultado = await actualizarMiPerfil(deps, 'u1', { ...valido, nombre: ' Ana Pérez ' }, HOY)
    expect(actualizarPropio).toHaveBeenCalledTimes(1)
    expect(actualizarPropio).toHaveBeenCalledWith({
      nombre: 'Ana Pérez',
      telefono: '+56912345678',
      fechaNacimiento: null,
    })
    expect(resultado).toEqual({
      estado: 'guardado',
      datos: { nombre: 'Ana Pérez', telefono: '+56912345678', fechaNacimiento: null },
    })
  })

  it('un rechazo de la base sale como excepcion con su mensaje', async () => {
    const { deps, actualizarPropio, borradorGuardado } = repoFalso()
    actualizarPropio.mockRejectedValue(new Error('El teléfono debe ser un número chileno de 9 dígitos.'))
    await expect(actualizarMiPerfil(deps, 'u1', valido, HOY)).rejects.toThrow('El teléfono debe')
    // La pantalla sigue montada y conserva lo escrito: no hace falta guardarlo aparte.
    expect(borradorGuardado()).toBeNull()
  })

  it('con la sesion expirada conserva lo escrito, sin normalizar, con la cuenta que lo escribio', async () => {
    const { deps, actualizarPropio, borradorGuardado } = repoFalso()
    actualizarPropio.mockRejectedValue(new SesionExpiradaError())
    await expect(actualizarMiPerfil(deps, 'u1', valido, HOY)).rejects.toBeInstanceOf(SesionExpiradaError)
    expect(borradorGuardado()).toEqual({ usuarioId: 'u1', borrador: valido })
  })

  it('tras guardar con exito olvida el borrador pendiente', async () => {
    const { deps, borradorGuardado } = repoFalso()
    deps.borradores.recordar({ usuarioId: 'u1', borrador: valido })
    await actualizarMiPerfil(deps, 'u1', valido, HOY)
    expect(borradorGuardado()).toBeNull()
  })
})

describe('recuperarBorradorPerfil', () => {
  const pendiente = { usuarioId: 'u1', borrador: { nombre: 'Beatriz', telefono: '9 8765 4321', fechaNacimiento: null } }

  it('sin borrador devuelve null', () => {
    expect(recuperarBorradorPerfil(almacenFalso().almacen, 'u1')).toBeNull()
  })

  it('devuelve el borrador de la misma cuenta sin borrarlo (sigue sin guardar)', () => {
    const { almacen, actual } = almacenFalso(pendiente)
    expect(recuperarBorradorPerfil(almacen, 'u1')).toEqual(pendiente.borrador)
    expect(actual()).toEqual(pendiente)
  })

  it('el borrador de otra cuenta no se devuelve y se borra', () => {
    const { almacen, actual } = almacenFalso(pendiente)
    expect(recuperarBorradorPerfil(almacen, 'otra-cuenta')).toBeNull()
    expect(actual()).toBeNull()
  })
})
