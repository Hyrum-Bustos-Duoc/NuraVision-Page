import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  AppUser,
  Booking,
  BookingDraft,
  BookingStatus,
  CurrentUser,
  NextSlotsOptions,
  Professional,
  Service,
  SiteContent,
} from '@/shared/types'
import { createSeedData } from '@/shared/data/seed'
import { CONTENIDO_SITIO } from '@/shared/content/sitio'
import { clearStoredData, loadStoredData, saveStoredData } from '@/shared/lib/storage'
import { createId } from '@/shared/lib/id'
import { getNextAvailableSlots, type NextSlot } from '@/shared/lib/availability'

interface AppStateValue {
  // Usuarios registrados
  users: AppUser[]
  addUser: (user: Omit<AppUser, 'id' | 'createdAt'>) => AppUser
  updateUser: (id: string, patch: Partial<Omit<AppUser, 'id'>>) => void
  deleteUser: (id: string) => void
  /** Devuelve el usuario que ya usa ese correo, ignorando al que se edita. */
  findUserByEmail: (email: string, exceptId?: string) => AppUser | undefined

  // Sesión
  currentUser: CurrentUser | null
  logout: () => void

  // Catálogo
  services: Service[]
  /** Solo los servicios ofrecidos hoy: es lo que debe ver el cliente. */
  activeServices: Service[]
  getService: (id: string) => Service | undefined
  addService: (service: Omit<Service, 'id'>) => Service
  updateService: (id: string, patch: Partial<Omit<Service, 'id'>>) => void
  deleteService: (id: string) => void

  // Equipo
  professionals: Professional[]
  getProfessional: (id: string) => Professional | undefined
  professionalsForService: (serviceId: string) => Professional[]
  addProfessional: (professional: Omit<Professional, 'id'>) => Professional
  updateProfessional: (id: string, patch: Partial<Omit<Professional, 'id'>>) => void
  deleteProfessional: (id: string) => void

  // Contenido editable del sitio
  /** Contenido editorial del sitio. Versionado en `shared/content/sitio.ts`. */
  siteContent: SiteContent

  // Reservas
  bookings: Booking[]
  addBooking: (booking: Booking) => void
  updateBookingStatus: (id: string, status: BookingStatus) => void
  rescheduleBooking: (id: string, dateISO: string, time: string) => void
  nextSlotsFor: (professional: Professional, options?: NextSlotsOptions) => NextSlot[]

  // Borrador del asistente de reserva
  bookingDraft: BookingDraft
  setBookingDraft: (updater: (draft: BookingDraft) => BookingDraft) => void
  resetBookingDraft: () => void

  // Prototipo
  storageWarning: string | null
  resetDemoData: () => void
}

