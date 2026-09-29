import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { initialsFromName } from '@/shared/lib/format'

export interface NavItem {
  to: string
  label: string
  icon?: LucideIcon
  end?: boolean
}

/**
 * Quien aparece en la tarjeta del pie del panel lateral.
 *
 * Existe porque el nombre no siempre sale del mismo sitio. Con los atajos del
 * prototipo viene de `useAppState`, que devuelve una persona inventada; con una
 * sesion real de Supabase vinculada a una ficha, tiene que venir de la base.
 * Quien sabe cual de los dos aplica es cada panel, no este componente: el de
 * profesional resuelve su ficha y la pasa por aqui.
 */
export interface PanelIdentity {
  name: string
  initials: string
  subtitle: string
}

export function DashboardShell({
  sectionLabel,
  userSubtitle,
  navItems,
  identity,
}: {
  sectionLabel: string
  userSubtitle: string
  navItems: NavItem[]
  /** Reemplaza al usuario del prototipo en la tarjeta del pie. */
  identity?: PanelIdentity
}) {
  const { currentUser, logout } = useAppState()
  const { usuario, signOut: cerrarSesionSupabase } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // El panel lateral se cierra al navegar en pantallas pequeñas.
  useEffect(() => setSidebarOpen(false), [pathname])

  /**
   * La tarjeta se pinta con lo que llegue por `identity` y, si no llega, con el
   * usuario del prototipo.
   *
   * Antes solo existia la segunda mitad, y eso tenia un efecto que pasaba
   * desapercibido: quien entraba unicamente con Supabase no tenia `currentUser`,
   * asi que la tarjeta no se pintaba... y con ella desaparecia el unico boton de
   * cerrar sesion del panel.
   */
  const tarjeta: PanelIdentity | null =
    identity ??
    (currentUser
      ? { name: currentUser.name, initials: currentUser.initials, subtitle: userSubtitle }
      : usuario
        ? {
            name: usuario.nombre ?? usuario.email,
            initials: initialsFromName(usuario.nombre ?? usuario.email),
            subtitle: userSubtitle,
          }
        : null)

  async function signOut() {
    // Se cierran las dos sesiones: quedarse con una abierta es lo que hacia que
    // «Cerrar sesión» pareciera no funcionar, porque la guarda de ruta mira
    // ambas y con cualquiera de las dos seguia dando acceso.
    logout()
    if (usuario) {
      try {
        await cerrarSesionSupabase()
      } catch {
        // Si la llamada falla, la sesion local ya se limpio y la navegacion
        // sigue: es mejor salir del panel que dejar a la persona atrapada.
      }
    }
    navigate('/')
  }

  return (
    <div className="flex min-h-screen bg-ivory">
      {sidebarOpen && (
        <div
          className="animate-fade-in fixed inset-0 z-30 bg-ink/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col bg-ink px-6 py-8 text-white/70 transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25">
              <img
                src="/nuravision-isotipo.png"
                alt=""
                className="h-5 w-5 object-contain"
                width={512}
                height={512}
              />
            </div>
            <div>
              <p className="font-serif-display text-lg text-white">NuraVision</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                {sectionLabel}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-white/10 font-medium text-white'
                      : 'text-white/55 hover:bg-white/5 hover:text-white/90'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-olive-400 transition-opacity duration-200 ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                    {Icon && (
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive ? 'text-olive-400' : 'text-white/40 group-hover:text-white/70'
                        }`}
                      />
                    )}
                    {item.label}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {tarjeta && (
          <div className="mt-8 border-t border-white/10 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white">
                {tarjeta.initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{tarjeta.name}</p>
                <p className="truncate text-xs text-white/45">{tarjeta.subtitle}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white/80"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line-soft bg-ivory/95 px-5 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
            className="rounded-full border border-line p-2 text-ink transition-colors hover:bg-white"
          >
            <Menu className="h-4 w-4" />
          </button>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {sectionLabel}
          </p>
          {tarjeta && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-white">
              {tarjeta.initials}
            </div>
          )}
        </div>

        <div key={pathname} className="animate-fade-up flex-1 overflow-x-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export function DashboardPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
