import { useMemo, useState } from 'react'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/shared/state/Toast'
import { categoryLabel, serviceCategories } from '@/modules/servicios/domain/serviceCategories'
import { useServiciosGestion } from '@/modules/servicios/ui/useServiciosGestion'
import { fotoDeServicio } from '@/modules/servicios/ui/servicio.imagenes'
import { EditorVariantes } from '@/modules/servicios/ui/EditorVariantes'
import { motivoParaNoGuardarVariantes } from '@/modules/servicios/domain/servicio.reglas'
import type { DatosServicio, Servicio } from '@/modules/servicios/application'
import { Modal, ConfirmDialog } from '@/shared/ui/Modal'
import { ImageUploader } from '@/shared/components/ImageUploader'
import {
  NumberField,
  SelectField,
  StringListField,
  TextAreaField,
  TextField,
} from '@/shared/ui/form'
import { AppImage, Button } from '@/shared/ui/ui'
import { formatPrice } from '@/shared/lib/format'
import { botonFila, contenedorPanel, tabla } from '@/shared/ui/nv-estilos'
import type { ServiceCategoryId } from '@/shared/types'

const BORRADOR_VACIO: DatosServicio = {
  nombre: '',
  categoria: 'unas',
  descripcion: '',
  descripcionLarga: '',
  duracionMinutos: 60,
  precioBase: 20000,
  activo: true,
  imagenUrl: null,
  incluye: [],
  // El editor de variantes llega en el siguiente paso. Hasta entonces un
  // servicio nuevo nace sin pregunta, que es como se comportan los 17 actuales.
  variantes: null,
}

/** Entidad -> borrador del formulario. Solo quita el `id`. */
function aBorrador(servicio: Servicio): DatosServicio {
  return {
    nombre: servicio.nombre,
    categoria: servicio.categoria,
    descripcion: servicio.descripcion,
    descripcionLarga: servicio.descripcionLarga,
    duracionMinutos: servicio.duracionMinutos,
    precioBase: servicio.precioBase,
    activo: servicio.activo,
    imagenUrl: servicio.imagenUrl,
    incluye: servicio.incluye,
    // Se arrastran tal cual: el formulario todavia no las muestra, y perderlas
    // al guardar otro campo seria borrar la configuracion sin avisar.
    variantes: servicio.variantes,
  }
}

