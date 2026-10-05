/**
 * Combo "Ritual de manos completo" (spec §7): el kit que se ofrece junto con la
 * reserva. Se identifica por slug porque es el dato estable que tambien usa la
 * migracion 0013 al cargar el catalogo.
 *
 * El 15 % no se calcula aqui: lo aplica crear_pedido() en la base cuando el kit
 * se entrega en una cita de su servicio vinculado.
 */
export const SLUG_KIT_COMBO = 'kit-ritual-manos'
