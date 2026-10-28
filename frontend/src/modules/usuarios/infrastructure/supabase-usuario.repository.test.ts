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
