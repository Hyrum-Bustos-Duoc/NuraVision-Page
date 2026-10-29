import { SesionExpiradaError } from '../domain/usuario.repository'
import { usuarioRepository } from './supabase-usuario.repository'

const rpc = vi.fn()
const eq = vi.fn()

vi.mock('@/shared/infrastructure/supabase/client', () => ({
  supabase: {
    rpc: (nombre: string, args: unknown) => rpc(nombre, args),
    from: () => ({ select: () => ({ eq: (columna: string, valor: string) => eq(columna, valor) }) }),
  },
}))

const DATOS = { nombre: 'Ana Pérez', telefono: '', fechaNacimiento: null }

describe('actualizarPropio', () => {
  beforeEach(() => rpc.mockReset())

  it('llama a actualizar_mi_perfil con los tres argumentos, la fecha null incluida', async () => {
    rpc.mockResolvedValue({ data: [{ nombre: 'Ana Pérez', telefono: '', fecha_nacimiento: null }], error: null })
    const guardado = await usuarioRepository.actualizarPropio(DATOS)
    expect(rpc).toHaveBeenCalledWith('actualizar_mi_perfil', {
      p_nombre: 'Ana Pérez',
      p_telefono: '',
      p_fecha_nacimiento: null,
    })
    expect(guardado).toEqual({ nombre: 'Ana Pérez', telefono: null, fechaNacimiento: null })
  })

  it('arreglo vacio es un error, no un exito', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await expect(usuarioRepository.actualizarPropio(DATOS)).rejects.toThrow('La base no confirmó el cambio.')
  })

  it('P0001 muestra el mensaje de la base tal cual', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'El teléfono debe ser un número chileno de 9 dígitos.' },
    })
    await expect(usuarioRepository.actualizarPropio(DATOS)).rejects.toThrow(
      /^El teléfono debe ser un número chileno de 9 dígitos\.$/,
    )
  })

  it.each([
    ['401 (la llamada salio con la anon key)', { data: null, status: 401, error: { code: '42501', message: 'permission denied for function actualizar_mi_perfil' } }],
    ['P0001 de auth.uid() null', { data: null, status: 400, error: { code: 'P0001', message: 'Tu sesión expiró. Vuelve a iniciar sesión.' } }],
  ])('%s es SesionExpiradaError', async (_caso, respuesta) => {
    rpc.mockResolvedValue(respuesta)
    await expect(usuarioRepository.actualizarPropio(DATOS)).rejects.toBeInstanceOf(SesionExpiradaError)
  })

  it('un 403 (sesion valida sin permiso) no se confunde con sesion expirada', async () => {
    rpc.mockResolvedValue({ data: null, status: 403, error: { code: '42501', message: 'permission denied' } })
    const rechazo = usuarioRepository.actualizarPropio(DATOS)
    await expect(rechazo).rejects.not.toBeInstanceOf(SesionExpiradaError)
    await expect(rechazo).rejects.toThrow(/^No pudimos guardar tus datos\. Inténtalo de nuevo\.$/)
  })

  it('cualquier otro error muestra el generico', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(usuarioRepository.actualizarPropio(DATOS)).rejects.toThrow(
      /^No pudimos guardar tus datos\. Inténtalo de nuevo\.$/,
    )
  })
})

describe('obtenerPropio', () => {
  beforeEach(() => eq.mockReset())

  it('sin fila: «No encontramos tu perfil»', async () => {
    eq.mockResolvedValue({ data: [], error: null })
    await expect(usuarioRepository.obtenerPropio('u1')).rejects.toThrow(
      'No encontramos tu perfil. Escríbenos para revisarlo.',
    )
    expect(eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('un error de lectura da un mensaje para reintentar', async () => {
    eq.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })
    await expect(usuarioRepository.obtenerPropio('u1')).rejects.toThrow('No pudimos cargar tu perfil.')
  })
})
