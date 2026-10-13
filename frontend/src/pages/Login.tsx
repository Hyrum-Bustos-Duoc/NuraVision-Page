import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { rutaDeRetorno, rutaTrasIniciarSesion } from '@/modules/auth/ui/ruta-inicial'
import { AppImage, Button } from '@/shared/ui/ui'
import { useContenido } from '@/modules/contenido/ui/useContenido'

export default function Login() {
  const { contenido } = useContenido()
  const { signInWithPassword } = useAuth()
  const navigate = useNavigate()
  // A donde volver tras entrar (por ejemplo, el checkout). Validado: solo rutas
  // internas, ver rutaDeRetorno.
  const [params] = useSearchParams()
  const volver = rutaDeRetorno(params.get('volver'))
  // Sin valores de ejemplo: este formulario ya no simula una sesión, entra de
  // verdad contra Supabase y una credencial inventada solo daría un error.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function iniciarSesion() {
    setEntrando(true)
    setError(null)
    try {
      const usuario = await signInWithPassword({ email, password })
      // El destino se decide con el usuario que devuelve la propia llamada, no
      // con el del contexto: ese se actualiza en el render siguiente y aquí
      // todavía sería el anterior.
      //
      // Antes esto mandaba a todo el mundo a '/mis-reservas', así que una
      // profesional entraba con sus credenciales correctas y aterrizaba en la
      // vista de clienta.
      navigate(rutaTrasIniciarSesion(usuario, volver), { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No pudimos iniciar tu sesión.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-ivory md:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-20">
        <Link to="/" className="mb-10 flex items-center gap-2 text-sm text-muted hover:text-ink">
          ← Volver al inicio
        </Link>

        <h1 className="font-serif-display text-4xl text-ink">Bienvenida de vuelta</h1>
        <p className="mt-3 text-sm text-muted">Ingresa para gestionar tus reservas y tu análisis.</p>

        <form
          className="mt-8 max-w-sm space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void iniciarSesion()
          }}
        >
          <div>
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Correo electrónico
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Contraseña
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-ink">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-line"
              />
              Recordarme
            </label>
            <button type="button" className="text-muted underline decoration-line underline-offset-4">
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <Button type="submit" full disabled={entrando}>
            {entrando ? 'Entrando…' : 'Iniciar sesión'}
          </Button>

          {error && (
            <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}

          <p className="text-center text-sm text-muted">
            ¿No tienes cuenta?{' '}
            <Link
              to={volver ? `/registro?volver=${encodeURIComponent(volver)}` : '/registro'}
              className="font-medium text-ink underline underline-offset-4">
              Regístrate
            </Link>
          </p>
        </form>
      </div>

      {/* Fijo al alto de la pantalla: la columna del formulario es mas alta que
          ella, y estirado a toda la pagina el panel recortaba la foto y dejaba
          el testimonio fuera de la vista. */}
      <div className="relative hidden md:sticky md:top-0 md:block md:h-screen">
        <AppImage
          src={contenido.imagenes.login ?? undefined}
          alt=""
          className="h-full w-full"
          imageClassName="object-[50%_70%]"
        />
        <div className="absolute bottom-10 left-10 max-w-xs rounded-xl border border-line-soft bg-paper p-5 shadow-sm">
          <p className="font-serif-display text-xl italic leading-snug text-ink">{contenido.login.cita}</p>
          <p className="mt-3 text-xs text-muted">{contenido.login.firma}</p>
        </div>
      </div>
    </div>
  )
}
