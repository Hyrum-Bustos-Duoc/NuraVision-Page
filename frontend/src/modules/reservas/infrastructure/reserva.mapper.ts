import type { Database, Json, Tables } from '@/shared/types/supabase'
import type { NuevaReserva, Reserva, VarianteElegida } from '../domain/reserva.types'

export type ReservaInsert = Database['public']['Tables']['reservas']['Insert']
export type ReservaRow = Tables<'reservas'>

/** "10:00:00" -> "10:00". Postgres `time` llega con segundos. */
function aHoraCorta(valor: string): string {
  const [horas = '00', minutos = '00'] = valor.split(':')
  return `${horas.padStart(2, '0')}:${minutos.padStart(2, '0')}`
}

/**
 * Entidad de dominio -> fila para insertar.
 *
 * `estado` se fija en 'pendiente' y no se recibe por parametro: es lo unico
 * que acepta la politica de RLS desde el navegador. Confirmar una hora es una
 * decision del estudio, no de quien reserva.
 */
export function toReservaInsert(nueva: NuevaReserva): ReservaInsert {
  return {
    servicio_id: Number(nueva.servicioId),
    profesional_id: Number(nueva.profesionalId),
    fecha: nueva.fecha,
    hora_inicio: nueva.horaInicio,
    hora_fin: nueva.horaFin,
    cliente_nombre: nueva.clienteNombre,
    cliente_email: nueva.clienteEmail,
    // Cadena vacia a NULL: para la base son el mismo caso (sin telefono) y
    // asi no hay que comprobar los dos.
    cliente_telefono: nueva.clienteTelefono.trim() || null,
    // Sin sesion va NULL, que es lo que la politica de insercion exige del rol
    // anonimo. Con sesion debe ser el uuid de esa misma cuenta: la politica
    // rechaza cualquier otro.
    cliente_id: nueva.clienteId,
    codigo: nueva.codigo,
    estado: 'pendiente',
    /**
     * `null` cuando el servicio no pregunta nada, que es el caso de los 17
     * actuales. Un objeto vacio obligaria a distinguir "sin variante" de
     * "variante a medio guardar" en cada lectura, y el check de 0011 solo exige
     * que, si hay algo, sea un objeto.
     */
    detalles_extra: nueva.varianteElegida
      ? { variante: { ...nueva.varianteElegida } }
      : null,
  }
}

/**
 * `detalles_extra` -> la opcion elegida, o `null`.
 *
 * Se EXPORTA porque el panel de administracion lee la misma columna de la misma
 * tabla, y una segunda copia de esta validacion podria separarse de esta: dos
 * pantallas interpretando distinto lo que se cobro es peor que un import que
 * cruza de modulo.
 *
 * La columna es una bolsa abierta y el check de 0011 solo garantiza que sea un
 * objeto, asi que aqui se valida campo por campo. Una variante incompleta se
 * descarta entera: media eleccion —etiqueta sin precio— mostraria un total
 * equivocado, y eso es peor que no mostrar la variante.
 *
 * Tolera que la columna no exista: en una base donde 0011 no se aplico llega
 * `undefined` y la reserva se lee como una sin variante.
 */
export function aVarianteElegida(valor: Json | null | undefined): VarianteElegida | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'object' || Array.isArray(valor)) return null

  const dentro = (valor as Record<string, unknown>).variante
  if (typeof dentro !== 'object' || dentro === null || Array.isArray(dentro)) return null

  const { pregunta, opcionId, etiqueta, precio } = dentro as Record<string, unknown>

  // El precio tiene que ser un numero: un "20000" en texto se sumaria como
  // cadena y el total saldria concatenado.
  if (typeof precio !== 'number' || !Number.isFinite(precio)) return null
  if (typeof etiqueta !== 'string' || etiqueta.trim() === '') return null

  return {
    pregunta: typeof pregunta === 'string' ? pregunta : '',
    // Sin id se cae a la etiqueta, que es con lo que se puede identificar la
    // eleccion aunque no se pueda cruzar con el servicio actual.
    opcionId: typeof opcionId === 'string' && opcionId !== '' ? opcionId : etiqueta.trim(),
    etiqueta: etiqueta.trim(),
    precio,
  }
}

/** Fila de la base de datos -> entidad de dominio. */
export function toReserva(row: ReservaRow): Reserva {
  return {
    id: String(row.id),
    servicioId: String(row.servicio_id),
    profesionalId: String(row.profesional_id),
    fecha: row.fecha,
    horaInicio: aHoraCorta(row.hora_inicio),
    horaFin: aHoraCorta(row.hora_fin),
    clienteNombre: row.cliente_nombre,
    clienteEmail: row.cliente_email,
    clienteTelefono: row.cliente_telefono,
    codigo: row.codigo,
    estado: row.estado,
    varianteElegida: aVarianteElegida(row.detalles_extra),
  }
}
