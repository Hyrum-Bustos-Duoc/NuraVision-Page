import { describe, expect, it, vi } from 'vitest'
import type { AuthRepository } from '../domain/auth.repository'
import { cambiarPassword, solicitarRecuperacion } from './recuperar-password.usecase'

function repoFalso() {
  const solicitar = vi.fn().mockResolvedValue(undefined)
  const cambiar = vi.fn().mockResolvedValue(undefined)
  const repo: AuthRepository = {
    registrar: vi.fn(),
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
    solicitarRecuperacion: solicitar,
    cambiarPassword: cambiar,
    alRecuperarPassword: vi.fn(),
    refrescarSesion: vi.fn(),
    usuarioActual: vi.fn(),
    alCambiarSesion: vi.fn(),
  }
  return { repo, solicitar, cambiar }
}

const DESTINO = 'https://nuraestudio.cl/restablecer-contrasena'

describe('solicitarRecuperacion', () => {
  it('pide el correo con el destino que le dan', async () => {
    const { repo, solicitar } = repoFalso()
    await solicitarRecuperacion(repo, 'ana@correo.cl', DESTINO)
    expect(solicitar).toHaveBeenCalledWith('ana@correo.cl', DESTINO)
  })

  // El correo se normaliza antes de salir: con mayusculas o espacios es la
  // misma cuenta, y mandarlo tal cual dependeria de como lo trate el proveedor.
  it('normaliza el correo', async () => {
    const { repo, solicitar } = repoFalso()
    await solicitarRecuperacion(repo, '  Ana@Correo.CL ', DESTINO)
    expect(solicitar).toHaveBeenCalledWith('ana@correo.cl', DESTINO)
  })

  it('no sale a la red con un correo mal escrito', async () => {
    const { repo, solicitar } = repoFalso()
    await expect(solicitarRecuperacion(repo, 'ana', DESTINO)).rejects.toThrow(
      'El formato del correo no es válido.',
    )
    expect(solicitar).not.toHaveBeenCalled()
  })

  it('no sale a la red con el correo vacio', async () => {
    const { repo, solicitar } = repoFalso()
    await expect(solicitarRecuperacion(repo, '  ', DESTINO)).rejects.toThrow(
      'Escribe tu correo electrónico.',
    )
    expect(solicitar).not.toHaveBeenCalled()
  })

  /**
   * No se distingue si la cuenta existe.
   *
   * El caso de uso no tiene forma de saberlo —el repositorio no lo cuenta— y
   * esa es justamente la propiedad que protege: una respuesta distinta
   * convertiria la pantalla en un detector de correos registrados.
   */
  it('termina igual exista o no la cuenta', async () => {
    const { repo } = repoFalso()
    await expect(solicitarRecuperacion(repo, 'nadie@correo.cl', DESTINO)).resolves.toBeUndefined()
  })
})

describe('cambiarPassword', () => {
  const buena = 'contrasena-larga'

  it('guarda la contraseña cuando las dos coinciden', async () => {
    const { repo, cambiar } = repoFalso()
    await cambiarPassword(repo, buena, buena)
    expect(cambiar).toHaveBeenCalledWith(buena)
  })

  it('no sale a la red si no coinciden', async () => {
    const { repo, cambiar } = repoFalso()
    await expect(cambiarPassword(repo, buena, 'otra-cosa-larga')).rejects.toThrow(
      'Las dos contraseñas no coinciden.',
    )
    expect(cambiar).not.toHaveBeenCalled()
  })

  it('no sale a la red si es demasiado corta', async () => {
    const { repo, cambiar } = repoFalso()
    await expect(cambiarPassword(repo, '123', '123')).rejects.toThrow('al menos 8 caracteres')
    expect(cambiar).not.toHaveBeenCalled()
  })

  // Solo se manda la contraseña: la confirmacion es cosa del formulario y el
  // proveedor no sabria que hacer con ella.
  it('manda solo la contraseña, no la confirmacion', async () => {
    const { repo, cambiar } = repoFalso()
    await cambiarPassword(repo, buena, buena)
    expect(cambiar).toHaveBeenCalledWith(buena)
    expect(cambiar.mock.calls[0]).toHaveLength(1)
  })
})
