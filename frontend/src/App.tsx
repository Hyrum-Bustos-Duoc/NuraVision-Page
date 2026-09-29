import { BrowserRouter, Route, Routes } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react'
import { AppStateProvider } from '@/shared/state/AppState'
import { AuthProvider } from '@/modules/auth/ui/AuthProvider'
import { ToastProvider } from '@/shared/state/Toast'
import { ClientLayout } from '@/shared/components/ClientChrome'
import { DashboardShell, type NavItem } from '@/shared/components/DashboardChrome'
import { RequireRole } from '@/shared/components/RequireRole'
import { ScrollToTop } from '@/shared/components/ScrollToTop'

import Landing from '@/pages/Landing'
import { SiYaTienePanel } from '@/shared/components/SiYaTienePanel'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Services from '@/modules/servicios/ui/Services'
import ServiceDetail from '@/modules/servicios/ui/ServiceDetail'
import Professionals from '@/pages/Professionals'
import ProfessionalDetail from '@/pages/ProfessionalDetail'
import BookingFlow from '@/pages/BookingFlow'
import MyBookings from '@/pages/MyBookings'
import BookingDetail from '@/pages/BookingDetail'
import AIAnalysis from '@/pages/AIAnalysis'
import Profile from '@/pages/Profile'

import { ProShell } from '@/pages/professional/ProShell'
import ProDashboard from '@/pages/professional/ProDashboard'
import ProAgenda from '@/pages/professional/ProAgenda'
import ProAvailability from '@/pages/professional/ProAvailability'
import ProHistory from '@/pages/professional/ProHistory'
import ProServices from '@/pages/professional/ProServices'
import ProProfile from '@/pages/professional/ProProfile'

import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminReservas from '@/modules/admin/ui/AdminReservas'
import AdminClients from '@/pages/admin/AdminClients'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminProfessionals from '@/pages/admin/AdminProfessionals'
import AdminServices from '@/pages/admin/AdminServices'
import AdminContent from '@/pages/admin/AdminContent'
import AdminAnalytics from '@/pages/admin/AdminAnalytics'
import AdminSettings from '@/pages/admin/AdminSettings'

const PROFESSIONAL_NAV: NavItem[] = [
  { to: '/profesional', label: 'Inicio', icon: Home, end: true },
  { to: '/profesional/agenda', label: 'Mi agenda', icon: CalendarDays },
  { to: '/profesional/reservas', label: 'Reservas', icon: ClipboardList },
  { to: '/profesional/disponibilidad', label: 'Disponibilidad', icon: Clock },
  { to: '/profesional/servicios', label: 'Servicios', icon: Sparkles },
  { to: '/profesional/perfil', label: 'Perfil', icon: UserCircle },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/reservas', label: 'Reservas', icon: ClipboardList },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/usuarios', label: 'Usuarios', icon: ShieldCheck },
  { to: '/admin/profesionales', label: 'Profesionales', icon: UserCircle },
  { to: '/admin/servicios', label: 'Servicios', icon: Sparkles },
  { to: '/admin/contenido', label: 'Contenido', icon: ImageIcon },
  { to: '/admin/analitica', label: 'Analítica', icon: BarChart3 },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

export default function App() {
  return (
    // AuthProvider envuelve al resto: la sesión de Supabase la necesitan tanto
    // el asistente de reserva como "mis reservas", y abrir una sola
    // suscripción a los cambios de sesión exige un único proveedor arriba.
    <AuthProvider>
      <AppStateProvider>
        <ToastProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              {/* Quien ya tiene panel interno no vuelve a ver estas pantallas:
                  ya esta dentro, y pedirle credenciales de nuevo solo lo aleja
                  de donde trabaja. */}
              <Route
                path="login"
                element={
                  <SiYaTienePanel>
                    <Login />
                  </SiYaTienePanel>
                }
              />
              <Route
                path="registro"
                element={
                  <SiYaTienePanel>
                    <Register />
                  </SiYaTienePanel>
                }
              />

              <Route element={<ClientLayout />}>
                <Route index element={<Landing />} />
                <Route path="servicios" element={<Services />} />
                <Route path="servicios/:id" element={<ServiceDetail />} />
                <Route path="profesionales" element={<Professionals />} />
                <Route path="profesionales/:id" element={<ProfessionalDetail />} />
                <Route path="reservar" element={<BookingFlow />} />
                <Route path="mis-reservas" element={<MyBookings />} />
                <Route path="mis-reservas/:id" element={<BookingDetail />} />
                <Route path="analisis-ia" element={<AIAnalysis />} />
                <Route path="perfil" element={<Profile />} />
              </Route>

              <Route element={<RequireRole role="profesional" />}>
                <Route
                  element={
                    <ProShell
                      sectionLabel="Panel profesional"
                      userSubtitle="Nail artist"
                      navItems={PROFESSIONAL_NAV}
                    />
                  }
                >
                  <Route path="profesional" element={<ProDashboard />} />
                  <Route path="profesional/agenda" element={<ProAgenda />} />
                  <Route path="profesional/disponibilidad" element={<ProAvailability />} />
                  <Route path="profesional/reservas" element={<ProHistory />} />
                  <Route path="profesional/servicios" element={<ProServices />} />
                  <Route path="profesional/perfil" element={<ProProfile />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="administrador" />}>
                <Route
                  element={
                    <DashboardShell
                      sectionLabel="Administración"
                      userSubtitle="Administradora"
                      navItems={ADMIN_NAV}
                    />
                  }
                >
                  <Route path="admin" element={<AdminDashboard />} />
                  <Route path="admin/reservas" element={<AdminReservas />} />
                  <Route path="admin/clientes" element={<AdminClients />} />
                  <Route path="admin/usuarios" element={<AdminUsers />} />
                  <Route path="admin/profesionales" element={<AdminProfessionals />} />
                  <Route path="admin/servicios" element={<AdminServices />} />
                  <Route path="admin/contenido" element={<AdminContent />} />
                  <Route path="admin/analitica" element={<AdminAnalytics />} />
                  <Route path="admin/configuracion" element={<AdminSettings />} />
                </Route>
              </Route>

              <Route path="*" element={<Landing />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AppStateProvider>
    </AuthProvider>
  )
}
