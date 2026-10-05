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

/** Enums de la tienda (0013). */
export type EntregaPedido = 'despacho' | 'retiro' | 'cita'
export type MetodoPagoPedido = 'webpay' | 'transferencia' | 'estudio'
export type EstadoPedido =
  | 'pendiente_pago'
  | 'pagado'
  | 'preparando'
  | 'listo'
  | 'despachado'
  | 'entregado'
  | 'cancelado'

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
          /**
           * jsonb nullable (0011). `{ pregunta, opciones: [{id, etiqueta, precio}] }`
           * o null si el servicio no pregunta nada.
           *
           * El precio de cada opcion es el FINAL, no un recargo sobre
           * `precio_base`. El check `servicios_variantes_bien_formadas` garantiza
           * que, si no es null, hay pregunta y al menos una opcion.
           */
          variantes: Json | null
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
          variantes?: Json | null
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
          variantes?: Json | null
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
          /**
           * text NOT NULL. Confirmado por las malas: la carga inicial de 0010
           * fallo con 23502 al intentar meter NULL para las cuentas sin nombre en
           * `user_metadata`. La migracion cae a la parte local del correo.
           */
          nombre: string
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
          nombre?: string
          telefono?: string | null
          email?: string | null
          rol?: UsuarioRol
          profesional_id?: number | null
          creado_en?: string
        }
        Update: {
          id?: string
          nombre?: string
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
          /**
           * jsonb nullable (0011). Datos extra de la reserva.
           *
           * La clave `variante` guarda una COPIA de la opcion elegida
           * —pregunta, etiqueta y precio—, no una referencia: el servicio puede
           * cambiar sus opciones y la reserva debe conservar lo acordado. Pesa
           * mas de lo habitual porque `reservas` no tiene columna de precio.
           */
          detalles_extra: Json | null
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
          /**
           * Se escribe UNA VEZ, aqui. 0005 no concede su UPDATE, asi que despues
           * de crear la reserva es un registro inmutable de lo acordado.
           */
          detalles_extra?: Json | null
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
          detalles_extra?: Json | null
        }
        Relationships: []
      }
      /**
       * Productos de la tienda (0013). Lectura publica; escritura del personal.
       *
       * En el proyecto remoto la tabla ya existia (fuera de migrations/) y
       * `precio` es numeric; en un proyecto nuevo es integer. PostgREST los
       * entrega igual, como numero. Los precios son pesos enteros.
       */
      productos: {
        Row: {
          id: number
          slug: string
          nombre: string
          /** 'unas_manos' | 'cabello' | 'piel' | 'kits' | 'gift_cards' (check). */
          categoria: string
          tamano: string
          precio: number
          precio_anterior: number | null
          imagen_url: string | null
          /** 'mas_vendido' | 'nuevo' | 'kit' | null (check). */
          insignia: string | null
          /** bigint, FK -> servicios.id */
          servicio_id: number | null
          descripcion: string
          modo_uso: string
          ingredientes: string
          /** NULL = sin control de stock. */
          stock: number | null
          activo: boolean
          orden: number
          creado_en: string
        }
        Insert: {
          id?: number
          slug: string
          nombre: string
          categoria: string
          tamano?: string
          precio: number
          precio_anterior?: number | null
          imagen_url?: string | null
          insignia?: string | null
          servicio_id?: number | null
          descripcion?: string
          modo_uso?: string
          ingredientes?: string
          stock?: number | null
          activo?: boolean
          orden?: number
          creado_en?: string
        }
        Update: Partial<Database['public']['Tables']['productos']['Insert']>
        Relationships: []
      }
      /**
       * Pedidos (0013). Sin INSERT desde el navegador: nacen en `crear_pedido`.
       * Cada cuenta lee los suyos; el personal lee todos y cambia `estado`.
       */
      pedidos: {
        Row: {
          id: number
          codigo: string
          cliente_id: string | null
          cliente_nombre: string
          cliente_email: string
          cliente_telefono: string | null
          entrega: EntregaPedido
          direccion: string | null
          comuna: string | null
          reserva_id: number | null
          metodo_pago: MetodoPagoPedido
          estado: EstadoPedido
          subtotal: number
          costo_envio: number
          descuento: number
          total: number
          creado_en: string
          actualizado_en: string
        }
        Insert: never
        /** 0013 solo concede UPDATE de estas dos columnas. */
        Update: {
          estado?: EstadoPedido
          actualizado_en?: string
        }
        Relationships: []
      }
      /** Lineas de un pedido (0013). Nombre y precio son una COPIA. */
      pedido_items: {
        Row: {
          id: number
          pedido_id: number
          producto_id: number | null
          nombre: string
          precio_unitario: number
          cantidad: number
          descuento: number
        }
        Insert: never
        Update: never
        /** Declarada para que `select('*, pedido_items(*)')` quede tipado. */
        Relationships: [
          {
            foreignKeyName: 'pedido_items_pedido_id_fkey'
            columns: ['pedido_id']
            isOneToOne: false
            referencedRelation: 'pedidos'
            referencedColumns: ['id']
          },
        ]
      }
      /** Contenido editable del sitio (0014). Una sola fila, id = 1. */
      contenido_sitio: {
        Row: {
          id: number
          datos: Json
          actualizado_en: string
          actualizado_por: string | null
        }
        Insert: never
        /** Solo `datos`: el sello lo pone un trigger. */
        Update: {
          datos?: Json
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      /** Unica via para crear pedidos. Calcula los montos en la base (0013). */
      crear_pedido: {
        Args: {
          p_items: Json
          p_nombre: string
          p_email: string
          p_entrega: EntregaPedido
          p_metodo_pago: MetodoPagoPedido
          p_direccion?: string | null
          p_comuna?: string | null
          p_reserva_id?: number | null
          p_telefono?: string | null
        }
        Returns: {
          pedido_id: number
          codigo: string
          subtotal: number
          costo_envio: number
          descuento: number
          total: number
        }[]
      }
      /** Idempotente: no revela si el correo ya estaba suscrito (0013). */
      suscribir_newsletter: {
        Args: { p_email: string }
        Returns: undefined
      }
    }
    Enums: {
      estado_reserva: EstadoReserva
      usuario_rol: UsuarioRol
      entrega_pedido: EntregaPedido
      metodo_pago_pedido: MetodoPagoPedido
      estado_pedido: EstadoPedido
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
