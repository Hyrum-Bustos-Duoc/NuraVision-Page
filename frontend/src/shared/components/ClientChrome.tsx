import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Sparkles, X } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { Avatar, LinkButton } from '@/shared/ui/ui'

function Brand() {
  return (
    <NavLink to="/" className="flex shrink-0 items-center">
      <img
        src="/nuravision-logo.png"
        alt="Nuravision"
        className="h-10 w-auto sm:h-12"
        width={800}
        height={266}
      />
    </NavLink>
  )
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm transition-colors ${isActive ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`

/** "Camila Torres" -> "CT". Con una sola palabra devuelve su inicial. */
function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

export function ClientHeader() {
  const { currentUser, logout } = useAppState()
  const { usuario, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Una sesión de Supabase cuenta como sesión de clienta igual que la del
  // prototipo. Sin esto, quien entra de verdad ve el encabezado de visitante y
  // no tiene por dónde llegar a "mis reservas".
  const authed = usuario !== null || currentUser?.role === 'cliente'

  // La cuenta real manda sobre la de demostración. Una cuenta de Supabase
  // puede no tener nombre (solo el correo es obligatorio al registrarse), así
  // que el correo queda de respaldo para no dejar el saludo vacío.
  const nombreVisible = usuario
    ? (usuario.nombre ?? usuario.email)
    : (currentUser?.firstName ?? '')
  const inicialesVisibles = usuario ? iniciales(nombreVisible) : (currentUser?.initials ?? '')

  // "/perfil" todavía se alimenta del usuario de demostración y devuelve a
  // "/login" si no lo hay. Con sesión real pero sin ese usuario, enviar ahí
  // sería un callejón sin salida, así que el atajo lleva a "mis reservas".
  const destinoCuenta = currentUser ? '/perfil' : '/mis-reservas'

  // El menú móvil se cierra al navegar.
  useEffect(() => setMenuOpen(false), [pathname])

  // Se cierran las dos: la del prototipo y la real. Cerrar solo una dejaría el
  // encabezado diciendo que hay sesión iniciada.
  async function salir() {
    logout()
    try {
      await signOut()
    } catch {
      // Si Supabase falla al cerrar, la sesión local ya se limpió y la persona
      // ve que salió. Insistir con un error no le da nada que hacer.
    }
    navigate('/')
  }

  const links = [
    { to: '/', label: 'Inicio', end: true },
    { to: '/servicios', label: 'Servicios' },
    { to: '/profesionales', label: 'Profesionales' },
    ...(authed
      ? [
          { to: '/reservar', label: 'Reservar' },
          { to: '/mis-reservas', label: 'Mis reservas' },
        ]
      : [{ to: '/analisis-ia', label: 'Análisis IA' }]),
  ]

  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-ivory/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-10">
          <Brand />
          <nav className="hidden items-center gap-7 md:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {authed ? (
            <>
              <NavLink
                to="/analisis-ia"
                className="hidden items-center gap-1.5 rounded-full border border-line px-4 py-1.5 text-sm text-ink transition-colors hover:bg-white sm:flex"
              >
                <Sparkles className="h-3.5 w-3.5 text-olive-600" />
                Análisis IA
              </NavLink>
              <button
                onClick={() => navigate(destinoCuenta)}
                className="flex items-center gap-2"
                title={currentUser ? 'Mi perfil' : 'Mis reservas'}
              >
                <Avatar initials={inicialesVisibles} />
                <span className="hidden text-sm text-ink sm:inline">{nombreVisible}</span>
              </button>
              <button
                onClick={() => void salir()}
                className="hidden text-sm text-muted transition-colors hover:text-ink sm:inline"
              >
                Salir
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className="hidden text-sm text-ink transition-colors hover:text-muted sm:inline"
              >
                Iniciar sesión
              </NavLink>
              {/* Envuelto en un span: `hidden` y el `inline-flex` del botón son
                  ambos utilidades de display y entrarían en conflicto. */}
              <span className="hidden sm:block">
                <LinkButton to="/reservar">Reservar ahora</LinkButton>
              </span>
            </>
          )}

          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            className="rounded-full border border-line p-2 text-ink transition-colors hover:bg-white md:hidden"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="animate-fade-up border-t border-line-soft bg-ivory px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive ? 'bg-paper font-medium text-ink' : 'text-muted hover:bg-paper'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2 border-t border-line-soft pt-4">
            {authed ? (
              <button
                onClick={() => void salir()}
                className="rounded-lg px-3 py-2.5 text-left text-sm text-muted hover:bg-paper"
              >
                Cerrar sesión
              </button>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className="rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-paper"
                >
                  Iniciar sesión
                </NavLink>
                <LinkButton to="/reservar" full>
                  Reservar ahora
                </LinkButton>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

export function ClientFooter() {
  return (
    <footer className="border-t border-line-soft bg-ivory">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <img
          src="/nuravision-logo.png"
          alt="Nuravision"
          className="h-12 w-auto shrink-0 sm:h-14"
          width={800}
          height={266}
        />
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted">
          <span>Av. Libertad 1250, Viña del Mar</span>
          <span>+56 9 1234 5678</span>
          <span>Mar a Sáb · 10:00-19:00</span>
        </div>
      </div>
    </footer>
  )
}

export function ClientLayout() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-screen flex-col bg-ivory">
      <ClientHeader />
      {/* La clave por ruta reinicia la animación de entrada en cada página. */}
      <main key={pathname} className="animate-fade-up flex-1">
        <Outlet />
      </main>
      <ClientFooter />
    </div>
  )
}
