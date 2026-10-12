/**
 * Ayudas para invocar Edge Functions.
 *
 * ----------------------------------------------------------------------------
 * EL PUNTO CIEGO QUE ESTO TAPA
 * ----------------------------------------------------------------------------
 * `supabase.functions.invoke` NO parsea el cuerpo de la respuesta cuando el
 * estado no es 2xx: deja `data` en null y en `error.message` un texto generico
 * —"Edge Function returned a non-2xx status code"— que no dice nada.
 *
 * El motivo real viene en el cuerpo, y la libreria lo adjunta como un `Response`
 * en `error.context`. Sin leerlo, "Esto ya esta pagado" o "El pedido no existe"
 * llegarian a la pantalla como "non-2xx status code", y habria que ir a los
 * registros de Supabase para averiguar algo que ya venia en la respuesta.
 *
 * Importa especialmente en el flujo de pago: ahi el mensaje del servidor es lo
 * unico que le explica a la clienta por que no se pudo cobrar.
 */

/**
 * Saca el mensaje que escribio la funcion.
 *
 * Se clona el `Response` antes de leerlo porque su cuerpo se consume una sola
 * vez, y quien llame despues se encontraria con un flujo vacio.
 */
export async function motivoDeFuncion(error: unknown): Promise<string> {
  if (error === null || typeof error !== 'object' || !('context' in error)) return ''
  const contexto = (error as { context?: unknown }).context
  if (!(contexto instanceof Response)) return ''

  try {
    const cuerpo: unknown = await contexto.clone().json()
    if (cuerpo !== null && typeof cuerpo === 'object' && 'error' in cuerpo) {
      const dentro = (cuerpo as { error: unknown }).error
      if (typeof dentro === 'string' && dentro.trim() !== '') return dentro
    }
  } catch {
    // La respuesta puede no ser JSON: un 502 de la plataforma, por ejemplo.
  }
  return ''
}

/**
 * El cuerpo de una respuesta que no fue 2xx, parseado.
 *
 * Hace falta cuando el fallo trae datos y no solo un mensaje —el caso de
 * `{ error, yaPagado: true }`—, porque `data` llega en null y esa informacion se
 * perderia.
 */
export async function cuerpoDeFuncion<T>(error: unknown): Promise<T | null> {
  if (error === null || typeof error !== 'object' || !('context' in error)) return null
  const contexto = (error as { context?: unknown }).context
  if (!(contexto instanceof Response)) return null

  try {
    return (await contexto.clone().json()) as T
  } catch {
    return null
  }
}
