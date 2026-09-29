import { seededRandom } from '../lib/random'
import type {
  AppData,
  AppUser,
  Booking,
  DayAvailability,
  Professional,
  Service,
  WeeklyAvailability,
} from '@/shared/types'

/**
 * "Hoy" del prototipo. Los datos de ejemplo giran en torno a esta fecha
 * (martes 1 de septiembre de 2026) para que agenda, paneles y calendario
 * cuenten la misma historia.
 */
export const TODAY_ISO = '2026-09-01'

function day(
  enabled: boolean,
  start = '10:00',
  end = '19:00',
  breaks: DayAvailability['breaks'] = [],
): DayAvailability {
  return { enabled, start, end, breaks }
}

function lunch(start = '13:00', end = '14:00'): DayAvailability['breaks'] {
  return [{ id: 'colacion', start, end, label: 'Colación' }]
}

/** Horario base para un profesional nuevo: el mismo del estudio. */
export function createDefaultAvailability(): WeeklyAvailability {
  return studioWeek()
}

/** Mar a Sáb, con colación al mediodía: el horario del estudio. */
function studioWeek(overrides: Partial<WeeklyAvailability> = {}): WeeklyAvailability {
  return {
    0: day(false),
    1: day(false),
    2: day(true, '10:00', '19:00', lunch()),
    3: day(true, '10:00', '19:00', lunch()),
    4: day(true, '10:00', '19:00', lunch()),
    5: day(true, '10:00', '19:00', lunch()),
    6: day(true, '10:00', '15:00'),
    ...overrides,
  }
}

export const seedServices: Service[] = [
  {
    id: 'manicure-ritual-nura',
    category: 'unas',
    active: true,
    name: 'Manicure Ritual Nura',
    shortDescription: 'Limado, cutículas, hidratación profunda y esmaltado a elección.',
    longDescription:
      'Un ritual completo de 60 minutos que parte con un baño tibio de sales, sigue con limado y trabajo de cutículas, y termina con una hidratación profunda y el esmaltado que elijas. Pensado para manos que necesitan volver a sentirse cuidadas.',
    durationMin: 60,
    price: 18000,
    includes: [
      'Baño de sales y exfoliación suave',
      'Limado y forma personalizada',
      'Trabajo de cutículas',
      'Masaje de manos con aceite',
      'Esmaltado tradicional o semipermanente',
    ],
  },
  {
    id: 'pedicure-spa',
    category: 'unas',
    active: true,
    name: 'Pedicure Spa',
    shortDescription: 'Pedicure completo con exfoliación, masaje y esmaltado.',
    longDescription:
      'Pedicure completo de 75 minutos con remojo, exfoliación, limado, masaje descontracturante y esmaltado. Ideal para renovar tus pies de raíz.',
    durationMin: 75,
    price: 22000,
    includes: [
      'Remojo y exfoliación',
      'Limado y forma personalizada',
      'Masaje de pies y piernas',
      'Esmaltado tradicional o semipermanente',
    ],
  },
  {
    id: 'unas-esculpidas',
    category: 'unas',
    active: true,
    name: 'Uñas esculpidas',
    shortDescription: 'Construcción en acrílico o gel con diseño personalizado.',
    longDescription:
      'Construcción de uñas esculpidas en acrílico o gel, con extensión, forma a elección y diseño personalizado de línea fina. 120 minutos de trabajo detallado.',
    durationMin: 120,
    price: 35000,
    includes: [
      'Preparación y protección de la lámina natural',
      'Extensión en acrílico o gel',
      'Forma a elección',
      'Diseño personalizado',
    ],
  },
  {
    id: 'tratamiento-capilar-reconstructivo',
    category: 'cabello',
    active: true,
    name: 'Tratamiento capilar reconstructivo',
    shortDescription: 'Reconstrucción de fibra para cabello procesado o quebradizo.',
    longDescription:
      'Tratamiento de reconstrucción profunda de 90 minutos para cabello procesado, dañado o quebradizo. Repone la fibra capilar y devuelve elasticidad y brillo.',
    durationMin: 90,
    price: 28000,
    includes: [
      'Diagnóstico capilar previo',
      'Reconstrucción de fibra',
      'Hidratación profunda',
      'Sellado y finalizado',
    ],
  },
  {
    id: 'corte-y-peinado',
    category: 'cabello',
    active: true,
    name: 'Corte y peinado',
    shortDescription: 'Corte según tu tipo de cabello y peinado de salida.',
    longDescription:
      'Corte técnico según tu tipo de cabello y estructura facial, más peinado de salida. 45 minutos pensados para un resultado que se pueda repetir en casa.',
    durationMin: 45,
    price: 15000,
    includes: ['Diagnóstico y asesoría', 'Corte técnico', 'Lavado', 'Peinado de salida'],
  },
  {
    id: 'coloracion',
    category: 'cabello',
    active: true,
    name: 'Coloración',
    shortDescription: 'Color global, retoque de raíz o técnicas de iluminación.',
    longDescription:
      'Servicio de color de 150 minutos: color global, retoque de raíz o técnicas de iluminación y corrección de color, según lo que tu cabello necesite.',
    durationMin: 150,
    price: 52000,
    includes: [
      'Diagnóstico de fibra y cuero cabelludo',
      'Aplicación de color a medida',
      'Tratamiento post-color',
      'Peinado de salida',
    ],
  },
  {
    id: 'limpieza-facial-profunda',
    category: 'piel',
    active: true,
    name: 'Limpieza facial profunda',
    shortDescription: 'Higiene, extracción y mascarilla según tu tipo de piel.',
    longDescription:
      'Limpieza facial profunda de 60 minutos: higiene, exfoliación, extracción y mascarilla formulada según tu tipo de piel y su evaluación del día.',
    durationMin: 60,
    price: 25000,
    includes: [
      'Doble limpieza',
      'Exfoliación e higiene profunda',
      'Extracción',
      'Mascarilla según tipo de piel',
    ],
  },
  {
    id: 'diagnostico-capilar',
    category: 'diagnostico',
    active: true,
    name: 'Diagnóstico capilar y de cuero cabelludo',
    shortDescription: 'Evaluación con lupa digital y plan de cuidado sugerido.',
    longDescription:
      'Evaluación de 30 minutos del cuero cabelludo y la fibra capilar con lupa digital, con un plan de cuidado sugerido a partir de lo observado.',
    durationMin: 30,
    price: 12000,
    includes: ['Evaluación con lupa digital', 'Registro fotográfico', 'Plan de cuidado sugerido'],
  },
]

