import type { AuthRepository } from '../domain/auth.repository'
import { registrar } from './registrar.usecase'

function repoFalso() {
  const registrarMock = vi.fn().mockResolvedValue({ usuario: null, sesionIniciada: false })
  const repo: AuthRepository = {
    registrar: registrarMock,
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
    refrescarSesion: vi.fn(),
    usuarioActual: vi.fn(),
    alCambiarSesion: vi.fn(),
  }
  return { repo, registrarMock }
}

const base = { email: 'ana@correo.cl', password: '12345678', nombre: 'Ana', telefono: '' }

describe('registrar: fecha de nacimiento', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('acepta registrarse sin cumpleaños', async () => {
    const { repo, registrarMock } = repoFalso()
    await registrar(repo, { ...base, fechaNacimiento: null })
    expect(registrarMock).toHaveBeenCalledWith(expect.objectContaining({ fechaNacimiento: null }))
  })

  it('envia la fecha ISO tal cual', async () => {
    const { repo, registrarMock } = repoFalso()
    await registrar(repo, { ...base, fechaNacimiento: '1990-03-04' })
    expect(registrarMock).toHaveBeenCalledWith(
      expect.objectContaining({ fechaNacimiento: '1990-03-04' }),
    )
  })

  it('rechaza una fecha futura, una anterior a 1920 y una que no existe', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    const { repo, registrarMock } = repoFalso()

    for (const fecha of ['2026-10-09', '1919-12-31', '1990-02-30']) {
      await expect(registrar(repo, { ...base, fechaNacimiento: fecha })).rejects.toThrow(
        'La fecha de nacimiento no es válida.',
      )
    }
    expect(registrarMock).not.toHaveBeenCalled()

    await registrar(repo, { ...base, fechaNacimiento: '2026-10-08' })
    expect(registrarMock).toHaveBeenCalledTimes(1)
  })
})
