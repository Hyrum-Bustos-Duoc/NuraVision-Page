/**
 * Puerto del aviso de confirmacion por correo.
 *
 * Va aparte de `ReservaRepository` a proposito: no habla con PostgREST sino con
 * una Edge Function, y puede fallar por un motivo que las escrituras de la tabla
 * no tienen —que la funcion no este desplegada—. Separarlo deja eso a la vista
 * en el tipo en vez de esconderlo en un mensaje de error.
 */
export interface ConfirmacionRepository {
  /**
   * Pide que se envie la confirmacion de una reserva.
   *
   * Se identifica por el `codigo` y NO por el id, porque el navegador no conoce
   * el id: la politica de 0003 no concede SELECT sobre `reservas` al rol
   * anonimo, asi que el insert no puede pedir de vuelta la fila creada. El
   * propio 0003 lo deja dicho y por eso `codigo` es unico.
   *
   * Resuelve a `true` si el correo salio, y a `false` si el envio no se pudo
   * hacer. Lo que nunca hace es lanzar: quien llama lo invoca sin esperarlo, y
   * una promesa rechazada sin nadie escuchando acaba en un error no capturado.
   */
  pedirEnvio(codigo: string): Promise<boolean>
}
