import { useCallback, useState } from 'react'
import { crearReserva, enviarConfirmacion } from '../application'
import type { NuevaReserva } from '../domain/reserva.types'
import { reservaRepository } from '../infrastructure/supabase-reserva.repository'
import { confirmacionRepository } from '../infrastructure/supabase-confirmacion.repository'

interface EstadoCrearReserva {
  /** Resuelve a `true` si la reserva quedo guardada. */
  crear: (nueva: NuevaReserva) => Promise<boolean>
  guardando: boolean
  error: string | null
  /**
   * Como fue el correo de confirmacion: `null` mientras viaja, `true` si salio,
   * `false` si no se pudo enviar.
   *
   * Se expone para que la pantalla de exito diga la verdad. Antes afirmaba "te
   * enviamos el detalle a tu correo" sin que existiera ningun envio, y ahora que
   * existe puede fallar: prometerlo igual seria mandar a alguien a revisar una
   * bandeja donde no hay nada.
   */
  correoEnviado: boolean | null
}

/**
 * Guarda una reserva en la base de datos.
 *
 * Devuelve un booleano en vez de propagar la excepcion para que quien llama
 * decida que hacer sin envolver todo en try/catch; el detalle del fallo queda
 * en `error`.
 */
export function useCrearReserva(): EstadoCrearReserva {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [correoEnviado, setCorreoEnviado] = useState<boolean | null>(null)

  const crear = useCallback(async (nueva: NuevaReserva): Promise<boolean> => {
    setGuardando(true)
    setError(null)
    setCorreoEnviado(null)
    try {
      await crearReserva(reservaRepository, nueva)

      /**
       * El correo se pide SIN ESPERARLO.
       *
       * `void` en vez de `await`: la reserva ya esta guardada y el correo es un
       * aviso, no parte de la operacion. Esperar al proveedor dejaria a la
       * clienta mirando un boton de "Confirmando…" durante uno o dos segundos por
       * algo que no cambia el resultado.
       *
       * Se identifica por el codigo porque el navegador no conoce el id: la
       * politica de 0003 no concede SELECT sobre `reservas`, asi que el insert no
       * puede pedir de vuelta la fila creada.
       *
       * `pedirEnvio` nunca lanza, de modo que esta promesa sin esperar no puede
       * acabar en un rechazo no capturado.
       */
      void enviarConfirmacion(confirmacionRepository, nueva.codigo).then(setCorreoEnviado)

      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la reserva.')
      return false
    } finally {
      setGuardando(false)
    }
  }, [])

  return { crear, guardando, error, correoEnviado }
}
