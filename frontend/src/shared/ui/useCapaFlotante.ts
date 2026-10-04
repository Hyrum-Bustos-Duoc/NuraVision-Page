import { useEffect, useRef, type RefObject } from 'react'

/**
 * Comportamiento comun de una capa que se abre sobre la pagina (drawer del
 * carrito, panel de Nuva):
 *
 *   · Escape la cierra.
 *   · Al abrir, el foco va al elemento indicado; al cerrar, vuelve a donde
 *     estaba. Sin esto, quien navega con teclado queda al principio de la
 *     pagina cada vez que cierra el carrito.
 *   · Opcionalmente bloquea el scroll del fondo.
 */
export function useCapaFlotante<T extends HTMLElement>(
  abierta: boolean,
  onCerrar: () => void,
  opciones: { bloquearScroll?: boolean } = {},
): RefObject<T | null> {
  const foco = useRef<T>(null)
  const { bloquearScroll = false } = opciones

  useEffect(() => {
    if (!abierta) return

    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null

    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }

    document.addEventListener('keydown', alPresionar)
    const overflowPrevio = document.body.style.overflow
    if (bloquearScroll) document.body.style.overflow = 'hidden'
    foco.current?.focus()

    return () => {
      document.removeEventListener('keydown', alPresionar)
      if (bloquearScroll) document.body.style.overflow = overflowPrevio
      anterior?.focus()
    }
  }, [abierta, onCerrar, bloquearScroll])

  return foco
}
