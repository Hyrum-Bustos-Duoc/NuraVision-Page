import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '@/shared/state/AppState'

/**
 * Lleva al asistente de reserva, opcionalmente con el servicio ya elegido.
 *
 * Con servicio, el asistente arranca en la eleccion de profesional ("paso 2"
 * en la spec). El borrador se REEMPLAZA, no se mezcla: un profesional o una
 * hora que quedaron de otra reserva no tienen por que valer para este servicio.
 */
export function useIniciarReserva(): (servicioId?: string | null) => void {
  const { setBookingDraft } = useAppState()
  const navigate = useNavigate()

  return useCallback(
    (servicioId?: string | null) => {
      setBookingDraft(() => (servicioId ? { serviceId: servicioId } : {}))
      navigate('/reservar')
    },
    [setBookingDraft, navigate],
  )
}
