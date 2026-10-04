/** Categorias de la tienda. Son ids del dominio, iguales al check de 0013. */
export type CategoriaProducto = 'unas_manos' | 'cabello' | 'piel' | 'kits' | 'gift_cards'

export type InsigniaProducto = 'mas_vendido' | 'nuevo' | 'kit'

/**
 * Producto de la tienda, visto desde la aplicacion.
 *
 * `slug` es la identidad que usa la interfaz: viaja en la URL
 * (`/tienda/aceite-de-cuticula-nura`) y en el carrito. El `id` numerico de la
 * base no sale de la capa de infraestructura salvo como texto, igual que en
 * servicios.
 */
export interface Producto {
  id: string
  slug: string
  nombre: string
  categoria: CategoriaProducto
  /** "15 ml", "Aceite + crema + lima". */
  tamano: string
  /** Pesos chilenos enteros. */
  precio: number
  /** Precio tachado, o `null` si no hay. */
  precioAnterior: number | null
  imagenUrl: string | null
  insignia: InsigniaProducto | null
  /** Servicio en que el estudio lo usa, o `null` (gift card). */
  servicioId: string | null
  descripcion: string
  modoUso: string
  ingredientes: string
  /** `null` = sin control de stock. */
  stock: number | null
}

/**
 * Producto visto desde el panel de administracion.
 *
 * Trae lo que la tienda publica no necesita (`activo`, `orden`) y conserva las
 * filas con una categoria fuera del vocabulario: la tienda las descarta, pero
 * el panel tiene que mostrarlas para que alguien pueda corregirlas.
 */
export interface ProductoAdmin extends Omit<Producto, 'categoria'> {
  /** Texto tal como esta en la base. Ver `categoriaValida`. */
  categoria: string
  categoriaValida: boolean
  activo: boolean
  /** Menor primero en el catalogo. */
  orden: number
}

/** Lo que se escribe al crear o editar un producto. Todo menos el `id`. */
export interface DatosProducto {
  slug: string
  nombre: string
  categoria: CategoriaProducto
  tamano: string
  precio: number
  precioAnterior: number | null
  imagenUrl: string | null
  insignia: InsigniaProducto | null
  servicioId: string | null
  descripcion: string
  modoUso: string
  ingredientes: string
  stock: number | null
  activo: boolean
  orden: number
}
