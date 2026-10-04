import type { NewsletterRepository } from '../domain/newsletter.repository'

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Caso de uso: suscribir un correo. Normaliza y valida antes de enviarlo. */
export async function suscribir(repositorio: NewsletterRepository, email: string): Promise<void> {
  const limpio = email.trim().toLowerCase()
  if (!CORREO.test(limpio)) throw new Error('Revisa tu correo.')
  await repositorio.suscribir(limpio)
}
