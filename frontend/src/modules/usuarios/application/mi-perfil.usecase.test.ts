import type { UsuarioRepository } from '../domain/usuario.repository'
import { actualizarMiPerfil } from './mi-perfil.usecase'

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
  return { repo, actualizarPropio }
}

const HOY = '2026-10-28'
const valido = { nombre: 'Ana Pérez', telefono: '9 1234 5678', fechaNacimiento: null }

describe('actualizarMiPerfil', () => {
  it.each([
    ['nombre vacio', { ...valido, nombre: '' }],
    ['nombre de 121 caracteres', { ...valido, nombre: 'a'.repeat(121) }],
    ['telefono invalido', { ...valido, telefono: '12345678' }],
  ])('con %s devuelve los errores y no llama a la base', async (_caso, borrador) => {
    const { repo, actualizarPropio } = repoFalso()
    const resultado = await actualizarMiPerfil(repo, borrador, HOY)
    expect(resultado.estado).toBe('invalido')
    expect(actualizarPropio).toHaveBeenCalledTimes(0)
  })

  it('con datos validos envia lo normalizado y devuelve lo guardado', async () => {
    const { repo, actualizarPropio } = repoFalso()
    const resultado = await actualizarMiPerfil(repo, { ...valido, nombre: ' Ana Pérez ' }, HOY)
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
    const { repo, actualizarPropio } = repoFalso()
    actualizarPropio.mockRejectedValue(new Error('Tu sesión expiró. Vuelve a iniciar sesión.'))
    await expect(actualizarMiPerfil(repo, valido, HOY)).rejects.toThrow('Tu sesión expiró.')
  })
})