export const seedProfessionals: Professional[] = [
  {
    id: 'camila-reyes',
    name: 'Camila Reyes',
    role: 'Nail artist',
    experienceYears: 8,
    specialistBadge: 'Especialista',
    bio: 'Especialista en uñas esculpidas y nail art de línea fina. Trabaja con protocolos de bioseguridad estrictos y prioriza la salud de la lámina natural por sobre el largo.',
    serviceIds: ['manicure-ritual-nura', 'pedicure-spa', 'unas-esculpidas'],
    availability: studioWeek(),
  },
  {
    id: 'valentina-soto',
    name: 'Valentina Soto',
    role: 'Estilista y colorista',
    experienceYears: 12,
    bio: 'Colorista formada en técnicas de iluminación y corrección de color. Prefiere procesos graduales que cuiden la fibra antes que resultados de una sola sesión.',
    serviceIds: ['tratamiento-capilar-reconstructivo', 'corte-y-peinado', 'coloracion'],
    availability: studioWeek(),
  },
  {
    id: 'josefa-miranda',
    name: 'Josefa Miranda',
    role: 'Cosmetóloga',
    experienceYears: 6,
    bio: 'Cosmetóloga con foco en piel sensible y reactiva. Ajusta cada protocolo según la evaluación del día y no según un paquete cerrado.',
    serviceIds: ['limpieza-facial-profunda', 'diagnostico-capilar'],
    // No atiende los martes.
    availability: studioWeek({ 2: day(false) }),
  },
  {
    id: 'andres-fuentes',
    name: 'Andrés Fuentes',
    role: 'Barbero y estilista',
    experienceYears: 9,
    bio: 'Corte clásico y contemporáneo. Le interesa que el peinado se pueda repetir en casa sin herramientas complicadas.',
    serviceIds: ['corte-y-peinado'],
    // Jornada más larga y también atiende lunes.
    availability: studioWeek({
      1: day(true, '11:00', '20:00', lunch('14:00', '15:00')),
      6: day(true, '10:00', '16:00'),
    }),
  },
]

