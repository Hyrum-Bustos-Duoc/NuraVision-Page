import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { Button } from '@/shared/ui/ui'

export default function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [accepted, setAccepted] = useState(false)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [password, setPassword] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Cuenta creada pero sin sesion: el proyecto exige confirmar el correo.
   *
   * Es un caso que hay que mostrar, no ocultar. Redirigir como si hubiera
   * entrado dejaria a la persona navegando sin sesion y sin entender por que
   * "mis reservas" esta vacio.
   */
  const [faltaConfirmar, setFaltaConfirmar] = useState(false)

  async function crearCuenta() {
    setCreando(true)
    setError(null)
    try {
      const resultado = await signUp({
        email,
        password,
        // Apellido y nombre se guardan juntos: es como se muestra despues en
        // la reserva y en el saludo, y la base no los necesita separados.
        nombre: `${nombre.trim()} ${apellido.trim()}`.trim(),
        telefono,
      })

      if (resultado.sesionIniciada) navigate('/')
      else setFaltaConfirmar(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No pudimos crear tu cuenta.')
    } finally {
      setCreando(false)
    }
  }

  if (faltaConfirmar) {
    return (
      <div className="min-h-screen bg-ivory px-6 py-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-serif-display text-4xl text-ink">Revisa tu correo</h1>
          <p className="mt-3 text-sm text-muted">
            Creamos tu cuenta y enviamos un enlace de confirmación a{' '}
            <span className="text-ink">{email}</span>. Ábrelo para activarla y poder iniciar
            sesión.
          </p>
          <Link
            to="/login"
            className="mt-8 inline-block font-medium text-ink underline underline-offset-4"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ivory px-6 py-16">
      <div className="mx-auto max-w-xl">
        <Link to="/login" className="mb-10 flex items-center gap-2 text-sm text-muted hover:text-ink">
          ← Iniciar sesión
        </Link>

        <h1 className="font-serif-display text-4xl text-ink">Crea tu cuenta</h1>
        <p className="mt-3 text-sm text-muted">Reserva más rápido y guarda tu historial.</p>

        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void crearCuenta()
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre" value={nombre} onChange={setNombre} autoComplete="given-name" />
            <Field
              label="Apellido"
              value={apellido}
              onChange={setApellido}
              autoComplete="family-name"
            />
          </div>
          <Field
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <Field label="Teléfono" value={telefono} onChange={setTelefono} autoComplete="tel" />
          <div>
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            {/* Lo que exige Supabase por defecto es solo el largo mínimo; el
                resto son recomendaciones y no se validan. */}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>• Mínimo 8 caracteres</span>
              <span>• Una mayúscula</span>
              <span>• Un número</span>
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line"
            />
            Acepto los términos y la política de privacidad. Entiendo que las imágenes que suba al
            análisis serán privadas y visibles solo para mí.
          </label>
          <Button type="submit" full disabled={!accepted || creando}>
            {creando ? 'Creando tu cuenta…' : 'Crear cuenta'}
          </Button>

          {error && (
            <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
}: {
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
      />
    </div>
  )
}
