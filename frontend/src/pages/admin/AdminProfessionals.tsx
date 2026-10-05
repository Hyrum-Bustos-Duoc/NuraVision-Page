import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/shared/state/Toast'
import { useEquipoGestion } from '@/modules/profesionales/ui/useEquipoGestion'
import { useServiciosGestion } from '@/modules/servicios/ui/useServiciosGestion'
import { semanaPorDefecto } from '@/modules/profesionales/infrastructure/disponibilidad.mapper'
import { MAX_EXPERIENCIA, type DatosProfesional } from '@/modules/profesionales/application'
import type { Profesional } from '@/modules/profesionales/application'
import type { Servicio } from '@/modules/servicios/application'
import { serviceCategories } from '@/modules/servicios/domain/serviceCategories'
import { ConfirmDialog, Modal } from '@/shared/ui/Modal'
import { ImageUploader } from '@/shared/components/ImageUploader'
import { AvailabilityEditor } from '@/shared/components/AvailabilityEditor'
import {
  ChipMultiSelect,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/shared/ui/form'
import { AppImage, Button, Kicker } from '@/shared/ui/ui'
import type { ServiceCategoryId, WeeklyAvailability } from '@/shared/types'
import { contenedorPanel } from '@/shared/ui/nv-estilos'

/** Lo que maneja el modal: la ficha y su horario, que son dos tablas. */
interface Borrador {
  datos: DatosProfesional
  horario: WeeklyAvailability
}

function borradorVacio(): Borrador {
  return {
    datos: {
      nombre: '',
      especialidad: '',
      avatarUrl: null,
      activo: true,
      experienciaAnios: 1,
      biografia: null,
      categoria: null,
      servicioIds: [],
    },
    horario: semanaPorDefecto(),
  }
}

export default function AdminProfessionals() {
  /**
   * El equipo sale de Supabase. Antes venia de `useAppState`, asi que dar de alta
   * a alguien se quedaba en el navegador: no aparecia en la portada, ni en
   * `/profesionales`, ni se podia reservar con esa persona.
   *
   * Desde 0010 el personal del estudio tiene politica de escritura sobre
   * `profesionales`, `profesional_servicios` y `disponibilidad`, que son las tres
   * tablas que toca una ficha.
   */
  const gestion = useEquipoGestion()
  // El catalogo, para elegir que servicios realiza cada persona.
  const catalogo = useServiciosGestion()
  const { toast } = useToast()

  const [editando, setEditando] = useState<{ id?: string; borrador: Borrador } | null>(null)
  const [borrando, setBorrando] = useState<Profesional | null>(null)

  function abrirEdicion(profesional: Profesional) {
    setEditando({
      id: profesional.id,
      borrador: {
        datos: {
          nombre: profesional.nombre,
          especialidad: profesional.especialidad,
          avatarUrl: profesional.avatarUrl,
          activo: profesional.activo,
          experienciaAnios: profesional.experienciaAnios,
          biografia: profesional.biografia,
          categoria: profesional.categoria,
          servicioIds: gestion.serviciosPorProfesional[profesional.id] ?? [],
        },
        horario: gestion.horarioPorProfesional[profesional.id] ?? semanaPorDefecto(),
      },
    })
  }

  async function guardar(borrador: Borrador, id?: string) {
    if (id) {
      const motivo = await gestion.actualizar(id, borrador.datos)
      if (motivo !== null) {
        toast({ title: 'No se guardó la ficha', description: motivo, tone: 'error' })
        return
      }

      /**
       * El horario se guarda SOLO si cambio.
       *
       * La profesional puede haberlo ajustado desde su propio panel, y reponerlo
       * en cada edicion de la ficha le borraria sus cambios sin avisar. La
       * comparacion es por contenido porque el editor devuelve un objeto nuevo en
       * cada pulsacion, asi que comparar identidades daria siempre "cambio".
       */
      const original = gestion.horarioPorProfesional[id]
      if (original && JSON.stringify(original) !== JSON.stringify(borrador.horario)) {
        const motivoHorario = await gestion.guardarHorario(id, borrador.horario)
        if (motivoHorario !== null) {
          toast({
            title: 'La ficha se guardó, el horario no',
            description: motivoHorario,
            tone: 'error',
          })
          return
        }
      }

      toast({
        title: 'Ficha actualizada',
        description: `${borrador.datos.nombre} ya está actualizada en el sitio público.`,
        tone: 'success',
      })
      setEditando(null)
      return
    }

    // El horario del editor viaja con el alta: `borradorVacio()` lo inicializa
    // con la semana por defecto, asi que si no se toca se guarda esa.
    const motivo = await gestion.crear(borrador.datos, borrador.horario)
    if (motivo !== null) {
      toast({ title: 'No se creó la ficha', description: motivo, tone: 'error' })
      return
    }

    toast({
      title: 'Profesional agregada',
      description: `${borrador.datos.nombre} ya aparece en el sitio y se puede reservar.`,
      tone: 'success',
    })
    setEditando(null)
  }

  return (
    <div className={contenedorPanel}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">Profesionales</h1>
          <p className="mt-2 text-sm text-muted">
            Equipo del estudio: la ficha, los servicios que realiza y su horario de atención.
          </p>
        </div>
        <Button onClick={() => setEditando({ borrador: borradorVacio() })}>
          <Plus className="h-4 w-4" />
          Nuevo profesional
        </Button>
      </div>

      {gestion.cargando && <EsqueletoLista />}

      {!gestion.cargando && gestion.error && (
        <p
          role="alert"
          className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted"
        >
          No pudimos cargar el equipo: {gestion.error}
        </p>
      )}

      {!gestion.cargando && !gestion.error && (
        <div className="grid gap-4">
          {gestion.equipo.map((p) => {
            const servicios = gestion.serviciosPorProfesional[p.id] ?? []
            return (
              <div
                key={p.id}
                className={`flex flex-wrap items-start gap-5 rounded-2xl border border-line-soft bg-paper p-5 ${
                  p.activo ? '' : 'opacity-55'
                }`}
              >
                <AppImage
                  src={p.avatarUrl ?? undefined}
                  label="Retrato"
                  alt={p.nombre}
                  className="aspect-[3/4] w-24 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-serif-display text-2xl text-ink">{p.nombre}</h2>
                    {!p.activo && (
                      <span className="rounded-full border border-line bg-ivory px-2.5 py-0.5 text-xs text-muted">
                        Inactiva
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted">{p.especialidad}</p>
                  <p className="mt-1 text-xs text-muted-light">
                    {p.experienciaAnios > 0
                      ? `${p.experienciaAnios} ${p.experienciaAnios === 1 ? 'año' : 'años'} de experiencia`
                      : 'Experiencia sin declarar'}
                    {' · '}
                    {servicios.length > 0 ? (
                      `${servicios.length} ${servicios.length === 1 ? 'servicio' : 'servicios'}`
                    ) : (
                      // Sin servicios asignados no se puede reservar con esta
                      // persona: el flujo la busca por la tabla puente.
                      <span className="text-danger">sin servicios asignados</span>
                    )}
                  </p>
                  {p.biografia && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{p.biografia}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => abrirEdicion(p)}
                    aria-label={`Editar a ${p.nombre}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-ivory"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => setBorrando(p)}
                    aria-label={`Eliminar a ${p.nombre}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-soft"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}

          {gestion.equipo.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
              Todavía no hay profesionales. Agrega la primera con “Nuevo profesional”.
            </p>
          )}
        </div>
      )}

      {editando && (
        <ModalProfesional
          inicial={editando.borrador}
          esNueva={!editando.id}
          servicios={catalogo.servicios}
          guardando={gestion.guardando}
          onCancel={() => setEditando(null)}
          onSave={(borrador) => void guardar(borrador, editando.id)}
        />
      )}

      <ConfirmDialog
        open={Boolean(borrando)}
        onClose={() => setBorrando(null)}
        onConfirm={() => {
          const objetivo = borrando
          if (!objetivo) return
          setBorrando(null)
          void gestion.eliminar(objetivo.id).then((motivo) => {
            if (motivo !== null) {
              toast({ title: 'No se pudo eliminar', description: motivo, tone: 'error' })
              return
            }
            toast({ title: 'Ficha eliminada', description: objetivo.nombre, tone: 'info' })
          })
        }}
        title={`Eliminar a ${borrando?.nombre ?? ''}`}
        confirmLabel="Eliminar ficha"
        description={
          <div className="space-y-3">
            <p>
              La ficha desaparecerá del sitio público y se quitarán sus servicios asignados y su
              horario.
            </p>
            {/* Igual que en servicios: no se cuentan las reservas de antemano.
                Si existen, la clave foranea impide el borrado y el mensaje de
                error propone desactivarla, que es la salida correcta. */}
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
              Si tiene reservas asociadas no se podrá eliminar. En ese caso, desmarca “Ficha activa”
              al editarla: se retira del sitio y se conserva el historial.
            </p>
            <p className="text-xs text-muted">
              Esto no elimina su cuenta de acceso. Para eso, usa la sección Usuarios.
            </p>
          </div>
        }
      />
    </div>
  )
}

function EsqueletoLista() {
  return (
    <div className="grid gap-4" aria-busy="true">
      {[0, 1, 2].map((fila) => (
        <div
          key={fila}
          className="flex gap-5 rounded-2xl border border-line-soft bg-paper p-5"
        >
          <div className="aspect-[3/4] w-24 shrink-0 animate-pulse rounded-xl bg-line-soft" />
          <div className="flex-1 space-y-3 py-2">
            <div className="h-6 w-40 animate-pulse rounded bg-line-soft" />
            <div className="h-4 w-56 animate-pulse rounded bg-line-soft" />
            <div className="h-3 w-44 animate-pulse rounded bg-line-soft" />
          </div>
        </div>
      ))}
      <p className="text-sm text-muted">Cargando el equipo…</p>
    </div>
  )
}

function ModalProfesional({
  inicial,
  esNueva,
  servicios,
  guardando,
  onCancel,
  onSave,
}: {
  inicial: Borrador
  esNueva: boolean
  servicios: Servicio[]
  guardando: boolean
  onCancel: () => void
  onSave: (borrador: Borrador) => void
}) {
  const [borrador, setBorrador] = useState<Borrador>(inicial)
  const [mostrarErrores, setMostrarErrores] = useState(false)

  /**
   * Avisos del formulario, campo por campo, para poder señalar cual esta mal. La
   * regla de verdad vive en el dominio (`motivoParaNoGuardarProfesional`) y la
   * comprueba el caso de uso, asi que nada se cuela por saltarse esto.
   */
  const errores = useMemo(() => {
    const siguiente: Partial<Record<keyof DatosProfesional, string>> = {}
    const { datos } = borrador
    if (!datos.nombre.trim()) siguiente.nombre = 'El nombre es obligatorio.'
    if (!datos.especialidad.trim()) {
      siguiente.especialidad = 'Indica la especialización (por ejemplo, “Nail artist”).'
    }
    if (datos.experienciaAnios < 0) siguiente.experienciaAnios = 'No puede ser negativo.'
    else if (datos.experienciaAnios > MAX_EXPERIENCIA) {
      siguiente.experienciaAnios = `Como máximo ${MAX_EXPERIENCIA}.`
    }
    return siguiente
  }, [borrador])

  const setDatos = <K extends keyof DatosProfesional>(clave: K, valor: DatosProfesional[K]) =>
    setBorrador((previo) => ({ ...previo, datos: { ...previo.datos, [clave]: valor } }))

  return (
    <Modal
      open
      onClose={onCancel}
      size="lg"
      title={esNueva ? 'Nueva profesional' : `Editar a ${inicial.datos.nombre}`}
      description="Ficha pública, servicios y horario de atención. Se guarda en la base de datos."
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
                datos: {
                  ...borrador.datos,
                  nombre: borrador.datos.nombre.trim(),
                  especialidad: borrador.datos.especialidad.trim(),
                },
              })
            }}
          >
            {guardando ? 'Guardando…' : esNueva ? 'Agregar profesional' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
          <ImageUploader
            label="Fotografía"
            value={borrador.datos.avatarUrl ?? undefined}
            onChange={(avatarUrl) => setDatos('avatarUrl', avatarUrl ?? null)}
            aspectClass="aspect-[3/4]"
            placeholderLabel="Retrato"
          />
          <div className="space-y-5">
            <TextField
              label="Nombre"
              value={borrador.datos.nombre}
              onChange={(v) => setDatos('nombre', v)}
              placeholder="Berenice"
              error={mostrarErrores ? errores.nombre : undefined}
            />
            <TextField
              label="Especialización"
              value={borrador.datos.especialidad}
              onChange={(v) => setDatos('especialidad', v)}
              placeholder="Estilista & Colorista Senior"
              error={mostrarErrores ? errores.especialidad : undefined}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <NumberField
                label="Años de experiencia"
                value={borrador.datos.experienciaAnios}
                onChange={(v) => setDatos('experienciaAnios', v)}
                min={0}
                suffix="años"
                error={mostrarErrores ? errores.experienciaAnios : undefined}
              />
              <SelectField
                label="Categoría"
                value={borrador.datos.categoria ?? ''}
                onChange={(v) =>
                  setDatos('categoria', v === '' ? null : (v as ServiceCategoryId))
                }
                options={[
                  { value: '', label: 'Sin categoría' },
                  ...serviceCategories.map((c) => ({ value: c.id, label: c.label })),
                ]}
                hint="Área principal en la que aparece en el sitio."
              />
            </div>
          </div>
        </div>

        <TextAreaField
          label="Reseña"
          value={borrador.datos.biografia ?? ''}
          onChange={(v) => setDatos('biografia', v === '' ? null : v)}
          rows={4}
          hint="Breve descripción visible en su ficha pública."
        />

        <label className="flex items-center gap-3 rounded-xl border border-line-soft bg-ivory px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={borrador.datos.activo}
            onChange={(e) => setDatos('activo', e.target.checked)}
            className="h-4 w-4 accent-olive-600"
          />
          <span className="text-ink">
            Ficha activa
            <span className="ml-2 text-xs text-muted">
              Si la desmarcas, deja de aparecer en el sitio y no admite reservas nuevas.
            </span>
          </span>
        </label>

        <div className="space-y-4 border-t border-line-soft pt-5">
          <ChipMultiSelect
            label="Servicios que realiza"
            options={servicios.map((s) => ({
              value: s.id,
              label: s.nombre,
              description: `${s.duracionMinutos} min`,
            }))}
            selected={borrador.datos.servicioIds}
            onChange={(v) => setDatos('servicioIds', v)}
            emptyLabel="Primero crea servicios en la sección Servicios."
          />
          {/* El precio ya NO se edita aqui. Estaba en este modal por comodidad,
              pero pertenece al catalogo: dos pantallas escribiendo la misma
              columna es una forma segura de que una pise a la otra sin que se
              note. Se edita en Servicios, que es su sitio. */}
          <p className="text-xs text-muted-light">
            El precio de cada servicio se edita en la sección Servicios, que es donde vive el
            catálogo.
          </p>
        </div>

        <div className="border-t border-line-soft pt-5">
          <Kicker>Disponibilidad</Kicker>
          <p className="mt-1 mb-3 text-xs text-muted-light">
            {esNueva
              ? 'Se guarda al crear la ficha. Por defecto, lunes a sábado de 10:00 a 19:00.'
              : 'Solo se guarda si lo modificas, para no sobrescribir los cambios que haya hecho ella desde su propio panel.'}
          </p>
          <AvailabilityEditor
            value={borrador.horario}
            onChange={(horario) => setBorrador((previo) => ({ ...previo, horario }))}
          />
        </div>
      </div>
    </Modal>
  )
}
