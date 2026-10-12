import { useCallback, useState } from 'react'
import { iniciarPago } from '../application'
import { ErrorDePago } from '../domain/pago.repository'
import type { DestinoPago } from '../domain/pago.types'
import { pagoRepository } from '../infrastructure/supabase-pago.repository'
import { enviarAWebpay } from '../infrastructure/webpay.formulario'

/**
 * Lleva a la clienta a pagar con Webpay.
 *
 * ----------------------------------------------------------------------------
 * `enviando` NO SE APAGA AL TERMINAR BIEN
 * ----------------------------------------------------------------------------
 * Cuando el inicio funciona, el navegador se va a Webpay. Apagar el indicador
 * ahi dejaria el boton otra vez activo durante el instante que tarda la
 * navegacion, y un segundo clic abriria un cobro mas. Se apaga solo cuando algo
 * falla, que es el unico caso en el que la clienta se queda en esta pagina.
 */
export function usePagoWebpay() {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yaPagado, setYaPagado] = useState(false)

  const pagar = useCallback(async (destino: DestinoPago): Promise<boolean> => {
    setEnviando(true)
    setError(null)
    setYaPagado(false)
    try {
      const inicio = await iniciarPago(pagoRepository, destino)
      enviarAWebpay(inicio)
      return true
    } catch (e: unknown) {
      // "Ya esta pagado" no es un error que haya que resolver: se distingue para
      // que la pantalla pueda decirlo en vez de alarmar.
      if (e instanceof ErrorDePago && e.yaPagado) setYaPagado(true)
      setError(
        e instanceof Error ? e.message : 'No pudimos conectar con la pasarela de pago.',
      )
      setEnviando(false)
      return false
    }
  }, [])

  return { pagar, enviando, error, yaPagado }
}
