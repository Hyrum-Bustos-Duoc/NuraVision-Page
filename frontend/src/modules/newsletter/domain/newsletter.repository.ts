export interface NewsletterRepository {
  /** Idempotente: suscribir un correo ya registrado no es un error. */
  suscribir(email: string): Promise<void>
}
