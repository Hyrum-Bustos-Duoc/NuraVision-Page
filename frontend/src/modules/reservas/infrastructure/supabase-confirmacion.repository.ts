import { supabase } from '@/shared/infrastructure/supabase/client'
import type { ConfirmacionRepository } from '../domain/confirmacion.repository'

/**
 * Invoca la Edge Function `enviar-confirmacion-reserva`.
 *
 * Solo viaja el codigo. Todo lo que aparece en el correo —el nombre, la
 * direccion de destino, el servicio, la hora, el precio— lo lee la funcion de la
 * base con la service_role key. Mandarlo desde aqui seria un agujero: se invoca
 * con la anon key, que es publica, y cualquiera podria hacer que el estudio
 * enviara un correo con el texto que quisiera a donde quisiera.
 *
 * El envio no se puede repetir: la funcion reclama la reserva con un UPDATE
 * condicional sobre `confirmacion_enviada_en` (0012) antes de llamar al
 * proveedor. Una segunda llamada responde que ya salio, sin enviar nada.
 */
const FUNCION = 'enviar-confirmacion-reserva'

/**
 * Recupera el mensaje que devolvio la funcion.
 *
 * Hace falta porque `functions.invoke` NO parsea el cuerpo cuando la respuesta
 * no es 2xx: deja `data` en null y en `error.message` un texto generico —"Edge
 * Function returned a non-2xx status code"— que no dice nada. El motivo real
 * viene en el cuerpo, y la libreria lo adjunta como `Response` en
 * `error.context`.
 *
 * Sin esto, un rechazo del proveedor por dominio sin verificar se registraria
 * como "non-2xx" y habria que ir a los registros de Supabase para averiguar algo
 * que ya venia en la respuesta.
 *
 * Se clona antes de leer: el cuerpo de una `Response` se consume una sola vez.
 */
async function motivoDelServidor(error: unknown): Promise<string> {
  if (error === null || typeof error !== 'object' || !('context' in error)) return ''
  const contexto = (error as { context?: unknown }).context
  if (!(contexto instanceof Response)) return ''

  try {
    const cuerpo: unknown = await contexto.clone().json()
    if (cuerpo !== null && typeof cuerpo === 'object' && 'error' in cuerpo) {
      const dentro = (cuerpo as { error: unknown }).error
      if (typeof dentro === 'string') return dentro
    }
    return ''
  } catch {
    // La respuesta puede no ser JSON (un 502 de la plataforma, por ejemplo).
    return ''
  }
}

class EdgeConfirmacionRepository implements ConfirmacionRepository {
  async pedirEnvio(codigo: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke<{
        enviada?: boolean
        yaEnviada?: boolean
        error?: string
      }>(FUNCION, { body: { codigo } })

      if (error) {
        /**
         * El fallo se registra y no se propaga.
         *
         * La reserva YA esta guardada cuando esto corre: el correo es un aviso,
         * no parte de la operacion. Interrumpir a la clienta con un error por
         * algo que no depende de ella —y que no cambia que su hora esta tomada—
         * seria alarmarla sin motivo.
         *
         * Que no se pierda: `confirmacion_enviada_en` queda en NULL, asi que el
         * estudio puede ver en el panel las reservas cuyo correo no salio.
         */
        const motivo = (await motivoDelServidor(error)) || data?.error || error.message
        console.error(`[${FUNCION}] no se pudo enviar la confirmacion: ${motivo}`)
        return false
      }

      // `yaEnviada` no es un fallo: significa que la confirmacion salio antes.
      return data?.enviada === true || data?.yaEnviada === true
    } catch (e: unknown) {
      // Una caida de red no debe convertirse en una promesa rechazada: quien
      // llama no la espera, y nadie recogeria el rechazo.
      console.error(`[${FUNCION}] la invocacion fallo:`, e)
      return false
    }
  }
}

export const confirmacionRepository: ConfirmacionRepository = new EdgeConfirmacionRepository()