export const seedBookings: Booking[] = [
  {
    id: 'b-1001',
    code: 'NV-0109-1001',
    serviceId: 'manicure-ritual-nura',
    professionalId: 'camila-reyes',
    clientName: 'Camila Torres',
    dateISO: '2026-09-01',
    time: '10:00',
    durationMin: 60,
    price: 18000,
    status: 'completada',
  },
  {
    id: 'b-1002',
    code: 'NV-0109-1002',
    serviceId: 'unas-esculpidas',
    professionalId: 'camila-reyes',
    clientName: 'Fernanda Alarcón',
    dateISO: '2026-09-01',
    time: '11:00',
    durationMin: 120,
    price: 35000,
    status: 'en_curso',
  },
  {
    id: 'b-1003',
    code: 'NV-0109-1003',
    serviceId: 'pedicure-spa',
    professionalId: 'camila-reyes',
    clientName: 'Josefina Rojas',
    dateISO: '2026-09-01',
    time: '14:00',
    durationMin: 75,
    price: 22000,
    status: 'confirmada',
  },
  {
    id: 'b-1004',
    code: 'NV-0109-1004',
    serviceId: 'manicure-ritual-nura',
    professionalId: 'camila-reyes',
    clientName: 'Antonia Vera',
    dateISO: '2026-09-01',
    time: '15:30',
    durationMin: 60,
    price: 18000,
    status: 'confirmada',
  },
  {
    id: 'b-1005',
    code: 'NV-0109-1005',
    serviceId: 'unas-esculpidas',
    professionalId: 'camila-reyes',
    clientName: 'Sofía Bravo',
    dateISO: '2026-09-01',
    time: '17:00',
    durationMin: 120,
    price: 35000,
    status: 'confirmada',
  },
  {
    id: 'b-1006',
    code: 'NV-1809-1006',
    serviceId: 'corte-y-peinado',
    professionalId: 'andres-fuentes',
    clientName: 'Camila Torres',
    dateISO: '2026-09-18',
    time: '11:00',
    durationMin: 45,
    price: 15000,
    status: 'confirmada',
  },
  {
    id: 'b-1007',
    code: 'NV-2008-1007',
    serviceId: 'limpieza-facial-profunda',
    professionalId: 'josefa-miranda',
    clientName: 'Camila Torres',
    dateISO: '2026-08-20',
    time: '10:00',
    durationMin: 60,
    price: 25000,
    status: 'cancelada',
  },
  {
    id: 'b-1008',
    code: 'NV-2808-1008',
    serviceId: 'coloracion',
    professionalId: 'valentina-soto',
    clientName: 'Antonia Vera',
    dateISO: '2026-08-28',
    time: '10:00',
    durationMin: 150,
    price: 52000,
    status: 'cancelada',
  },
  {
    id: 'b-1009',
    code: 'NV-2509-1009',
    serviceId: 'corte-y-peinado',
    professionalId: 'andres-fuentes',
    clientName: 'Matías Cortés',
    dateISO: '2026-09-25',
    time: '12:00',
    durationMin: 45,
    price: 15000,
    status: 'confirmada',
  },
]

/**
 * Usuarios registrados. Los clientes corresponden a quienes aparecen en las
 * reservas semilla y los profesionales se enlazan con su ficha del equipo.
 */
