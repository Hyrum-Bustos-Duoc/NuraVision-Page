import { supabase } from '@/shared/infrastructure/supabase/client'
import type { NewsletterRepository } from '../domain/newsletter.repository'

/**
 * Llama a suscribir_newsletter() (0013). La tabla no se toca directo: no tiene
 * permisos para el navegador, justamente para que nadie pueda leer la lista.
 */
class SupabaseNewsletterRepository implements NewsletterRepository {
  async suscribir(email: string): Promise<void> {
    const { error } = await supabase.rpc('suscribir_newsletter', { p_email: email })
    if (!error) return
    if (error.code === 'P0001') throw new Error(error.message)
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('La suscripción todavía no está disponible.')
    }
    throw new Error('No pudimos suscribirte. Inténtalo de nuevo en un rato.')
  }
}

export const newsletterRepository: NewsletterRepository = new SupabaseNewsletterRepository()
