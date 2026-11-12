import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '@/shared/infrastructure/supabase/client'
import type { AuthRepository } from '../domain/auth.repository'
import type {
  Credenciales,
  DatosRegistro,
  ResultadoRegistro,
  UsuarioAuth,
} from '../domain/auth.types'
import { META_FECHA_NACIMIENTO, META_NOMBRE, META_TELEFONO, toUsuarioAuth } from './auth.mapper'

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
        /**
         * A donde lleva el enlace del correo de confirmacion.
         *
         * SIN ESTO, el enlace lo decidia `site_url` del proyecto, un valor fijo
         * que apuntaba a localhost: quien se registraba desde el sitio publico
         * recibia un enlace inservible.
         *
         * Se deriva de `window.location.origin` y no se escribe una URL fija,
         * asi que el mismo build sirve en el dominio, en las vistas previas de
         * Vercel y en desarrollo local.
         *
         * OJO: Supabase solo respeta este valor si coincide con la lista blanca
         * `additional_redirect_urls` del proyecto; si no, lo descarta y vuelve a
         * `site_url` SIN avisar. Las dos cosas se declaran en
         * `supabase/config.toml`, que es lo que mantiene el codigo y el
         * proyecto alineados.
         *
         * Va a /login porque es la pantalla que recibe a quien acaba de
         * confirmar; si la cuenta tiene panel, `SiYaTienePanel` la redirige.
         */
        emailRedirectTo: `${window.location.origin}/login`,
        // Nombre, telefono y cumpleaños no son columnas de `auth.users`. Van
        // a `user_metadata` mientras `perfiles` no este versionada.
        data: {
          [META_NOMBRE]: datos.nombre,
          [META_TELEFONO]: datos.telefono,
          [META_FECHA_NACIMIENTO]: datos.fechaNacimiento,
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

  async refrescarSesion(): Promise<void> {
    // No se devuelve el usuario: `onAuthStateChange` emite TOKEN_REFRESHED con
    // la sesion nueva, y esa suscripcion es la unica fuente de la sesion.
    const { error } = await supabase.auth.refreshSession()
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
