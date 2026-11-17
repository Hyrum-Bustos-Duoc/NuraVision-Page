import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { MarcoCuenta } from '@/modules/auth/ui/MarcoCuenta'
import { Button } from '@/shared/ui/ui'

/**
 * Pide el correo para enviar el enlace de restablecimiento.
 *
 * ----------------------------------------------------------------------------
 * EL MENSAJE DE EXITO NO DICE SI LA CUENTA EXISTE
 * ----------------------------------------------------------------------------
 * Dice "si hay una cuenta con ese correo, te llega el enlace". Es deliberado y
 * es la parte que no se puede relajar: un mensaje distinto para un correo no
 * registrado convertiria esta pantalla en una forma de averiguar quien es
 * clienta del estudio, probando direcciones una a una.
 *
 * Por eso tampoco se vuelve al formulario tras enviar: la confirmacion ocupa la
 * pantalla y lo unico que ofrece es volver a entrar o pedir otro enlace, que es
 * lo que de verdad hace falta a continuacion.
 */
export default function OlvideContrasena() {
  const { solicitarRecuperacion } = useAuth()

  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pedirEnlace() {
    setEnviando(true)
    setError(null)
    try {
      await solicitarRecuperacion(email)
      setEnviado(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No pudimos enviar el correo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MarcoCuenta>
      <Link to="/login" className="mb-10 flex items-center gap-2 text-sm text-muted hover:text-ink">
        ← Volver a iniciar sesión
      </Link>

      {enviado ? (
        <div className="max-w-sm">
          <h1 className="font-serif-display text-4xl text-ink">Revisa tu correo</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Si hay una cuenta con <span className="text-ink">{email.trim()}</span>, te enviamos un
            enlace para crear una contraseña nueva.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            El enlace caduca pronto por seguridad, así que úsalo en cuanto llegue. Si no lo ves,
            mira en la carpeta de correo no deseado.
          </p>
          <Link to="/login" className="mt-8 block">
            <Button full>Volver a iniciar sesión</Button>
          </Link>
          {/* Pedir otro enlace tiene que ser posible sin recargar: el primero
              puede no llegar nunca y quedarse sin salida seria lo peor. */}
          <button
            type="button"
            onClick={() => setEnviado(false)}
            className="mt-4 w-full text-center text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
          >
            Enviar el enlace otra vez
          </button>
        </div>
      ) : (
        <>
          <h1 className="font-serif-display text-4xl text-ink">¿Olvidaste tu contraseña?</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Escribe tu correo y te enviamos un enlace para crear una nueva.
          </p>

          <form
            className="mt-8 max-w-sm space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              void pedirEnlace()
            }}
          >
            <div>
              <label
                htmlFor="email-recuperacion"
                className="text-xs font-medium uppercase tracking-[0.14em] text-muted"
              >
                Correo electrónico
              </label>
              <input
                id="email-recuperacion"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
              />
            </div>

            <Button type="submit" full disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar enlace'}
            </Button>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink"
              >
                {error}
              </p>
            )}

            <p className="text-center text-sm text-muted">
              ¿Te acordaste?{' '}
              <Link to="/login" className="font-medium text-ink underline underline-offset-4">
                Inicia sesión
              </Link>
            </p>
          </form>
        </>
      )}
    </MarcoCuenta>
  )
}

