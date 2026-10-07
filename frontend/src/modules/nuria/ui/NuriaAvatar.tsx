/**
 * La "N" en italica de Nuria. `tono="claro"` es el del launcher (circulo blanco,
 * letra acento); el normal, circulo acento y letra clara.
 */
export function NuriaAvatar({
  tamano = 24,
  tono = 'acento',
  enLinea = false,
}: {
  tamano?: number
  tono?: 'acento' | 'claro'
  enLinea?: boolean
}) {
  const colores = tono === 'claro' ? 'bg-nv-surface text-nv-accent' : 'bg-nv-accent text-nv-bg'
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-serif italic ${colores}`}
      style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.56) }}
    >
      N
      {enLinea && (
        <span className="absolute -right-0.5 -top-0.5 h-[9px] w-[9px] rounded-full border-2 border-nv-accent bg-nv-online" />
      )}
    </span>
  )
}
