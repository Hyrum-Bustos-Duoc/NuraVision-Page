import { ArrowUp } from 'lucide-react'
import { PROMPTS_DESTACADOS } from '../domain/nuva.motor'
import { NuvaAvatar } from './NuvaAvatar'
import { useNuva } from './useNuva'

/** Tarjeta de prompts del hero (spec §6). */
export function TarjetaNuvaHero() {
  const { enviar } = useNuva()
  return (
    <div className="mt-8 max-w-[520px] rounded-[14px] border border-nv-line2 bg-nv-surface px-4 py-3.5">
      <p className="flex items-center gap-2 text-[13px] text-nv-soft1">
        <NuvaAvatar tamano={24} />
        <span>
          <strong className="font-medium text-nv-ink">Nuva</strong> · pídele lo que necesitas y ella compra o
          reserva por ti
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROMPTS_DESTACADOS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => enviar(prompt)}
            className="rounded-full bg-nv-paper2 px-3 py-[7px] text-left text-[12.5px] text-nv-ink4 transition-colors hover:bg-nv-accent-wash4 hover:text-nv-accent"
          >
            “{prompt}”
          </button>
        ))}
      </div>
    </div>
  )
}

/** Banda "Dile qué necesitas. Ella compra y reserva." (spec §6.1). */
export function BandaNuva() {
  const { enviar, abrir } = useNuva()
  return (
    <section className="grid items-center gap-8 rounded-lg bg-nv-ink px-6 py-9 text-nv-tint3 sm:px-12 sm:py-11 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-12">
      <div>
        <p className="mb-[18px] flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-nv-accent-mid">
          <NuvaAvatar tamano={30} />
          Nuva · asistente con IA
        </p>
        <h2 className="font-serif text-[clamp(38px,4.2vw,56px)] font-light leading-none tracking-[-0.02em] text-nv-bg">
          Dile qué necesitas.
          <br />
          <em className="text-nv-accent-mid">Ella compra y reserva.</em>
        </h2>
        <p className="mt-5 max-w-[420px] text-[14.5px] leading-[1.55] text-nv-faint2">
          Nuva conoce el catálogo, la agenda de cada profesional y tu carrito. Pide en tus palabras.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={abrir}
          className="flex w-full cursor-text items-center justify-between gap-3 rounded-full bg-nv-bg py-2 pl-[22px] pr-2 text-left text-[15px] text-nv-soft1 transition-shadow duration-200 hover:shadow-[0_0_0_3px_var(--nv-accent-mid)]"
        >
          Pregúntale a Nuva…
          <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-nv-accent text-nv-bg">
            <ArrowUp className="h-4 w-4" />
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          {PROMPTS_DESTACADOS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => enviar(prompt)}
              className="rounded-full border border-nv-ink3 px-3.5 py-[9px] text-left text-[13px] text-nv-tint3 transition-colors duration-200 hover:border-nv-accent-mid hover:text-nv-surface"
            >
              “{prompt}”
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
