import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '@/shared/infrastructure/supabase/client'
import type { AuthRepository } from '../domain/auth.repository'
import type {
  Credenciales,
  DatosRegistro,
  ResultadoRegistro,
  UsuarioAuth,
} from '../domain/auth.types'
import { META_NOMBRE, META_TELEFONO, toUsuarioAuth } from './auth.mapper'

/**
 * Traduce el error de Supabase a algo que se pueda mostrar en pantalla.
 *
 * Los mensajes vienen en ingles y algunos son crudos ("Invalid login
 * credentials"). Se traducen los que una persona puede provocar al usar la
 * aplicacion; para el resto se deja el original, que al menos dice algo, en
 * vez de un "error desconocido" que no ayuda a nadie.
 */
function mensajeDe(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'El correo o la contraseña no coinciden.'
    case 'email_not_confirmed':
      return 'Tu correo aún no está confirmado. Revisa el enlace que te enviamos.'
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya existe una cuenta con ese correo. Inicia sesión.'
    case 'weak_password':
      return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.'
    default:
      return error.message
  }
}

/** Implementacion de `AuthRepository` sobre Supabase Auth. */
export class SupabaseAuthRepository implements AuthRepository {
  async registrar(datos: DatosRegistro): Promise<ResultadoRegistro> {
    const { data, error } = await supabase.auth.signUp({
      email: datos.email,
      password: datos.password,
      options: {
        // Nombre y telefono no son columnas de `auth.users`. Van a
        // `user_metadata` mientras `perfiles` no este versionada.
        data: {
          [META_NOMBRE]: datos.nombre,
          [META_TELEFONO]: datos.telefono,
        },
      },
    })

    if (error) throw new Error(mensajeDe(error))

    return {
      usuario: data.user ? toUsuarioAuth(data.user) : null,
      // Con confirmacion de correo activada, Supabase crea el usuario pero
      // devuelve `session: null`. Quien llama necesita distinguirlo para no
      // dar por iniciada una sesion que no existe.
      sesionIniciada: data.session !== null,
    }
  }

  async iniciarSesion({ email, password }: Credenciales): Promise<UsuarioAuth> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) throw new Error(mensajeDe(error))

    // Defensivo: con `error` nulo Supabase siempre entrega usuario. Si eso
    // cambiara, es mejor un mensaje que un fallo al leer de null.
    if (!data.user) throw new Error('No pudimos iniciar tu sesión. Inténtalo de nuevo.')

    return toUsuarioAuth(data.user)
  }

  async cerrarSesion(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(mensajeDe(error))
  }

  async usuarioActual(): Promise<UsuarioAuth | null> {
    const { data, error } = await supabase.auth.getUser()

    // Sin sesion guardada esto responde con error, y es el caso normal de
    // cualquier visitante: se trata como "no hay nadie", no como un fallo.
    if (error || !data.user) return null

    return toUsuarioAuth(data.user)
  }

  alCambiarSesion(escucha: (usuario: UsuarioAuth | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_evento, session) => {
      escucha(session?.user ? toUsuarioAuth(session.user) : null)
    })

    return () => data.subscription.unsubscribe()
  }
}

/** Instancia lista para usar; la app no necesita mas de una. */
export const authRepository = new SupabaseAuthRepository()
