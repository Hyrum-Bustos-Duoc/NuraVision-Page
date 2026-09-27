export type ServiceCategoryId = 'unas' | 'cabello' | 'piel' | 'diagnostico'

export interface ServiceCategory {
  id: ServiceCategoryId
  label: string
}

export interface Service {
  id: string
  category: ServiceCategoryId
  name: string
  shortDescription: string
  longDescription: string
  durationMin: number
  price: number
  includes: string[]
  imageUrl?: string
  /**
   * Un servicio inactivo se conserva para el historial y las reservas ya
   * tomadas, pero deja de ofrecerse a los clientes para nuevas reservas.
   */
  active: boolean
}

/** 0 = domingo … 6 = sábado (mismo índice que Date.getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface AvailabilityBreak {
  id: string
  start: string
  end: string
  label: string
}

export interface DayAvailability {
  enabled: boolean
  start: string
  end: string
  breaks: AvailabilityBreak[]
}

export type WeeklyAvailability = Record<Weekday, DayAvailability>

export interface Professional {
  id: string
  name: string
  role: string
  experienceYears: number
  bio: string
  specialistBadge?: string
  serviceIds: string[]
  imageUrl?: string
  availability: WeeklyAvailability
}

export type BookingStatus = 'confirmada' | 'en_curso' | 'completada' | 'cancelada'

export interface Booking {
  id: string
  code: string
  serviceId: string
  professionalId: string
  clientName: string
  /** Contacto de quien reserva. En las reservas sin cuenta es el único vínculo. */
  clientEmail?: string
  clientPhone?: string
  /**
   * Reserva hecha sin iniciar sesión. Se atiende igual, pero no queda asociada
   * a una cuenta y por tanto no acumula los beneficios de cliente registrado.
   */
  guest?: boolean
  dateISO: string
  time: string
  durationMin: number
  price: number
  status: BookingStatus
}

export interface AiTip {
  id: string
  title: string
  description: string
  imageUrl?: string
}

export interface AiFocusOption {
  id: string
  label: string
  /** Texto que se muestra al subir la fotografía ("Analizaremos …"). */
  analysisLabel: string
  recommendedServiceIds: string[]
  tips: AiTip[]
  /** Imagen de resultado del análisis. */
  imageUrl?: string
}

export interface SiteContent {
  heroImage?: string
  heroCaption: string
  aiTeaserImage?: string
  aiTeaserCaption: string
  loginImage?: string
  aiFocusOptions: AiFocusOption[]
}

export type Role = 'cliente' | 'profesional' | 'administrador'

/**
 * Usuario registrado en la plataforma. Es distinto de `Professional`: aquí
 * viven las credenciales y el rol, allá la ficha pública del equipo. Un
 * usuario con rol profesional se enlaza con su ficha por `professionalId`.
 */
export interface AppUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  role: Role
  /** Un usuario inactivo se conserva, pero no debería poder operar. */
  active: boolean
  createdAt: string
  professionalId?: string
}

export interface CurrentUser {
  role: Role
  name: string
  firstName: string
  lastName: string
  email: string
  phone: string
  initials: string
  clientSince?: string
  professionalId?: string
}

export interface BookingDraft {
  serviceId?: string
  professionalId?: string
  dateISO?: string
  time?: string
}

export interface NextSlotsOptions {
  count?: number
  fromISO?: string
}

export type SlotStatus = 'disponible' | 'reservado' | 'bloqueado' | 'fuera_horario'

export interface DayStatus {
  dateISO: string
  day: number
  status: 'con_cupos' | 'sin_cupos' | 'cerrado'
}

/** Datos editables del prototipo, persistidos en el navegador. */
export interface AppData {
  users: AppUser[]
  services: Service[]
  professionals: Professional[]
  bookings: Booking[]
}
