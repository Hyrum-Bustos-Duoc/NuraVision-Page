import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, ShoppingBag, X } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { CartDrawer } from '@/modules/carrito/ui/CartDrawer'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { NuvaLauncher } from '@/modules/nuva/ui/NuvaLauncher'
import { NuvaPanel } from '@/modules/nuva/ui/NuvaPanel'
import { useNuva } from '@/modules/nuva/ui/useNuva'
import { PREGUNTAS_AYUDA } from '@/modules/nuva/domain/nuva.motor'
import { NewsletterForm } from '@/modules/newsletter/ui/NewsletterForm'
import { boton } from '@/shared/ui/nv-estilos'

const ANUNCIOS = [
  'Retiro en Estudio inmediato',
  'Servicios hechos por Profesionales',
  'Agenda en línea 24/7',
  'Nuva: Tu asistente IA',
  'Análisis IA para tu comodidad',
]

/**
 * Barra de anuncios (spec §4.2b). La lista va dos veces para que el
 * desplazamiento de 0 a −50 % cierre el ciclo sin salto; la copia se oculta a
 * los lectores de pantalla para que no la lean dos veces.
 */
function BarraAnuncios() {
  const lista = (copia: boolean) => (
    <ul aria-hidden={copia || undefined} className="flex shrink-0 items-center">
      {ANUNCIOS.map((texto) => (
        <li key={texto} className="flex items-center gap-12 pr-12">
          <span className="whitespace-nowrap">{texto}</span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-nv-accent-mid" />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="flex h-9 items-center overflow-hidden bg-nv-ink font-mono text-[10.5px] uppercase tracking-[0.14em] text-nv-tint3">
      <div className="animate-nv-marquee flex w-max">
        {lista(false)}
        {lista(true)}
      </div>
    </div>
  )
}

/** "Camila Torres" -> "CT". Con una sola palabra devuelve su inicial. */
function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

const claseItemMenu = ({ isActive }: { isActive: boolean }) =>
  `rounded-[7px] px-2.5 py-2 text-[13.5px] transition-colors hover:bg-nv-paper4 ${
    isActive ? 'font-semibold text-nv-ink' : 'text-nv-muted1'
  }`

function BotonNuva({ compacto = false }: { compacto?: boolean }) {
  const { alternar, abierto } = useNuva()
  return (
    <button
      type="button"
      onClick={alternar}
      aria-expanded={abierto}
      aria-label="Nuva, asistente de compras y reservas"
      className={`flex items-center gap-1.5 rounded-full border border-nv-accent-line text-[12.5px] text-nv-accent transition-colors hover:bg-nv-accent-wash4 ${
        compacto ? 'h-9 w-9 justify-center' : 'px-3.5 py-[7px]'
      }`}
    >
      <span className="font-serif text-[15px] italic leading-none">N</span>
      {!compacto && 'Nuva'}
    </button>
  )
}

function BotonCarrito() {
  const { unidades, abrir } = useCarrito()
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label={`Abrir carrito, ${unidades} ${unidades === 1 ? 'producto' : 'productos'}`}
      className="flex h-9 items-center gap-1.5 rounded-full px-2 text-nv-ink transition-colors hover:bg-nv-paper4"
    >
      <ShoppingBag className="h-4 w-4" strokeWidth={1.3} />
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-nv-accent px-1.5 text-[11px] tabular-nums text-nv-surface">
        {unidades}
      </span>
    </button>
  )
}

export function ClientHeader() {
  const { currentUser, logout } = useAppState()
  const { usuario, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // El menu recuerda en que ruta se abrio: al navegar deja de coincidir y se
  // cierra solo, sin un efecto que lo resetee.
  const [menuAbiertoEn, setMenuAbiertoEn] = useState<string | null>(null)
  const menuAbierto = menuAbiertoEn === pathname

  // Una sesión de Supabase cuenta como sesión de clienta igual que la del
  // prototipo. Sin esto, quien entra de verdad ve el encabezado de visitante y
  // no tiene por dónde llegar a "mis reservas".
  const authed = usuario !== null || currentUser?.role === 'cliente'

  // La cuenta real manda sobre la de demostración. Una cuenta de Supabase
  // puede no tener nombre (solo el correo es obligatorio al registrarse), así
  // que el correo queda de respaldo para no dejar el saludo vacío.
  const nombreVisible = usuario ? (usuario.nombre ?? usuario.email) : (currentUser?.firstName ?? '')
  const primerNombre = nombreVisible.split(/[\s@]/)[0]
  const inicialesVisibles = usuario ? iniciales(nombreVisible) : (currentUser?.initials ?? '')

  // "/perfil" todavía se alimenta del usuario de demostración y devuelve a
  // "/login" si no lo hay. Con sesión real pero sin ese usuario, enviar ahí
  // sería un callejón sin salida, así que el atajo lleva a "mis reservas".
  const destinoCuenta = currentUser ? '/perfil' : '/mis-reservas'

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

  const links = authed
    ? [
        { to: '/', label: 'Inicio', end: true },
        { to: '/servicios', label: 'Servicios' },
        { to: '/tienda', label: 'Tienda' },
        { to: '/profesionales', label: 'Profesionales' },
        { to: '/reservar', label: 'Reservar' },
        { to: '/mis-reservas', label: 'Mis reservas' },
      ]
    : [
        { to: '/servicios', label: 'Servicios' },
        { to: '/tienda', label: 'Tienda' },
        { to: '/profesionales', label: 'Profesionales' },
        { to: '/analisis-ia', label: 'Análisis IA' },
      ]

  return (
    <header className="sticky top-0 z-40 border-b border-nv-line1 bg-nv-bg/90 backdrop-blur-[14px]">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:h-[72px] sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-6 xl:gap-10">
          <Link to="/" className="flex shrink-0 items-center" aria-label="Nuravision, ir al inicio">
            <img
              src="/nuravision-logo.png"
              alt="Nuravision"
              className="h-9 w-auto sm:h-11"
              width={800}
              height={266}
            />
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-0.5 lg:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={claseItemMenu}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <span className="hidden sm:block">
            <BotonNuva />
          </span>
          <span className="sm:hidden">
            <BotonNuva compacto />
          </span>
          <BotonCarrito />

          {authed ? (
            <>
              <NavLink
                to="/analisis-ia"
                className="hidden items-center gap-1.5 rounded-full border border-nv-line2 px-3.5 py-[7px] text-[12.5px] text-nv-ink transition-colors hover:bg-nv-paper4 xl:flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-nv-accent" />
                Análisis IA
              </NavLink>
              <button
                type="button"
                onClick={() => navigate(destinoCuenta)}
                className="hidden items-center gap-2 lg:flex"
                title={currentUser ? 'Mi perfil' : 'Mis reservas'}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-nv-accent-wash4 text-xs text-nv-accent">
                  {inicialesVisibles}
                </span>
                <span className="hidden text-[13.5px] text-nv-ink xl:inline">{primerNombre}</span>
              </button>
              <button
                type="button"
                onClick={() => void salir()}
                className="hidden text-[13px] text-nv-soft1 transition-colors hover:text-nv-ink lg:inline"
              >
                Salir
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className="hidden px-2 text-[13.5px] text-nv-ink transition-colors hover:text-nv-accent lg:inline"
              >
                Iniciar sesión
              </NavLink>
              <Link to="/reservar" className={`${boton.primario} hidden px-5 py-2.5 text-[13.5px] sm:inline-block`}>
                Reservar
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuAbiertoEn(menuAbierto ? null : pathname)}
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuAbierto}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-nv-line2 text-nv-ink transition-colors hover:bg-nv-paper4 lg:hidden"
          >
            {menuAbierto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {menuAbierto && (
        <div className="animate-fade-up max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-nv-line1 bg-nv-bg px-4 py-4 sm:px-6 lg:hidden">
          <nav aria-label="Principal" className="flex flex-col gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-3 text-[15px] transition-colors ${
                    isActive ? 'bg-nv-paper2 font-semibold text-nv-ink' : 'text-nv-muted1 hover:bg-nv-paper2'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            {authed && (
              <NavLink to="/analisis-ia" className="rounded-lg px-3 py-3 text-[15px] text-nv-muted1 hover:bg-nv-paper2">
                Análisis IA
              </NavLink>
            )}
          </nav>

          <div className="mt-4 flex flex-col gap-2 border-t border-nv-line1 pt-4">
            {authed ? (
              <>
                <Link to={destinoCuenta} className="rounded-lg px-3 py-3 text-[15px] text-nv-ink hover:bg-nv-paper2">
                  {nombreVisible}
                </Link>
                <button
                  type="button"
                  onClick={() => void salir()}
                  className="rounded-lg px-3 py-3 text-left text-[15px] text-nv-soft1 hover:bg-nv-paper2"
                >
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="rounded-lg px-3 py-3 text-[15px] text-nv-ink hover:bg-nv-paper2">
                  Iniciar sesión
                </NavLink>
                <Link to="/reservar" className={`${boton.primario} py-3 text-center text-sm`}>
                  Reservar
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

function ColumnaFooter({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-nv-soft2">{titulo}</h2>
      <ul className="mt-4 flex flex-col gap-2.5 text-sm">{children}</ul>
    </div>
  )
}

const claseLinkFooter = 'text-nv-tint3 transition-colors hover:text-nv-accent-mid'

/** Footer global oscuro (spec §6.2). */
export function ClientFooter() {
  const { enviar } = useNuva()

  return (
    <footer className="overflow-hidden bg-nv-ink text-nv-tint3">
      <div className="mx-auto max-w-[1240px] px-4 pb-9 pt-14 sm:px-6 sm:pt-20 lg:px-10">
        <div className="grid gap-12 border-b border-nv-ink3 pb-12 sm:grid-cols-3 sm:pb-[60px] lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-10">
          <div className="sm:col-span-3 lg:col-span-1">
            {/* El dorado del logo se oscurece hacia el cafe; sobre el fondo
                oscuro se aclara para que no se pierda. */}
            <img
              src="/nuravision-logo.png"
              alt="Nuravision"
              className="-ml-1.5 mb-8 h-12 w-auto brightness-[1.9] sm:h-14"
              width={800}
              height={266}
              loading="lazy"
            />
            <p className="max-w-[440px] font-serif text-[28px] font-light leading-[1.08] text-nv-bg sm:text-[34px]">
              Mantente actualizado y no te pierdas de nada!
              <br />
              <em className="text-nv-accent-mid">Nunca spam.</em>
            </p>
            <NewsletterForm />
            <address className="mt-[26px] flex flex-col gap-1.5 text-[13px] not-italic leading-[1.5] text-nv-faint2">
              <span>Estudio Nura · Av. Libertad 1250, Viña del Mar</span>
              <span>Martes a sábado · 10:00–19:00</span>
              <span>
                <a href="tel:+56912345678" className="hover:text-nv-accent-mid">
                  +56 9 1234 5678
                </a>{' '}
                ·{' '}
                <a href="mailto:hola@estudionura.cl" className="hover:text-nv-accent-mid">
                  hola@estudionura.cl
                </a>
              </span>
            </address>
          </div>

          <ColumnaFooter titulo="Tienda">
            <li>
              <Link to="/tienda?categoria=unas_manos" className={claseLinkFooter}>
                Uñas y manos
              </Link>
            </li>
            <li>
              <Link to="/tienda?categoria=cabello" className={claseLinkFooter}>
                Cabello
              </Link>
            </li>
            <li>
              <Link to="/tienda?categoria=piel" className={claseLinkFooter}>
                Piel
              </Link>
            </li>
            <li>
              <Link to="/tienda?categoria=kits" className={claseLinkFooter}>
                Kits y gift cards
              </Link>
            </li>
          </ColumnaFooter>

          <ColumnaFooter titulo="Estudio">
            <li>
              <Link to="/servicios" className={claseLinkFooter}>
                Servicios
              </Link>
            </li>
            <li>
              <Link to="/profesionales" className={claseLinkFooter}>
                Profesionales
              </Link>
            </li>
            <li>
              <Link to="/reservar" className={claseLinkFooter}>
                Reservar
              </Link>
            </li>
            <li>
              <Link to="/analisis-ia" className={claseLinkFooter}>
                Análisis IA
              </Link>
            </li>
          </ColumnaFooter>

          {/* Las preguntas de ayuda las responde Nuva: es el mismo texto que da
              en el chat, asi que no hay dos versiones de la politica. */}
          <ColumnaFooter titulo="Ayuda">
            <li>
              <button type="button" onClick={() => enviar(PREGUNTAS_AYUDA.despacho)} className={claseLinkFooter}>
                Despachos y retiros
              </button>
            </li>
            <li>
              <button type="button" onClick={() => enviar(PREGUNTAS_AYUDA.devoluciones)} className={claseLinkFooter}>
                Cambios y devoluciones
              </button>
            </li>
            <li>
              <button type="button" onClick={() => enviar(PREGUNTAS_AYUDA.cancelacion)} className={claseLinkFooter}>
                Política de cancelación
              </button>
            </li>
            <li>
              <a href="tel:+56912345678" className={claseLinkFooter}>
                +56 9 1234 5678
              </a>
            </li>
          </ColumnaFooter>
        </div>

        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 pt-6 text-xs text-nv-soft2">
          <span>© 2026 Estudio Nura · Viña del Mar</span>
          <span>Instagram · TikTok · WhatsApp</span>
        </div>
      </div>
    </footer>
  )
}

export function ClientLayout() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-screen flex-col bg-nv-bg">
      {/* La barra se desplaza con la pagina; el header queda pegado debajo. */}
      <BarraAnuncios />
      <ClientHeader />
      {/* La clave por ruta reinicia la animación de entrada en cada página. */}
      <main key={pathname} className="animate-fade-up flex-1">
        <Outlet />
      </main>
      <ClientFooter />
      <CartDrawer />
      <NuvaLauncher />
      <NuvaPanel />
    </div>
  )
}
