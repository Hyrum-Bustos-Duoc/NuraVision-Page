import { useCallback, useEffect, useState } from 'react'
import { iniciarPago } from '../application'
import { ErrorDePago } from '../domain/pago.repository'
import type { DestinoPago } from '../domain/pago.types'
import { pagoRepository } from '../infrastructure/supabase-pago.repository'
import { enviarAWebpay } from '../infrastructure/webpay.formulario'
import { recordarPagoPendiente } from '../infrastructure/pago-pendiente.storage'

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
 *
 * Excepcion: la cache de ida y vuelta (bfcache, sobre todo Safari). Si la
 * clienta pulsa «Atras» en Webpay, el navegador restaura ESTA pagina congelada
 * con `enviando` en true, y el boton se quedaria en «Redirigiendo…» para
 * siempre. `pageshow` con `persisted` avisa de esa restauracion.
 */
export function usePagoWebpay() {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yaPagado, setYaPagado] = useState(false)

  // Sincroniza con el ciclo de vida de la pagina (bfcache), externo a React.
  useEffect(() => {
    const alVolver = (evento: PageTransitionEvent) => {
      if (evento.persisted) setEnviando(false)
    }
    window.addEventListener('pageshow', alVolver)
    return () => window.removeEventListener('pageshow', alVolver)
  }, [])

  const pagar = useCallback(async (destino: DestinoPago): Promise<boolean> => {
    setEnviando(true)
    setError(null)
    setYaPagado(false)
    try {
      const inicio = await iniciarPago(pagoRepository, destino)
      // Antes de salir: la pantalla de resultado lo usa para reintentar.
      recordarPagoPendiente(destino)
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
