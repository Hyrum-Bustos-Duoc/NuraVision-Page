import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/modules/auth/ui/useAuth'
import type { Servicio } from '@/modules/servicios/application'
import { ImageUploader } from '@/shared/components/ImageUploader'
import { formatPrice } from '@/shared/lib/format'
import { useToast } from '@/shared/state/Toast'
import { ConfirmDialog, Modal } from '@/shared/ui/Modal'
import { NumberField, SelectField, TextAreaField, TextField } from '@/shared/ui/form'
import { Button } from '@/shared/ui/ui'
import {
  CATEGORIAS_PRODUCTO,
  ETIQUETA_INSIGNIA,
  SLUG_KIT_COMBO,
  esCategoria,
  etiquetaCategoria,
  motivoParaNoGuardarProducto,
  slugDesdeNombre,
  type CategoriaProducto,
  type DatosProducto,
  type InsigniaProducto,
  type ProductoAdmin,
} from '../application'
import { ProductoImagen } from './ProductoImagen'
import { useProductosGestion } from './useProductosGestion'

const TODAS = 'todas'
const NINGUNO = ''

const BORRADOR_VACIO: DatosProducto = {
  slug: '',
  nombre: '',
  categoria: 'unas_manos',
  tamano: '',
  precio: 9900,
  precioAnterior: null,
  imagenUrl: null,
  insignia: null,
  servicioId: null,
  descripcion: '',
  modoUso: '',
  ingredientes: '',
  stock: null,
  activo: true,
  orden: 100,
}

/**
 * Producto -> borrador del formulario. Una categoria heredada fuera del
 * vocabulario no se puede guardar tal cual: se propone la primera y el modal
 * avisa de cual era la original.
 */
function aBorrador(p: ProductoAdmin): DatosProducto {
  return {
    slug: p.slug,
    nombre: p.nombre,
    categoria: esCategoria(p.categoria) ? p.categoria : 'unas_manos',
    tamano: p.tamano,
    precio: p.precio,
    precioAnterior: p.precioAnterior,
    imagenUrl: p.imagenUrl,
    insignia: p.insignia,
    servicioId: p.servicioId,
    descripcion: p.descripcion,
    modoUso: p.modoUso,
    ingredientes: p.ingredientes,
    stock: p.stock,
    activo: p.activo,
    orden: p.orden,
  }
}

/**
 * Productos de la tienda (panel de administracion): alta, edicion de precios y
 * stock, activar/desactivar y borrado.
 *
 * Como en pedidos, `esStaff` solo decide que se muestra: quien permite o
 * rechaza cada escritura es la RLS de 0013.
 */
