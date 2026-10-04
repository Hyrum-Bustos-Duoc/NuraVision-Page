import type { ReactNode } from 'react'

/** Rotulo sobre cada titulo de seccion (spec §2.2): 11px, mayusculas, acento. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] uppercase tracking-[0.18em] text-nv-accent ${className}`}>{children}</p>
  )
}
