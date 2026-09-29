/**
 * Tipos de la base de datos.
 *
 * ATENCION: este archivo esta escrito a mano a partir del esquema real
 * inspeccionado via PostgREST (nombres y tipos de columna confirmados contra
 * el proyecto). Lo correcto a futuro es generarlo:
 *
 *   npx supabase gen types typescript --project-id <id> > src/shared/types/supabase.ts
 *
 * La NULABILIDAD no se puede inspeccionar sin la clave secreta, asi que las
 * marcas de "| null" de abajo son una suposicion conservadora. Confirmalas
 * contra el esquema antes de confiar en ellas.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** Enum `estado_reserva` de Postgres. */
export type EstadoReserva = 'pendiente' | 'confirmada' | 'completada' | 'cancelada'

/**
 * Enum `usuario_rol` de Postgres.
 *
 * Confirmado contra el proyecto preguntandole al servidor por un valor invalido,
 * que devuelve la lista completa. OJO con 'admin': NO es 'administrador', que es
 * como se llama el rol equivalente del prototipo en `shared/types`. Los dos
 * vocabularios conviven y no se pueden intercambiar sin traducir.
 */
export type UsuarioRol = 'cliente' | 'profesional' | 'admin'

export interface Database {
  public: {
    Tables: {
      servicios: {
        Row: {
          /** bigint */
          id: number
          /** text */
          nombre: string
          /** text, nullable: confirmado contra datos reales (hay filas con null) */
          categoria: string | null
          /** text */
          descripcion: string | null
          /** text, nullable (0010). Foto propia; si falta, se deduce del nombre. */
          imagen_url: string | null
          /** text, nullable (0010). Texto de la pagina de detalle. */
          descripcion_larga: string | null
          /** jsonb, siempre lista (0010 lo exige con un check). */
          incluye: Json
          /** integer */
          duracion_minutos: number
          /** numeric */
          precio_base: number
          /** boolean */
          activo: boolean
        }
        Insert: {
          id?: number
          nombre: string
          categoria?: string | null
          descripcion?: string | null
          imagen_url?: string | null
          descripcion_larga?: string | null
          incluye?: Json
          duracion_minutos: number
          precio_base: number
          activo?: boolean
        }
        Update: {
          id?: number
          nombre?: string
          categoria?: string | null
          descripcion?: string | null
          imagen_url?: string | null
          descripcion_larga?: string | null
          incluye?: Json
          duracion_minutos?: number
          precio_base?: number
          activo?: boolean
        }
        Relationships: []
      }
      /**
       * Perfiles de las cuentas. Puesta bajo control de versiones en 0010, que
       * ademas le agrego `email` y el trigger que la rellena al darse de alta
       * una cuenta.
       *
       * `id` es el mismo uuid de `auth.users`, o sea lo que devuelve
       * `auth.uid()`. El correo es una REPLICA: la fuente es `auth.users`, que
       * el navegador no puede leer.
       */
      perfiles: {
        Row: {
          /** uuid. La misma clave que auth.users. */
          id: string
          /** text, nullable: sale de user_metadata y puede no venir. */
          nombre: string | null
          /** text, nullable */
          telefono: string | null
          /** text, nullable: replica de auth.users.email (0010). */
          email: string | null
          rol: UsuarioRol
          /** bigint, nullable (0010). Replica de app_metadata.profesional_id. */
          profesional_id: number | null
          /** timestamptz */
          creado_en: string
        }
        Insert: {
          id: string
          nombre?: string | null
          telefono?: string | null
          email?: string | null
          rol?: UsuarioRol
          profesional_id?: number | null
          creado_en?: string
        }
        Update: {
          id?: string
          nombre?: string | null
          telefono?: string | null
          email?: string | null
          rol?: UsuarioRol
          profesional_id?: number | null
          creado_en?: string
        }
        Relationships: []
      }
      profesionales: {
        Row: {
          /** bigint */
          id: number
          /** text */
          nombre: string
          /** text */
          especialidad: string
          /** text, nullable */
          avatar_url: string | null
          /** boolean */
          activo: boolean
          /** integer, 0..70 (0010). 0 = sin declarar. */
          experiencia_anios: number
          /** text, nullable (0010). Reseña de la ficha publica. */
          biografia: string | null
          /** text, nullable (0010). Vocabulario libre, como servicios.categoria. */
          categoria: string | null
        }
        Insert: {
          id?: number
          nombre: string
          especialidad: string
          avatar_url?: string | null
          activo?: boolean
          experiencia_anios?: number
          biografia?: string | null
          categoria?: string | null
        }
        Update: {
          id?: number
          nombre?: string
          especialidad?: string
          avatar_url?: string | null
          activo?: boolean
          experiencia_anios?: number
          biografia?: string | null
          categoria?: string | null
        }
        Relationships: []
      }
      /** Tabla puente: que profesional realiza que servicio. */
      profesional_servicios: {
        Row: {
          /** bigint, FK -> profesionales.id */
          profesional_id: number
          /** bigint, FK -> servicios.id */
          servicio_id: number
        }
        Insert: {
          profesional_id: number
          servicio_id: number
        }
        Update: {
          profesional_id?: number
          servicio_id?: number
        }
        Relationships: []
      }
      /** Horario semanal de cada profesional. */
      disponibilidad: {
        Row: {
          /** bigint */
          id: number
          /** bigint, FK -> profesionales.id */
          profesional_id: number
          /** integer. Ver DIA_SEMANA_BASE en disponibilidad.mapper.ts. */
          dia_semana: number
          /** time, llega como "HH:MM:SS" */
          hora_inicio: string
          /** time, llega como "HH:MM:SS" */
          hora_fin: string
          /** boolean. false = ese dia no se atiende (0009). */
          activo: boolean
          /**
           * jsonb, siempre una lista (0009 lo exige con un check).
           * Pausas dentro de la jornada, con la forma de AvailabilityBreak.
           */
          bloques_bloqueados: Json
        }
        Insert: {
          id?: number
          profesional_id: number
          dia_semana: number
          hora_inicio: string
          hora_fin: string
          activo?: boolean
          bloques_bloqueados?: Json
        }
        Update: {
          id?: number
          profesional_id?: number
          dia_semana?: number
          hora_inicio?: string
          hora_fin?: string
          activo?: boolean
          bloques_bloqueados?: Json
        }
        Relationships: []
      }
      /**
       * Reservas. Tal como queda tras 0003_reservas.sql.
       *
       * Desde el navegador es de SOLO ESCRITURA: las politicas no otorgan
       * SELECT al rol anonimo, asi que `Row` existe para tipar la tabla pero
       * no hay consulta que lo devuelva todavia.
       */
      reservas: {
        Row: {
          /** bigint */
          id: number
          /** bigint, FK -> servicios.id */
          servicio_id: number
          /** bigint, FK -> profesionales.id */
          profesional_id: number
          /** uuid, FK -> perfiles.id. NULL en reservas sin cuenta. */
          cliente_id: string | null
          /** date, "YYYY-MM-DD" */
          fecha: string
          /** time, "HH:MM:SS" */
          hora_inicio: string
          /** time, "HH:MM:SS" */
          hora_fin: string
          cliente_nombre: string
          cliente_email: string
          cliente_telefono: string | null
          /** Codigo visible para quien reserva sin cuenta. Unico. */
          codigo: string
          estado: EstadoReserva
        }
        Insert: {
          id?: number
          servicio_id: number
          profesional_id: number
          cliente_id?: string | null
          fecha: string
          hora_inicio: string
          hora_fin: string
          cliente_nombre: string
          cliente_email: string
          cliente_telefono?: string | null
          codigo: string
          /** La politica de RLS solo acepta 'pendiente' desde el navegador. */
          estado?: EstadoReserva
        }
        Update: {
          id?: number
          servicio_id?: number
          profesional_id?: number
          cliente_id?: string | null
          fecha?: string
          hora_inicio?: string
          hora_fin?: string
          cliente_nombre?: string
          cliente_email?: string
          cliente_telefono?: string | null
          codigo?: string
          estado?: EstadoReserva
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      estado_reserva: EstadoReserva
      usuario_rol: UsuarioRol
    }
    CompositeTypes: Record<never, never>
  }
}

/** Atajo: `Tables<'servicios'>` en vez del camino completo. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

/** Atajo para lo que se manda al insertar o al hacer upsert. */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