export const seedUsers: AppUser[] = [
  { id: 'usr-0001', firstName: 'Camila', lastName: 'Torres', email: 'camila.torres@correo.cl', phone: '+56 9 6543 2109', role: 'cliente', active: true, createdAt: '2025-11-04' },
  { id: 'usr-0002', firstName: 'Antonia', lastName: 'Vera', email: 'antonia.vera@correo.cl', phone: '+56 9 8123 4455', role: 'cliente', active: true, createdAt: '2026-01-19' },
  { id: 'usr-0003', firstName: 'Fernanda', lastName: 'Alarcón', email: 'fernanda.alarcon@correo.cl', phone: '+56 9 7788 1020', role: 'cliente', active: true, createdAt: '2026-03-02' },
  { id: 'usr-0004', firstName: 'Josefina', lastName: 'Rojas', email: 'josefina.rojas@correo.cl', phone: '+56 9 9012 3344', role: 'cliente', active: true, createdAt: '2026-04-27' },
  { id: 'usr-0005', firstName: 'Matías', lastName: 'Cortés', email: 'matias.cortes@correo.cl', phone: '+56 9 5566 7788', role: 'cliente', active: true, createdAt: '2026-06-11' },
  { id: 'usr-0006', firstName: 'Sofía', lastName: 'Bravo', email: 'sofia.bravo@correo.cl', phone: '+56 9 4433 2211', role: 'cliente', active: false, createdAt: '2026-07-08' },
  { id: 'usr-0007', firstName: 'Camila', lastName: 'Reyes', email: 'camila.reyes@estudionura.cl', phone: '+56 9 3344 5566', role: 'profesional', active: true, createdAt: '2025-08-01', professionalId: 'camila-reyes' },
  { id: 'usr-0008', firstName: 'Valentina', lastName: 'Soto', email: 'valentina.soto@estudionura.cl', phone: '+56 9 2233 4455', role: 'profesional', active: true, createdAt: '2025-08-01', professionalId: 'valentina-soto' },
  { id: 'usr-0009', firstName: 'Josefa', lastName: 'Miranda', email: 'josefa.miranda@estudionura.cl', phone: '+56 9 1122 3344', role: 'profesional', active: true, createdAt: '2025-09-15', professionalId: 'josefa-miranda' },
  { id: 'usr-0010', firstName: 'Andrés', lastName: 'Fuentes', email: 'andres.fuentes@estudionura.cl', phone: '+56 9 6677 8899', role: 'profesional', active: true, createdAt: '2026-02-03', professionalId: 'andres-fuentes' },
  { id: 'usr-0011', firstName: 'Paula', lastName: 'Núñez', email: 'paula.nunez@estudionura.cl', phone: '+56 9 9988 7766', role: 'administrador', active: true, createdAt: '2025-07-20' },
]

/**
 * Historial de atenciones ya ocurridas. Se genera en vez de escribirse a mano
 * porque la analítica necesita varios meses de datos para decir algo; el
 * generador es determinista, así la demo muestra siempre lo mismo.
 */
function generateHistoricalBookings(): Booking[] {
  const clients = [
    'Camila Torres',
    'Antonia Vera',
    'Fernanda Alarcón',
    'Josefina Rojas',
    'Matías Cortés',
    'Sofía Bravo',
    'Valeria Pinto',
    'Ignacia Muñoz',
    'Daniela Sepúlveda',
    'Rocío Navarro',
  ]
  const bookings: Booking[] = []
  const end = new Date(`${TODAY_ISO}T00:00:00`)
  const start = new Date(end)
  start.setMonth(start.getMonth() - 6)

  let seq = 0
  for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay()
    if (weekday === 0) continue // el estudio no abre los domingos

    const iso = day.toISOString().slice(0, 10)
    // Entre 1 y 4 atenciones por día, con más movimiento hacia el fin de semana.
    const perDay = 1 + Math.floor(seededRandom(`day-${iso}`) * (weekday >= 5 ? 4 : 3))

    for (let i = 0; i < perDay; i += 1) {
      const key = `${iso}-${i}`
      const service = seedServices[Math.floor(seededRandom(`svc-${key}`) * seedServices.length)]
      const eligible = seedProfessionals.filter((pro) => pro.serviceIds.includes(service.id))
      if (eligible.length === 0) continue
      const professional = eligible[Math.floor(seededRandom(`pro-${key}`) * eligible.length)]
      const roll = seededRandom(`status-${key}`)

      seq += 1
      bookings.push({
        id: `b-h${String(seq).padStart(4, '0')}`,
        code: `NV-${iso.slice(8, 10)}${iso.slice(5, 7)}-${String(2000 + seq)}`,
        serviceId: service.id,
        professionalId: professional.id,
        clientName: clients[Math.floor(seededRandom(`cli-${key}`) * clients.length)],
        dateISO: iso,
        time: `${String(10 + Math.floor(seededRandom(`hour-${key}`) * 8)).padStart(2, '0')}:${
          seededRandom(`min-${key}`) < 0.5 ? '00' : '30'
        }`,
        durationMin: service.durationMin,
        price: service.price,
        // Una minoría se cancela; el resto se completó.
        status: roll < 0.07 ? 'cancelada' : 'completada',
      })
    }
  }
  return bookings
}

export function createSeedData(): AppData {
  // Copia profunda: el estado es mutable y no debe tocar las constantes semilla.
  return structuredClone({
    users: seedUsers,
    services: seedServices,
    professionals: seedProfessionals,
    bookings: [...seedBookings, ...generateHistoricalBookings()],
  })
}
