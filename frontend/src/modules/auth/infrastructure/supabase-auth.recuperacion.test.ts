import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authRepository } from './supabase-auth.repository'

const resetPasswordForEmail = vi.fn()
const updateUser = vi.fn()
const onAuthStateChange = vi.fn()

vi.mock('@/shared/infrastructure/supabase/client', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (email: string, opciones: unknown) =>
        resetPasswordForEmail(email, opciones),
      updateUser: (datos: unknown) => updateUser(datos),
      onAuthStateChange: (cb: (evento: string, sesion: unknown) => void) =>
        onAuthStateChange(cb),
    },
  },
}))

const DESTINO = 'https://nuraestudio.cl/restablecer-contrasena'

describe('solicitarRecuperacion', () => {
  beforeEach(() => resetPasswordForEmail.mockReset())

  /**
   * El `redirectTo` es el corazon del arreglo: tiene que llegar al proveedor
   * tal cual, con el origen real. Si se perdiera, Supabase usaria `site_url` y
   * el enlace volveria a llevar a donde no es.
   */
  it('manda el correo y el destino que recibe', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })
    await authRepository.solicitarRecuperacion('ana@correo.cl', DESTINO)
    expect(resetPasswordForEmail).toHaveBeenCalledWith('ana@correo.cl', {
      redirectTo: DESTINO,
    })
  })

  it('traduce el limite de envios en vez de soltar el texto del proveedor', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'For security purposes…' },
    })
    await expect(authRepository.solicitarRecuperacion('ana@correo.cl', DESTINO)).rejects.toThrow(
      'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.',
    )
  })
})

describe('cambiarPassword', () => {
  beforeEach(() => updateUser.mockReset())

  it('actualiza la contraseña del usuario de la sesion', async () => {
    updateUser.mockResolvedValue({ error: null })
    await authRepository.cambiarPassword('contrasena-nueva')
    expect(updateUser).toHaveBeenCalledWith({ password: 'contrasena-nueva' })
  })

  it('explica que la contraseña es la misma de antes', async () => {
    updateUser.mockResolvedValue({
      error: { code: 'same_password', message: 'New password should be different…' },
    })
    await expect(authRepository.cambiarPassword('la-de-siempre')).rejects.toThrow(
      'Esa es la contraseña que ya tenías. Escribe una distinta.',
    )
  })

  it('explica que la contraseña es debil', async () => {
    updateUser.mockResolvedValue({ error: { code: 'weak_password', message: 'Password is weak' } })
    await expect(authRepository.cambiarPassword('abc')).rejects.toThrow('demasiado débil')
  })
})

describe('alRecuperarPassword', () => {
  beforeEach(() => onAuthStateChange.mockReset())

  function suscribir() {
    const unsubscribe = vi.fn()
    let emitir: (evento: string, sesion: unknown) => void = () => {}
    onAuthStateChange.mockImplementation((cb: (evento: string, sesion: unknown) => void) => {
      emitir = cb
      return { data: { subscription: { unsubscribe } } }
    })
    const escucha = vi.fn()
    const cancelar = authRepository.alRecuperarPassword(escucha)
    return { escucha, cancelar, unsubscribe, emitir: (e: string) => emitir(e, null) }
  }

  it('avisa solo con PASSWORD_RECOVERY', () => {
    const { escucha, emitir } = suscribir()

    // Los demas eventos llegan todo el rato —al arrancar, al refrescar el
    // token— y tratarlos como recuperacion mostraria el formulario a quien
    // simplemente tiene sesion abierta.
    emitir('INITIAL_SESSION')
    emitir('SIGNED_IN')
    emitir('TOKEN_REFRESHED')
    expect(escucha).not.toHaveBeenCalled()

    emitir('PASSWORD_RECOVERY')
    expect(escucha).toHaveBeenCalledTimes(1)
  })

  it('devuelve una funcion que cancela la suscripcion', () => {
    const { cancelar, unsubscribe } = suscribir()
    cancelar()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