export default function AdminProductos() {
  const { usuario, cargando: cargandoSesion } = useAuth()
  const esStaff = usuario?.esStaff ?? false
  const gestion = useProductosGestion(esStaff)
  const { toast } = useToast()

  const [categoria, setCategoria] = useState<CategoriaProducto | typeof TODAS>(TODAS)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<{ producto?: ProductoAdmin; borrador: DatosProducto } | null>(null)
  const [borrando, setBorrando] = useState<ProductoAdmin | null>(null)

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return gestion.productos.filter(
      (p) =>
        (categoria === TODAS || p.categoria === categoria) &&
        (!termino || p.nombre.toLowerCase().includes(termino) || p.slug.includes(termino)),
    )
  }, [gestion.productos, categoria, busqueda])

  if (cargandoSesion) return <Aviso texto="Comprobando tu sesión…" />
  if (!usuario || !esStaff) {
    return (
      <Aviso texto="Esta sección es del personal del estudio. Inicia sesión con una cuenta marcada como personal (es_staff).">
        <Link to="/login" className="mt-4 inline-block text-sm text-ink underline underline-offset-4">
          Ir a iniciar sesión
        </Link>
      </Aviso>
    )
  }

  async function alternarActivo(p: ProductoAdmin) {
    const motivo = await gestion.actualizar(p.id, { ...aBorrador(p), activo: !p.activo })
    if (motivo !== null) {
      toast({ title: 'No se pudo cambiar el estado', description: motivo, tone: 'error' })
      return
    }
    toast({
      title: p.activo ? 'Producto oculto' : 'Producto publicado',
      description: p.activo ? `${p.nombre} ya no se ve en la tienda.` : `${p.nombre} vuelve a la tienda.`,
      tone: p.activo ? 'info' : 'success',
    })
  }

  async function guardar(borrador: DatosProducto, id?: string) {
    const motivo = id ? await gestion.actualizar(id, borrador) : await gestion.crear(borrador)
    if (motivo !== null) {
      // El modal sigue abierto para corregir sin volver a escribir todo.
      toast({ title: 'No se guardó el producto', description: motivo, tone: 'error' })
      return
    }
    toast({
      title: id ? 'Producto actualizado' : 'Producto creado',
      description: borrador.activo
        ? `${borrador.nombre} ya está en la tienda.`
        : `${borrador.nombre} quedó guardado, oculto de la tienda.`,
      tone: 'success',
    })
    setEditando(null)
  }

  const sinStock = gestion.productos.filter((p) => p.activo && p.stock === 0).length

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">Productos</h1>
          <p className="mt-2 text-sm text-muted">
            Catálogo de la tienda. Los precios que pongas aquí son los que se cobran: el pedido los
            vuelve a leer de la base al confirmarse.
            {sinStock > 0 && (
              <>
                {' '}
                Hay <strong className="text-ink">{sinStock}</strong> publicados sin stock.
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setEditando({ borrador: { ...BORRADOR_VACIO } })}>
          <Plus className="h-4 w-4" />
          Nuevo producto
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o URL…"
          aria-label="Buscar productos"
          className="w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none focus:border-ink sm:w-72"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as CategoriaProducto | typeof TODAS)}
          aria-label="Filtrar por categoría"
          className="rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink"
        >
          <option value={TODAS}>Todas las categorías</option>
          {CATEGORIAS_PRODUCTO.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={gestion.recargar}
          className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:bg-ivory"
        >
          Actualizar
        </button>
      </div>

      {gestion.cargando && <Vacio texto="Cargando productos…" />}
      {!gestion.cargando && gestion.error && <Vacio texto={gestion.error} />}
      {!gestion.cargando && !gestion.error && visibles.length === 0 && (
        <Vacio
          texto={
            gestion.productos.length === 0
              ? 'Todavía no hay productos. Crea el primero con “Nuevo producto”.'
              : 'Ningún producto coincide con el filtro.'
          }
        />
      )}

      {!gestion.cargando && !gestion.error && visibles.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line-soft bg-paper">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft bg-ivory/60 text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-4 font-medium">Producto</th>
                <th className="px-5 py-4 font-medium">Categoría</th>
                <th className="px-5 py-4 font-medium">Precio</th>
                <th className="px-5 py-4 font-medium">Stock</th>
                <th className="px-5 py-4 font-medium">Estado</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {visibles.map((p) => (
                <tr key={p.id} className={`transition-colors hover:bg-ivory/70 ${p.activo ? '' : 'opacity-55'}`}>
                  <td className="max-w-[300px] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <ProductoImagen producto={p} conEtiqueta={false} className="h-11 w-11 shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{p.nombre}</p>
                        <p className="truncate font-mono text-[11px] text-muted">/tienda/{p.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-ink">
                    {p.categoriaValida ? (
                      etiquetaCategoria(p.categoria as CategoriaProducto)
                    ) : (
                      // La tienda no muestra estas filas: hay que corregirlas aqui.
                      <span className="text-danger" title="La tienda no muestra este producto hasta corregirla">
                        «{p.categoria}» no válida
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-ink">
                    {formatPrice(p.precio)}
                    {p.precioAnterior !== null && (
                      <span className="ml-2 text-xs text-muted line-through">{formatPrice(p.precioAnterior)}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {p.stock === null ? (
                      <span className="text-muted">Sin control</span>
                    ) : (
                      <span className={p.stock === 0 ? 'text-danger' : 'text-ink'}>{p.stock}</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => void alternarActivo(p)}
                      disabled={gestion.guardando || !p.categoriaValida}
                      aria-pressed={p.activo}
                      aria-label={`${p.activo ? 'Ocultar' : 'Publicar'} ${p.nombre}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        p.activo
                          ? 'border-olive-300 bg-olive-50 text-olive-700 hover:bg-olive-100'
                          : 'border-line bg-ivory text-muted hover:bg-line-soft'
                      }`}
                    >
                      {p.activo ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {p.activo ? 'Publicado' : 'Oculto'}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditando({ producto: p, borrador: aBorrador(p) })}
                        aria-label={`Editar ${p.nombre}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-ivory"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden 2xl:inline">Editar</span>
                      </button>
                      <button
                        onClick={() => setBorrando(p)}
                        aria-label={`Eliminar ${p.nombre}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden 2xl:inline">Eliminar</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <ModalProducto
          inicial={editando.borrador}
          original={editando.producto}
          servicios={gestion.servicios}
          guardando={gestion.guardando}
          onCancel={() => setEditando(null)}
          onSave={(borrador) => void guardar(borrador, editando.producto?.id)}
        />
      )}

      {borrando && (
        <ConfirmDialog
          open
          onClose={() => setBorrando(null)}
          onConfirm={() => {
            const producto = borrando
            setBorrando(null)
            void gestion.eliminar(producto.id).then((motivo) => {
              if (motivo !== null) {
                toast({ title: 'No se pudo eliminar', description: motivo, tone: 'error' })
                return
              }
              toast({ title: 'Producto eliminado', description: producto.nombre, tone: 'info' })
            })
          }}
          title={`Eliminar “${borrando.nombre}”`}
          confirmLabel="Eliminar producto"
          description={
            <div className="space-y-3">
              <p>
                Se borra del catálogo. Los pedidos que ya lo incluyen no cambian: guardan una copia del
                nombre y del precio cobrado.
              </p>
              <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
                Si solo quieres sacarlo de la tienda por un tiempo, ocúltalo: conserva su URL, su foto y su
                historial.
              </p>
            </div>
          }
        />
      )}
    </div>
  )
}

/** Texto <-> numero opcional: vacio es `null`, lo demas se valida al guardar. */
const aTexto = (n: number | null) => (n === null ? '' : String(n))
const aNumero = (v: string) => (v.trim() === '' ? null : Number(v))

function ModalProducto({
  inicial,
  original,
  servicios,
  guardando,
  onCancel,
  onSave,
}: {
  inicial: DatosProducto
  original?: ProductoAdmin
  servicios: Servicio[]
  guardando: boolean
  onCancel: () => void
  onSave: (borrador: DatosProducto) => void
}) {
  const esNuevo = !original
  const [borrador, setBorrador] = useState<DatosProducto>(inicial)
  // En un producto nuevo la URL sigue al nombre hasta que alguien la toca. En
  // uno existente nunca cambia sola: romperia enlaces y carritos guardados.
  const [slugManual, setSlugManual] = useState(!esNuevo)
  const [mostrarErrores, setMostrarErrores] = useState(false)

  const motivo = useMemo(() => motivoParaNoGuardarProducto(borrador), [borrador])

  const set = <K extends keyof DatosProducto>(clave: K, valor: DatosProducto[K]) =>
    setBorrador((previo) => ({ ...previo, [clave]: valor }))

  const cambiaSlug = !esNuevo && borrador.slug !== original.slug

  return (
    <Modal
      open
      onClose={onCancel}
      title={esNuevo ? 'Nuevo producto' : 'Editar producto'}
      description="Los cambios se guardan en la base y se ven de inmediato en la tienda."
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            disabled={guardando}
            onClick={() => {
              if (motivo !== null) {
                setMostrarErrores(true)
                return
              }
              onSave(borrador)
            }}
          >
            {guardando ? 'Guardando…' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {original && !original.categoriaValida && (
          <Nota>
            La categoría guardada («{original.categoria}») no es de la tienda, por eso el producto no se
            muestra. Elige una y guarda.
          </Nota>
        )}

        <ImageUploader
          label="Fotografía"
          value={borrador.imagenUrl ?? undefined}
          onChange={(url) => set('imagenUrl', url ?? null)}
          aspectClass="aspect-square max-w-[220px]"
          hint="Sin foto, la tienda muestra un rayado con el nombre del producto."
        />

        <TextField
          label="Nombre"
          value={borrador.nombre}
          onChange={(v) =>
            setBorrador((previo) => ({ ...previo, nombre: v, slug: slugManual ? previo.slug : slugDesdeNombre(v) }))
          }
          placeholder="Aceite de cutícula Nura"
        />

        <TextField
          label="URL"
          value={borrador.slug}
          onChange={(v) => {
            setSlugManual(true)
            set('slug', v.toLowerCase())
          }}
          placeholder="aceite-de-cuticula-nura"
          hint={
            cambiaSlug
              ? 'Cambiar la URL rompe los enlaces compartidos y saca el producto de los carritos guardados.'
              : `Se verá en /tienda/${borrador.slug || '…'}`
          }
        />
        {cambiaSlug && original.slug === SLUG_KIT_COMBO && (
          <Nota>
            Este es el kit del banner de combo de la tienda. Con otra URL, el banner deja de mostrarse.
          </Nota>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Categoría"
            value={borrador.categoria}
            onChange={(v) => set('categoria', v)}
            options={CATEGORIAS_PRODUCTO.map((c) => ({ value: c.id, label: c.label }))}
          />
          <TextField
            label="Presentación"
            value={borrador.tamano}
            onChange={(v) => set('tamano', v)}
            placeholder="15 ml"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <NumberField
            label="Precio"
            value={borrador.precio}
            onChange={(v) => set('precio', v)}
            min={1}
            step={100}
            suffix="CLP"
          />
          <TextField
            label="Precio anterior"
            type="number"
            value={aTexto(borrador.precioAnterior)}
            onChange={(v) => set('precioAnterior', aNumero(v))}
            hint="Opcional. Se muestra tachado."
          />
          <TextField
            label="Stock"
            type="number"
            value={aTexto(borrador.stock)}
            onChange={(v) => set('stock', aNumero(v))}
            hint="Vacío = sin control."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <SelectField
            label="Insignia"
            value={borrador.insignia ?? NINGUNO}
            onChange={(v) => set('insignia', v === NINGUNO ? null : (v as InsigniaProducto))}
            options={[
              { value: NINGUNO, label: 'Ninguna' },
              ...(Object.keys(ETIQUETA_INSIGNIA) as InsigniaProducto[]).map((i) => ({
                value: i,
                label: ETIQUETA_INSIGNIA[i],
              })),
            ]}
          />
          <SelectField
            label="Lo usamos en"
            value={borrador.servicioId ?? NINGUNO}
            onChange={(v) => set('servicioId', v === NINGUNO ? null : v)}
            options={[
              { value: NINGUNO, label: 'Ningún servicio' },
              ...servicios.map((s) => ({ value: s.id, label: s.activo ? s.nombre : `${s.nombre} (inactivo)` })),
            ]}
            hint={borrador.categoria === 'kits' ? 'Un kit con servicio lleva 15 % en el combo con cita.' : undefined}
          />
          <NumberField
            label="Orden"
            value={borrador.orden}
            onChange={(v) => set('orden', v)}
            step={10}
            hint="Menor aparece primero."
          />
        </div>

        <TextAreaField
          label="Descripción"
          value={borrador.descripcion}
          onChange={(v) => set('descripcion', v)}
          rows={3}
        />
        <TextAreaField label="Cómo usar" value={borrador.modoUso} onChange={(v) => set('modoUso', v)} rows={2} />
        <TextAreaField
          label="Ingredientes clave"
          value={borrador.ingredientes}
          onChange={(v) => set('ingredientes', v)}
          rows={2}
        />

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={borrador.activo}
            onChange={(e) => set('activo', e.target.checked)}
            className="h-4 w-4 accent-current"
          />
          Publicado en la tienda
        </label>

        {mostrarErrores && motivo && (
          <p role="alert" className="text-sm text-danger">
            {motivo}
          </p>
        )}
      </div>
    </Modal>
  )
}

function Nota({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{children}</p>
}

function Aviso({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <p className="text-sm text-muted">{texto}</p>
      {children}
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">{texto}</p>
  )
}