// El interruptor "Solo datos de Supabase" ya no existe. Quien lo dejo activado
// tiene la marca guardada; se borra una vez al cargar para no dejar basura.
try {
  window.localStorage.removeItem('nuravision:solo-supabase')
} catch {
  // Sin almacenamiento no hay nada que limpiar.
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadStoredData(createSeedData()))
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [bookingDraft, setBookingDraftState] = useState<BookingDraft>({})
  const [storageWarning, setStorageWarning] = useState<string | null>(null)

  useEffect(() => {
    const result = saveStoredData(data)
    if (result.ok) {
      setStorageWarning(null)
    } else {
      setStorageWarning(
        result.reason === 'quota'
          ? 'No se pudieron guardar los cambios: el almacenamiento del navegador está lleno. Usa imágenes más livianas o restablece los datos de demostración.'
          : 'No se pudieron guardar los cambios en este navegador.',
      )
    }
  }, [data])

  const logout = useCallback(() => setCurrentUser(null), [])

  // --- Usuarios ---
  const addUser = useCallback((user: Omit<AppUser, 'id' | 'createdAt'>) => {
    const created: AppUser = {
      ...user,
      id: createId('usr'),
      createdAt: new Date().toISOString().slice(0, 10),
    }
    setData((prev) => ({ ...prev, users: [...prev.users, created] }))
    return created
  }, [])

  const updateUser = useCallback((id: string, patch: Partial<Omit<AppUser, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }))
  }, [])

  const deleteUser = useCallback((id: string) => {
    setData((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) }))
  }, [])

  // --- Servicios ---
  const addService = useCallback((service: Omit<Service, 'id'>) => {
    const created: Service = { ...service, id: createId('svc') }
    setData((prev) => ({ ...prev, services: [...prev.services, created] }))
    return created
  }, [])

  const updateService = useCallback((id: string, patch: Partial<Omit<Service, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      services: prev.services.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }, [])

  const deleteService = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s.id !== id),
      // El servicio deja de existir también en el equipo y en las recomendaciones de la IA.
      professionals: prev.professionals.map((p) => ({
        ...p,
        serviceIds: p.serviceIds.filter((serviceId) => serviceId !== id),
      })),
    }))
  }, [])

  // --- Profesionales ---
  const addProfessional = useCallback((professional: Omit<Professional, 'id'>) => {
    const created: Professional = { ...professional, id: createId('pro') }
    setData((prev) => ({ ...prev, professionals: [...prev.professionals, created] }))
    return created
  }, [])

  const updateProfessional = useCallback(
    (id: string, patch: Partial<Omit<Professional, 'id'>>) => {
      setData((prev) => ({
        ...prev,
        professionals: prev.professionals.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }))
    },
    [],
  )

  const deleteProfessional = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      professionals: prev.professionals.filter((p) => p.id !== id),
    }))
  }, [])

  // --- Reservas ---
  const addBooking = useCallback((booking: Booking) => {
    setData((prev) => ({ ...prev, bookings: [booking, ...prev.bookings] }))
  }, [])

  const updateBookingStatus = useCallback((id: string, status: BookingStatus) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === id ? { ...b, status } : b)),
    }))
  }, [])

  const rescheduleBooking = useCallback((id: string, dateISO: string, time: string) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === id ? { ...b, dateISO, time } : b)),
    }))
  }, [])

  // --- Borrador de reserva ---
  const setBookingDraft = useCallback((updater: (draft: BookingDraft) => BookingDraft) => {
    setBookingDraftState((prev) => updater(prev))
  }, [])

  const resetBookingDraft = useCallback(() => setBookingDraftState({}), [])

  const resetDemoData = useCallback(() => {
    clearStoredData()
    setData(createSeedData())
    setBookingDraftState({})
  }, [])

  const value = useMemo<AppStateValue>(() => {
    const getService = (id: string) => data.services.find((s) => s.id === id)
    const getProfessional = (id: string) => data.professionals.find((p) => p.id === id)

    return {
      users: data.users,
      addUser,
      updateUser,
      deleteUser,
      findUserByEmail: (email, exceptId) =>
        data.users.find(
          (u) => u.id !== exceptId && u.email.trim().toLowerCase() === email.trim().toLowerCase(),
        ),

      currentUser,
      logout,

      services: data.services,
      activeServices: data.services.filter((s) => s.active),
      getService,
      addService,
      updateService,
      deleteService,

      professionals: data.professionals,
      getProfessional,
      professionalsForService: (serviceId: string) =>
        data.professionals.filter((p) => p.serviceIds.includes(serviceId)),
      addProfessional,
      updateProfessional,
      deleteProfessional,

      // Constante versionada, no estado: ver `shared/content/sitio.ts`.
      siteContent: CONTENIDO_SITIO,

      bookings: data.bookings,
      addBooking,
      updateBookingStatus,
      rescheduleBooking,
      nextSlotsFor: (professional, options) =>
        getNextAvailableSlots(professional, data.bookings, options?.count ?? 3, options?.fromISO),

      bookingDraft,
      setBookingDraft,
      resetBookingDraft,

      storageWarning,
      resetDemoData,
    }
  }, [
    data,
    currentUser,
    logout,
    addUser,
    updateUser,
    deleteUser,
    addService,
    updateService,
    deleteService,
    addProfessional,
    updateProfessional,
    deleteProfessional,
    addBooking,
    updateBookingStatus,
    rescheduleBooking,
    bookingDraft,
    setBookingDraft,
    resetBookingDraft,
    storageWarning,
    resetDemoData,
  ])

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState debe usarse dentro de AppStateProvider')
  return ctx
}
