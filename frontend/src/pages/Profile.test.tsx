// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { UsuarioRepository } from '@/modules/usuarios/domain/usuario.repository'
import type { PerfilRow } from '@/modules/usuarios/infrastructure/usuario.mapper'
import { toPerfilPropio } from '@/modules/usuarios/infrastructure/usuario.mapper'
import { ToastProvider } from '@/shared/state/Toast'
import Profile from './Profile'

/**
 * Ramas de «Mi perfil» que el e2e no toca: la ref contra dos envios en el mismo
 * tick, el refresco de sesion que falla tras guardar, un rechazo que no es
 * Error y los datos heredados de la fila (telefono sin formato, nombre vacio).
 * El repositorio es un doble: lo que se prueba es la pantalla, no la red.
 */

const obtenerPropio = vi.fn<UsuarioRepository['obtenerPropio']>()
const actualizarPropio = vi.fn<UsuarioRepository['actualizarPropio']>()
const refrescarSesion = vi.fn<() => Promise<void>>()

vi.mock('@/shared/infrastructure/supabase/client', () => ({ supabase: {} }))
vi.mock('@/modules/usuarios/infrastructure/supabase-usuario.repository', () => ({
  usuarioRepository: {
    obtenerPropio: (id: string) => obtenerPropio(id),
    actualizarPropio: (d: Parameters<UsuarioRepository['actualizarPropio']>[0]) => actualizarPropio(d),
  },
}))
vi.mock('@/modules/auth/ui/useAuth', () => ({
  useAuth: () => ({
    usuario: { id: 'u1', email: 'ana@correo.cl' },
    cargando: false,
    refrescarSesion,
  }),
}))

const FILA: PerfilRow = {
  id: 'u1',
  nombre: 'Ana Pérez',
  email: 'ana@correo.cl',
  telefono: '+56912345678',
  rol: 'cliente',
  profesional_id: null,
  creado_en: '2026-01-01T00:00:00Z',
  fecha_nacimiento: null,
}

function montar(fila: Partial<PerfilRow> = {}) {
  obtenerPropio.mockResolvedValue(toPerfilPropio({ ...FILA, ...fila }))
  render(
    <MemoryRouter>
      <ToastProvider>
        <Profile />
      </ToastProvider>
    </MemoryRouter>,
  )
}

const campo = (nombre: string) => screen.findByLabelText(nombre, { exact: true })
const boton = () => screen.getByRole('button', { name: /Guardar cambios|Guardando/ })

beforeEach(() => {
  obtenerPropio.mockReset()
  actualizarPropio.mockReset()
  refrescarSesion.mockReset()
  actualizarPropio.mockResolvedValue({ nombre: 'Ana Pérez', telefono: '+56912345678', fechaNacimiento: null })
  refrescarSesion.mockResolvedValue()
})

describe('/perfil (componente)', () => {
  it('dos submit en el mismo tick, antes de que el disabled llegue al DOM, hacen 1 llamada', async () => {
    montar()
    await campo('Nombre y apellido')
    const form = boton().closest('form')
    if (!form) throw new Error('sin formulario')
    fireEvent.submit(form)
    fireEvent.submit(form)
    await screen.findByText('Perfil actualizado')
    expect(actualizarPropio).toHaveBeenCalledTimes(1)
  })

  it('si refrescar la sesion falla tras guardar, sigue siendo un exito', async () => {
    refrescarSesion.mockRejectedValue(new Error('refresh caido'))
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText('Perfil actualizado')
    expect(refrescarSesion).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(boton()).toBeEnabled()
  })

  it('un rechazo que no es Error muestra el mensaje generico y conserva lo escrito', async () => {
    actualizarPropio.mockRejectedValue('no-es-un-error')
    montar()
    const telefono = await campo('Teléfono')
    await userEvent.clear(telefono)
    await userEvent.type(telefono, '9 8765 4321')
    await userEvent.click(boton())
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tus datos. Inténtalo de nuevo.')
    expect(telefono).toHaveValue('9 8765 4321')
    expect(screen.queryByText('Perfil actualizado')).toBeNull()
  })

  it('el error de un intento fallido desaparece al guardar bien', async () => {
    actualizarPropio.mockRejectedValueOnce(new Error('La fecha de nacimiento no es válida.'))
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha de nacimiento no es válida.')
    await userEvent.click(boton())
    await screen.findByText('Perfil actualizado')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('telefono heredado sin formato: se muestra tal cual y se guarda canonico', async () => {
    montar({ telefono: '9 1234 5678' })
    expect(await campo('Teléfono')).toHaveValue('9 1234 5678')
    await userEvent.click(boton())
    await waitFor(() => expect(actualizarPropio).toHaveBeenCalledTimes(1))
    expect(actualizarPropio).toHaveBeenCalledWith({ nombre: 'Ana Pérez', telefono: '+56912345678', fechaNacimiento: null })
  })

  it('telefono heredado invalido bloquea el guardado hasta corregirlo o vaciarlo', async () => {
    montar({ telefono: '12345' })
    const telefono = await campo('Teléfono')
    await userEvent.click(boton())
    expect(telefono).toHaveAccessibleDescription('El teléfono debe ser un número chileno de 9 dígitos.')
    expect(telefono).toHaveFocus()
    expect(actualizarPropio).not.toHaveBeenCalled()

    await userEvent.clear(telefono)
    await userEvent.click(boton())
    await waitFor(() => expect(actualizarPropio).toHaveBeenCalledWith(expect.objectContaining({ telefono: '' })))
  })

  /**
   * Datos sucios: el 'Sin nombre' de `toUsuario` es relleno para listados. Si
   * llegara al campo, guardar sin tocarlo lo escribiria en `perfiles`.
   */
  it('una fila con nombre vacio no precarga el texto de relleno "Sin nombre"', async () => {
    montar({ nombre: '' })
    const nombre = await campo('Nombre y apellido')
    expect(nombre).toHaveValue('')

    await userEvent.click(boton())
    expect(nombre).toHaveAccessibleDescription('Necesitamos tu nombre.')
    expect(nombre).toHaveFocus()
    expect(actualizarPropio).not.toHaveBeenCalled()
  })
})
