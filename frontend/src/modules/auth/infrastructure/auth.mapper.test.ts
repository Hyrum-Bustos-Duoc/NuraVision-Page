import type { User } from '@supabase/supabase-js'
import { META_FECHA_NACIMIENTO, toUsuarioAuth } from './auth.mapper'

function usuario(userMetadata: Record<string, unknown>): User {
  return {
    id: 'b1c2',
    aud: 'authenticated',
    email: 'ana@correo.cl',
    created_at: '2026-10-08T00:00:00Z',
    app_metadata: {},
    user_metadata: userMetadata,
  }
}

describe('toUsuarioAuth: fecha de nacimiento', () => {
  it('pasa una fecha ISO valida tal cual, sin convertirla a Date', () => {
    expect(toUsuarioAuth(usuario({ [META_FECHA_NACIMIENTO]: '1990-03-04' })).fechaNacimiento).toBe(
      '1990-03-04',
    )
  })

  it('es null cuando no se dio', () => {
    expect(toUsuarioAuth(usuario({})).fechaNacimiento).toBeNull()
    expect(toUsuarioAuth(usuario({ [META_FECHA_NACIMIENTO]: null })).fechaNacimiento).toBeNull()
    expect(toUsuarioAuth(usuario({ [META_FECHA_NACIMIENTO]: '  ' })).fechaNacimiento).toBeNull()
  })

  it('descarta lo que no es una fecha que exista', () => {
    for (const sucio of ['1990-02-30', '04/03/1990', '1990-03-04T00:00:00Z', 19900304, {}]) {
      expect(toUsuarioAuth(usuario({ [META_FECHA_NACIMIENTO]: sucio })).fechaNacimiento).toBeNull()
    }
  })

  it('no altera el resto de los campos', () => {
    expect(
      toUsuarioAuth(usuario({ nombre: 'Ana Pérez', telefono: '+56 9', [META_FECHA_NACIMIENTO]: '2000-01-01' })),
    ).toMatchObject({ nombre: 'Ana Pérez', telefono: '+56 9', fechaNacimiento: '2000-01-01' })
  })
})
