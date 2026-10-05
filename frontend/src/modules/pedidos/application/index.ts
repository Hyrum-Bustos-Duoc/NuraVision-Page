/**
 * Punto de entrada de la capa de aplicacion del modulo pedidos.
 * La UI importa desde aqui y no desde los archivos sueltos.
 */
export { crearPedido } from './crear-pedido.usecase'
export {
  calcularTotales,
  costoEnvio,
  descuentoCombo,
  erroresDeEntrega,
  metodoPermitido,
  DESCUENTO_COMBO,
  ETIQUETA_ENTREGA,
  ETIQUETA_ESTADO,
  ETIQUETA_PAGO,
  ESTADOS_PEDIDO,
} from '../domain/pedido.reglas'
export {
  COSTO_DESPACHO,
  UMBRAL_DESPACHO_GRATIS,
  COMUNAS_CON_DESPACHO,
  faltaParaDespachoGratis,
  avanceDespachoGratis,
} from '../domain/despacho'
export type * from '../domain/pedido.types'
export type { PedidoRepository } from '../domain/pedido.repository'