export default function AdminServices() {
  // El catalogo sale de Supabase. Antes venia de `useAppState`, que solo conoce
  // los datos de ejemplo: crear o editar un servicio se quedaba en el navegador y
  // desaparecia al recargar, mientras el catalogo publico —que si lee la base—
  // seguia mostrando otra cosa.
  const gestion = useServiciosGestion()
  const { toast } = useToast()

  const [editando, setEditando] = useState<{ id?: string; borrador: DatosServicio } | null>(null)
  const [borrando, setBorrando] = useState<Servicio | null>(null)

  /**
   * Dar de baja no borra: el servicio desaparece del catalogo de la clienta pero
   * sigue existiendo para las reservas ya tomadas y para el historial.
   */
  async function alternarActivo(servicio: Servicio) {
    const motivo = await gestion.actualizar(servicio.id, {
      ...aBorrador(servicio),
      activo: !servicio.activo,
    })

    if (motivo !== null) {
      toast({ title: 'No se pudo cambiar el estado', description: motivo, tone: 'error' })
      return
    }

    toast({
      title: servicio.activo ? 'Servicio desactivado' : 'Servicio activado',
      description: servicio.activo
        ? `${servicio.nombre} ya no admite nuevas reservas.`
        : `${servicio.nombre} vuelve a estar disponible.`,
      tone: servicio.activo ? 'info' : 'success',
    })
  }

  async function guardar(borrador: DatosServicio, id?: string) {
    const motivo = id ? await gestion.actualizar(id, borrador) : await gestion.crear(borrador)

    if (motivo !== null) {
      // El modal NO se cierra: se deja el formulario como estaba para que se
      // pueda corregir sin volver a escribirlo todo.
      toast({ title: 'No se guardó el servicio', description: motivo, tone: 'error' })
      return
    }

    toast({
      title: id ? 'Servicio actualizado' : 'Servicio creado',
      description: `${borrador.nombre} ya está en el catálogo público.`,
      tone: 'success',
    })
    setEditando(null)
  }

  return (
    <div className={contenedorPanel}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">Servicios</h1>
          <p className="mt-2 text-sm text-muted">
            Catálogo del estudio: lo que se publica aquí es lo que ven y reservan los clientes.
          </p>
        </div>
        <Button onClick={() => setEditando({ borrador: { ...BORRADOR_VACIO } })}>
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </Button>
      </div>

      {gestion.cargando && <EsqueletoTabla />}

      {!gestion.cargando && gestion.error && (
        <p
          role="alert"
          className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted"
        >
          No pudimos cargar el catálogo: {gestion.error}
        </p>
      )}

      {!gestion.cargando && !gestion.error && (
        <div className={tabla.contenedor}>
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className={tabla.cabecera}>
                <th className={tabla.th}>Servicio</th>
                <th className={tabla.th}>Categoría</th>
                <th className={tabla.th}>Duración</th>
                <th className={tabla.th}>Precio</th>
                <th className={tabla.th}>Profesionales</th>
                <th className={tabla.th}>Estado</th>
                <th className={tabla.th}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {gestion.servicios.map((s) => {
                const loRealizan = gestion.profesionalesPorServicio[s.id] ?? 0
                return (
                  <tr
                    key={s.id}
                    className={`${tabla.fila} ${s.activo ? '' : 'opacity-55'}`}
                  >
                    <td className={`${tabla.td} min-w-[260px]`}>
                      <div className="flex items-center gap-3">
                        <AppImage
                          src={fotoDeServicio(s)}
                          label={s.nombre.slice(0, 1)}
                          alt={s.nombre}
                          className="h-11 w-11 shrink-0 rounded-lg"
                        />
                        <div>
                          <p className="font-medium text-ink">{s.nombre}</p>
                          <p className="line-clamp-1 max-w-[260px] text-xs text-muted" title={s.descripcion}>
                            {s.descripcion}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={`${tabla.td} whitespace-nowrap text-ink`}>{categoryLabel(s.categoria)}</td>
                    <td className={`${tabla.td} whitespace-nowrap text-ink`}>{s.duracionMinutos} min</td>
                    <td className={`${tabla.td} whitespace-nowrap text-ink`}>{formatPrice(s.precioBase)}</td>
                    <td className={`${tabla.td} whitespace-nowrap text-muted`}>
                      {/* Un servicio que nadie realiza aparece en el catalogo y no
                          se puede reservar, porque no hay con quien. */}
                      {loRealizan > 0 ? loRealizan : <span className="text-danger">Sin asignar</span>}
                    </td>
                    <td className={tabla.td}>
                      <button
                        onClick={() => void alternarActivo(s)}
                        disabled={gestion.guardando}
                        aria-pressed={s.activo}
                        aria-label={`${s.activo ? 'Desactivar' : 'Activar'} ${s.nombre}`}
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          s.activo
                            ? 'border-olive-300 bg-olive-50 text-olive-700 hover:bg-olive-100'
                            : 'border-line bg-ivory text-muted hover:bg-line-soft'
                        }`}
                      >
                        {s.activo ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className={tabla.td}>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditando({ id: s.id, borrador: aBorrador(s) })}
                          aria-label={`Editar ${s.nombre}`}
                          className={botonFila.normal}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          onClick={() => setBorrando(s)}
                          aria-label={`Eliminar ${s.nombre}`}
                          className={botonFila.peligro}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {gestion.servicios.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-muted">
                    Todavía no hay servicios. Crea el primero con “Nuevo servicio”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <ModalServicio
          inicial={editando.borrador}
          esNuevo={!editando.id}
          guardando={gestion.guardando}
          onCancel={() => setEditando(null)}
          onSave={(borrador) => void guardar(borrador, editando.id)}
        />
      )}

      {borrando && (
        <DialogoBorrarServicio
          servicio={borrando}
          loRealizan={gestion.profesionalesPorServicio[borrando.id] ?? 0}
          onClose={() => setBorrando(null)}
          onConfirm={() => {
            const servicio = borrando
            setBorrando(null)
            void gestion.eliminar(servicio.id).then((motivo) => {
              if (motivo !== null) {
                // El caso habitual: hay reservas de este servicio y la clave
                // foranea lo impide. El repositorio traduce ese error a la
                // alternativa correcta, que es desactivarlo.
                toast({ title: 'No se pudo eliminar', description: motivo, tone: 'error' })
                return
              }
              toast({
                title: 'Servicio eliminado',
                description: servicio.nombre,
                tone: 'info',
              })
            })
          }}
        />
      )}
    </div>
  )
}

/** Hueco con la forma de la tabla, para que la pagina no salte de altura. */
function EsqueletoTabla() {
  return (
    <div className="rounded-2xl border border-line-soft bg-paper p-6" aria-busy="true">
      {[0, 1, 2, 3, 4].map((fila) => (
        <div key={fila} className="flex items-center gap-4 border-b border-line-soft py-4 last:border-0">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-line-soft" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-line-soft" />
            <div className="h-3 w-64 animate-pulse rounded bg-line-soft" />
          </div>
          <div className="h-7 w-20 animate-pulse rounded-full bg-line-soft" />
        </div>
      ))}
      <p className="pt-4 text-sm text-muted">Cargando el catálogo…</p>
    </div>
  )
}

function ModalServicio({
  inicial,
  esNuevo,
  guardando,
  onCancel,
  onSave,
}: {
  inicial: DatosServicio
  esNuevo: boolean
  guardando: boolean
  onCancel: () => void
  onSave: (borrador: DatosServicio) => void
}) {
  const [borrador, setBorrador] = useState<DatosServicio>(inicial)
  const [mostrarErrores, setMostrarErrores] = useState(false)

  /**
   * Estos avisos son los del formulario, campo por campo, para poder señalar
   * cual esta mal. La regla de verdad vive en el dominio
   * (`motivoParaNoGuardarServicio`) y la comprueba el caso de uso: si algo se
   * colara por aqui, el guardado lo detiene igual.
   */
  const errores = useMemo(() => {
    const siguiente: Partial<Record<keyof DatosServicio, string>> = {}
    if (!borrador.nombre.trim()) siguiente.nombre = 'El nombre es obligatorio.'
    if (!borrador.descripcion.trim()) {
      siguiente.descripcion = 'Escribe una descripción breve.'
    }
    if (borrador.duracionMinutos <= 0) {
      siguiente.duracionMinutos = 'La duración debe ser mayor a 0.'
    } else if (borrador.duracionMinutos % 30 !== 0) {
      // La agenda trabaja en tramos de 30 minutos; otra duracion deja huecos
      // imposibles de reservar.
      siguiente.duracionMinutos = 'Debe ser múltiplo de 30 minutos.'
    }
    if (borrador.precioBase < 0) siguiente.precioBase = 'El precio no puede ser negativo.'
    // Se reutiliza la regla del dominio en vez de repetirla: es la misma que
    // aplica el caso de uso al guardar, asi que no pueden discrepar.
    const motivoVariantes = motivoParaNoGuardarVariantes(borrador.variantes)
    if (motivoVariantes !== null) siguiente.variantes = motivoVariantes
    return siguiente
  }, [borrador])

  const set = <K extends keyof DatosServicio>(clave: K, valor: DatosServicio[K]) =>
    setBorrador((previo) => ({ ...previo, [clave]: valor }))

  return (
    <Modal
      open
      onClose={onCancel}
      title={esNuevo ? 'Nuevo servicio' : 'Editar servicio'}
      description="Los cambios se guardan en la base y se reflejan de inmediato en el catálogo público."
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            disabled={guardando}
            onClick={() => {
              if (Object.keys(errores).length > 0) {
                setMostrarErrores(true)
                return
              }
              onSave({
                ...borrador,
                nombre: borrador.nombre.trim(),
                incluye: borrador.incluye.map((i) => i.trim()).filter(Boolean),
              })
            }}
          >
            {guardando ? 'Guardando…' : esNuevo ? 'Crear servicio' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ImageUploader
          label="Fotografía"
          value={borrador.imagenUrl ?? undefined}
          onChange={(imagenUrl) => set('imagenUrl', imagenUrl ?? null)}
          hint="Si la dejas vacía, se usa una imagen elegida automáticamente según el nombre del servicio."
        />

        <TextField
          label="Nombre"
          value={borrador.nombre}
          onChange={(v) => set('nombre', v)}
          placeholder="Manicure Ritual Nura"
          error={mostrarErrores ? errores.nombre : undefined}
        />

        <div className="grid gap-5 sm:grid-cols-3">
          <SelectField
            label="Categoría"
            value={borrador.categoria}
            onChange={(v) => set('categoria', v as ServiceCategoryId)}
            options={serviceCategories.map((c) => ({ value: c.id, label: c.label }))}
          />
          <NumberField
            label="Duración"
            value={borrador.duracionMinutos}
            onChange={(v) => set('duracionMinutos', v)}
            min={30}
            step={30}
            suffix="min"
            error={mostrarErrores ? errores.duracionMinutos : undefined}
          />
          <NumberField
            label="Precio"
            value={borrador.precioBase}
            onChange={(v) => set('precioBase', v)}
            step={1000}
            suffix="CLP"
            error={mostrarErrores ? errores.precioBase : undefined}
          />
        </div>

        <TextField
          label="Descripción breve"
          value={borrador.descripcion}
          onChange={(v) => set('descripcion', v)}
          placeholder="Limado, cutículas, hidratación profunda y esmaltado a elección."
          hint="Se muestra en las tarjetas del catálogo."
          error={mostrarErrores ? errores.descripcion : undefined}
        />

        <TextAreaField
          label="Descripción completa"
          value={borrador.descripcionLarga}
          onChange={(v) => set('descripcionLarga', v)}
          rows={4}
          hint="Aparece en la página de detalle del servicio."
        />

        <StringListField
          label="Incluye"
          values={borrador.incluye}
          onChange={(v) => set('incluye', v)}
          placeholder="Agregar ítem"
          hint="Lista de lo que contempla el servicio."
        />

        <EditorVariantes
          valor={borrador.variantes}
          onChange={(variantes) => set('variantes', variantes)}
          mostrarErrores={mostrarErrores}
        />

        {/* El editor marca en rojo los campos vacios, pero hay motivos que no
            pertenecen a un campo concreto —dos opciones con el mismo nombre— y
            sin esto no se verian en ninguna parte. */}
        {mostrarErrores && errores.variantes && (
          <p role="alert" className="text-sm text-danger">
            {errores.variantes}
          </p>
        )}
      </div>
    </Modal>
  )
}

function DialogoBorrarServicio({
  servicio,
  loRealizan,
  onClose,
  onConfirm,
}: {
  servicio: Servicio
  loRealizan: number
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Eliminar “${servicio.nombre}”`}
      confirmLabel="Eliminar servicio"
      description={
        <div className="space-y-3">
          <p>
            El servicio dejará de aparecer en el catálogo y se quitará de los profesionales que lo
            realizan.
          </p>
          {loRealizan > 0 && (
            <p>
              Lo realizan{' '}
              <strong className="text-ink">
                {loRealizan} {loRealizan === 1 ? 'profesional' : 'profesionales'}
              </strong>
              .
            </p>
          )}
          {/* No se cuentan las reservas de antemano: eso serian dos consultas mas
              para adivinar algo que la base ya sabe. Si hay reservas, la clave
              foranea impide el borrado y el mensaje de error propone
              desactivarlo, que es la salida correcta. */}
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
            Si el servicio tiene reservas asociadas no se podrá eliminar. En ese caso, desactívalo
            para retirarlo del catálogo sin perder el historial.
          </p>
        </div>
      }
    />
  )
}
