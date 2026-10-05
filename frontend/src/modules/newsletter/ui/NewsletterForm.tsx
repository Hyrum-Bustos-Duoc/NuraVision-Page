import { useState } from 'react'
import { useToast } from '@/shared/state/Toast'
import { suscribir } from '../application/suscribir.usecase'
import { newsletterRepository } from '../infrastructure/supabase-newsletter.repository'

/** Campo del footer (spec §6.2): sin caja, solo linea inferior. */
export function NewsletterForm() {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    setEnviando(true)
    try {
      await suscribir(newsletterRepository, email)
      setEmail('')
      toast({ title: 'Listo, te suscribiste a Rituales Nura.' })
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : 'No pudimos suscribirte.', tone: 'error' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void enviar()
      }}
      className="mt-8 flex max-w-[420px] items-center gap-3 border-b border-nv-soft2 pb-2.5"
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Tu correo
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.cl"
        autoComplete="email"
        className="min-w-0 flex-1 bg-transparent text-sm text-nv-tint3 outline-none placeholder:text-nv-soft2"
      />
      <button
        type="submit"
        disabled={enviando}
        className="shrink-0 text-sm text-nv-tint3 transition-colors hover:text-nv-accent-mid disabled:opacity-50"
      >
        {enviando ? 'Enviando…' : 'Suscribirme →'}
      </button>
    </form>
  )
}
