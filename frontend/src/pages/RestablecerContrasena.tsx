import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { leerErrorDeEnlace, motivoParaNoCambiarPassword } from '@/modules/auth/application'
import { MarcoCuenta } from '@/modules/auth/ui/MarcoCuenta'
import { rutaTrasIniciarSesion } from '@/modules/auth/ui/ruta-inicial'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { Button } from '@/shared/ui/ui'

/**
 * Crea una contraseña nueva desde el enlace del correo.
 *
 * ----------------------------------------------------------------------------
 * COMO SE SABE QUE EL ENLACE ERA BUENO
 * ----------------------------------------------------------------------------
 * Al llegar desde el correo, el cliente de Supabase lee el fragmento de la URL
 * y abre sesion solo. Asi que la prueba de que el enlace servia es que HAY
 * SESION: sin ella, `updateUser` no tendria a quien cambiarle la contraseña.
 *
 * Se escucha ademas el evento `PASSWORD_RECOVERY`, pero NO se depende de el:
 * se emite mientras el cliente procesa la URL, que puede ocurrir antes de que
 * esta pantalla se monte y se suscriba. Quien confirme primero vale.
 *
 * Y si el enlace caduco, Supabase no abre sesion: deja el motivo en el
 * fragmento de la URL. Leerlo es lo que permite decir "caduco, pide otro" en
 * vez de un generico que invita a reintentar con el mismo enlace muerto.
 */

type Fase =
  | { estado: 'validando' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'formulario' }
  | { estado: 'guardado' }

export default function RestablecerContrasena() {
  const { usuario, cargando, cambiarPassword, alRecuperarPassword } = useAuth()
  const navigate = useNavigate()

  // Se lee una sola vez: el cliente de Supabase limpia el fragmento en cuanto
  // lo procesa, asi que consultarlo mas tarde daria vacio aunque hubiera error.
  const [errorDelEnlace] = useState(() => leerErrorDeEnlace(window.location.hash))
  const [esRecuperacion, setEsRecuperacion] = useState(false)

  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardadoListo, setGuardadoListo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => alRecuperarPassword(() => setEsRecuperacion(true)), [alRecuperarPassword])

  /**
   * Tras guardar, se va sola a donde corresponda.
   *
   * La sesion del enlace sigue abierta y ya tiene la contraseña nueva, asi que
   * mandar al formulario de login a quien acaba de entrar seria absurdo:
   * `rutaTrasIniciarSesion` decide el panel o la vista de clienta.
   *
   * El retardo es a proposito: sin el, la confirmacion no se alcanza a leer y
   * el cambio de pantalla parece un fallo.
   */
  useEffect(() => {
    if (!guardadoListo) return
    const id = setTimeout(() => {
      navigate(usuario ? rutaTrasIniciarSesion(usuario, null) : '/login', { replace: true })
    }, 2500)
    return () => clearTimeout(id)
  }, [guardadoListo, usuario, navigate])

  const motivoLocal = useMemo(
    () => motivoParaNoCambiarPassword(nueva, confirmacion),
    [nueva, confirmacion],
  )

  async function guardar() {
    setIntentoGuardar(true)
    if (motivoLocal !== null) return

    setGuardando(true)
    setError(null)
    try {
      await cambiarPassword(nueva, confirmacion)
      setGuardadoListo(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar tu contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  /**
   * La fase se DERIVA del render, no se guarda en estado.
   *
   * Calcularla en un efecto la dejaria un instante desfasada justo al terminar
   * de restaurar la sesion, que es cuando mas se nota: se veria "enlace
   * invalido" un parpadeo antes de mostrar el formulario.
   */
  const fase: Fase = guardadoListo
    ? { estado: 'guardado' }
    : errorDelEnlace !== null
      ? { estado: 'invalido', motivo: errorDelEnlace.mensaje }
      : cargando
        ? { estado: 'validando' }
        : usuario !== null || esRecuperacion
          ? { estado: 'formulario' }
          : {
              estado: 'invalido',
              motivo:
                'Este enlace no es válido o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».',
            }

  if (fase.estado === 'validando') {
    return (
      <MarcoCuenta>
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-ink"
          role="status"
          aria-label="Validando el enlace"
        />
        <h1 className="mt-6 font-serif-display text-4xl text-ink">Validando tu enlace…</h1>
      </MarcoCuenta>
    )
  }

  if (fase.estado === 'invalido') {
    return (
      <MarcoCuenta>
        <h1 className="font-serif-display text-4xl text-ink">Este enlace ya no sirve</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{fase.motivo}</p>
        <Link to="/olvide-contrasena" className="mt-8 block max-w-sm">
          <Button full>Pedir un enlace nuevo</Button>
        </Link>
        <Link
          to="/login"
          className="mt-4 max-w-sm text-center text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
        >
          Volver a iniciar sesión
        </Link>
      </MarcoCuenta>
    )
  }

  if (fase.estado === 'guardado') {
    return (
      <MarcoCuenta>
        <h1 className="font-serif-display text-4xl text-ink">Contraseña actualizada</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Ya puedes entrar con tu contraseña nueva. Te llevamos ahí en un momento.
        </p>
        <Link to="/login" className="mt-8 block max-w-sm">
          <Button full>Continuar</Button>
        </Link>
      </MarcoCuenta>
    )
  }

  return (
    <MarcoCuenta>
      <h1 className="font-serif-display text-4xl text-ink">Crea tu contraseña nueva</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        Escríbela dos veces para confirmarla. Debe tener al menos 8 caracteres.
      </p>

      <form
        className="mt-8 max-w-sm space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <Campo
          id="password-nueva"
          etiqueta="Nueva contraseña"
          valor={nueva}
          onChange={setNueva}
          autoFocus
        />
        <Campo
          id="password-confirmacion"
          etiqueta="Confirmar nueva contraseña"
          valor={confirmacion}
          onChange={setConfirmacion}
        />

        {/* El motivo aparece en cuanto hay algo escrito en los dos campos, sin
            esperar al envio: avisar de que no coinciden despues de pulsar
            obliga a reescribir las dos. Antes de eso solo se muestra si ya se
            intento guardar, para no regañar a quien aun esta escribiendo. */}
        {motivoLocal !== null && (intentoGuardar || (nueva !== '' && confirmacion !== '')) && (
          <p role="alert" className="text-sm text-muted">
            {motivoLocal}
          </p>
        )}

        <Button type="submit" full disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar contraseña'}
        </Button>

        {error && (
          <p role="alert" className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}
      </form>
    </MarcoCuenta>
  )
}

function Campo({
  id,
  etiqueta,
  valor,
  onChange,
  autoFocus = false,
}: {
  id: string
  etiqueta: string
  valor: string
  onChange: (valor: string) => void
  autoFocus?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        {etiqueta}
      </label>
      <input
        id={id}
        type="password"
        // `new-password` le dice al gestor de contraseñas que ofrezca una
        // generada y que guarde la nueva, en vez de rellenar la vieja.
        autoComplete="new-password"
        autoFocus={autoFocus}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
      />
    </div>
  )
}
