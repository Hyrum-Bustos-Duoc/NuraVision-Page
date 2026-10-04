import { NuvaAvatar } from './NuvaAvatar'
import { useNuva } from './useNuva'

/**
 * Boton flotante de Nuva (spec §12.1). Desaparece mientras el panel esta
 * abierto. En movil queda solo el avatar, para no tapar el contenido.
 */
export function NuvaLauncher() {
  const { abierto, abrir } = useNuva()
  if (abierto) return null

  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Pregúntale a Nuva, asistente de compras y reservas"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[96] flex items-center gap-3 rounded-full bg-nv-accent p-[7px] text-nv-surface shadow-launcher transition-transform duration-[250ms] hover:-translate-y-0.5 sm:bottom-6 sm:right-6 sm:pr-[18px]"
    >
      <NuvaAvatar tamano={34} tono="claro" enLinea />
      <span className="hidden text-left sm:block">
        <span className="block text-[13.5px] font-medium leading-tight">Pregúntale a Nuva</span>
        <span className="block text-[11px] leading-tight opacity-80">Compra y reserva con IA</span>
      </span>
    </button>
  )
}
