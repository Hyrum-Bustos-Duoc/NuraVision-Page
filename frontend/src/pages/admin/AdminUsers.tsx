import { useMemo, useState } from 'react'
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useToast } from '@/shared/state/Toast'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { useUsuarios } from '@/modules/usuarios/ui/useUsuarios'
import { useEquipoGestion } from '@/modules/profesionales/ui/useEquipoGestion'
import {
  ETIQUETA_ROL,
  ROLES,
  type DatosPerfil,
  type NuevaCuenta,
  type Usuario,
  type UsuarioRol,
} from '@/modules/usuarios/application'
import { Modal, ConfirmDialog } from '@/shared/ui/Modal'
import { Button, FilterPills } from '@/shared/ui/ui'
import { SelectField, TextField } from '@/shared/ui/form'
import { formatLongDate } from '@/shared/lib/format'

const ESTILO_ROL: Record<UsuarioRol, string> = {
  cliente: 'border-line bg-ivory text-muted',
  profesional: 'border-olive-300 bg-olive-50 text-olive-700',
  admin: 'border-[#d9c7b2] bg-[#f6efe4] text-[#8a6a3d]',
}

/** Borrador del alta. Una cuenta nueva necesita credenciales; editar, no. */
const ALTA_VACIA: NuevaCuenta = {
  email: '',
  password: '',
  nombre: '',
  telefono: '',
  rol: 'cliente',
  profesionalId: undefined,
}

export default function AdminUsers() {
  /**
   * La lista sale de `public.perfiles`, no de `auth.users`: esa tabla exige la
   * service_role key, que no puede viajar al navegador. 0010 replica en
   * `perfiles` lo que el panel necesita —correo, rol, ficha— y un trigger la
   * mantiene al dia, de modo que TODA cuenta que se registre aparece aqui sin
   * que la aplicacion tenga que acordarse de escribirla.
   *
   * Solo se consulta con sesion de personal: sin `es_staff`, RLS devuelve una
   * lista vacia y la pantalla no tendria como distinguirla de "no hay nadie".
   */
  const { usuario, cargando: cargandoSesion } = useAuth()
  const esStaff = usuario?.esStaff === true
  const gestion = useUsuarios(esStaff)

  // El equipo, solo para poder nombrar la ficha de cada cuenta de profesional.
  const equipo = useEquipoGestion()
  const nombrePorFicha = useMemo(
    () => Object.fromEntries(equipo.equipo.map((p) => [p.id, p.nombre])),
    [equipo.equipo],
  )

  const { toast } = useToast()
  const [filtro, setFiltro] = useState<UsuarioRol | 'todos'>('todos')
  const [editando, setEditando] = useState<{ usuario: Usuario; borrador: DatosPerfil } | null>(null)
  const [creando, setCreando] = useState<NuevaCuenta | null>(null)
  const [borrando, setBorrando] = useState<Usuario | null>(null)

  const visibles = useMemo(
    () =>
      filtro === 'todos'
        ? gestion.usuarios
        : gestion.usuarios.filter((u) => u.rol === filtro),
    [gestion.usuarios, filtro],
  )

  const cuentas = useMemo(() => {
    const porRol = Object.fromEntries(
      ROLES.map((r) => [r, gestion.usuarios.filter((u) => u.rol === r).length]),
    ) as Record<UsuarioRol, number>
    return { todos: gestion.usuarios.length, ...porRol }
  }, [gestion.usuarios])

  async function guardarPerfil(borrador: DatosPerfil, id: string) {
    const motivo = await gestion.actualizar(id, borrador)
    if (motivo !== null) {
      toast({ title: 'No se guardó el usuario', description: motivo, tone: 'error' })
      return
    }
    toast({ title: 'Usuario actualizado', description: borrador.nombre, tone: 'success' })
    setEditando(null)
  }

  async function crearCuentaNueva(datos: NuevaCuenta) {
    const motivo = await gestion.crear(datos)
    if (motivo !== null) {
      toast({ title: 'No se creó la cuenta', description: motivo, tone: 'error' })
      return
    }
    toast({
      title: 'Cuenta creada',
      description: `${datos.nombre} ya puede iniciar sesión con ${datos.email}.`,
      tone: 'success',
    })
    setCreando(null)
  }

  if (cargandoSesion) return null

  // Sin sesion de personal la tabla saldria vacia por RLS, que es indistinguible
  // de "no hay usuarios". Se dice lo que pasa en vez de enseñar un vacio.
  if (!esStaff) {
    return (
      <div className="animate-fade-up">
        <h1 className="font-serif-display text-3xl text-ink">Usuarios y roles</h1>
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted"
        >
          Se requieren permisos de personal del estudio para ver y gestionar las cuentas. Inicia
          sesión con una cuenta marcada como <code>es_staff</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-3xl text-ink">Usuarios y roles</h1>
          <p className="mt-1 text-sm text-muted">
            Administra quién accede a NuraVision y con qué permisos.
          </p>
        </div>
        <Button onClick={() => setCreando({ ...ALTA_VACIA })}>
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      <div className="mt-6">
        <FilterPills
          options={[
            { value: 'todos', label: `Todos (${cuentas.todos})` },
            ...ROLES.map((r) => ({ value: r, label: `${ETIQUETA_ROL[r]} (${cuentas[r]})` })),
          ]}
          value={filtro}
          onChange={(v) => setFiltro(v as UsuarioRol | 'todos')}
        />
      </div>

      {gestion.cargando && <EsqueletoTabla />}

      {!gestion.cargando && gestion.error && (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted"
        >
          No pudimos cargar los usuarios: {gestion.error}
        </p>
      )}

      {!gestion.cargando && !gestion.error && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line-soft bg-paper">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft bg-ivory/60 text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium">Contacto</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">Registro</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {visibles.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-ivory/70">
                  <td className="px-6 py-4">
                    <p className="font-medium text-ink">{u.nombre}</p>
                    {u.profesionalId && (
                      <p className="text-xs text-muted">
                        Ficha: {nombrePorFicha[u.profesionalId] ?? `#${u.profesionalId}`}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-ink">{u.email ?? '—'}</p>
                    <p className="text-xs text-muted">{u.telefono ?? '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${ESTILO_ROL[u.rol]}`}
                    >
                      {u.rol === 'admin' && <ShieldCheck className="h-3.5 w-3.5" />}
                      {ETIQUETA_ROL[u.rol]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted first-letter:uppercase">
                    {formatLongDate(u.creadoEn.slice(0, 10))}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() =>
                          setEditando({
                            usuario: u,
                            borrador: { nombre: u.nombre, telefono: u.telefono ?? '', rol: u.rol },
                          })
                        }
                        aria-label={`Editar a ${u.nombre}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-ivory"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={() => setBorrando(u)}
                        disabled={u.id === usuario?.id}
                        title={
                          u.id === usuario?.id ? 'No puedes eliminar tu propia cuenta.' : undefined
                        }
                        aria-label={`Eliminar a ${u.nombre}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted">
                    No hay usuarios con este rol.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creando && (
        <ModalAlta
          inicial={creando}
          equipo={equipo.equipo.map((p) => ({ value: p.id, label: p.nombre }))}
          guardando={gestion.guardando}
          onClose={() => setCreando(null)}
          onSave={(datos) => void crearCuentaNueva(datos)}
        />
      )}

      {editando && (
        <ModalPerfil
          key={editando.usuario.id}
          usuario={editando.usuario}
          inicial={editando.borrador}
          guardando={gestion.guardando}
          onClose={() => setEditando(null)}
          onSave={(borrador) => void guardarPerfil(borrador, editando.usuario.id)}
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
            toast({
              title: 'Usuario eliminado',
              description: objetivo.nombre,
              tone: 'info',
            })
          })
        }}
        title="Eliminar usuario"
        confirmLabel="Eliminar"
        description={
          <div className="space-y-3">
            <p>
              Se eliminará la cuenta de{' '}
              <strong className="text-ink">{borrando?.nombre}</strong> y no podrá
              volver a iniciar sesión. Sus reservas anteriores se conservan.
            </p>
            {/* Se dice que es irreversible porque lo es: elimina la cuenta de
                auth.users, no solo su perfil. Suspender el acceso sin borrarlo
                necesitaria `banned_until`, que todavia no esta implementado. */}
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
              Esta acción no se puede deshacer y requiere que la función{' '}
              <code>admin-cuentas</code> esté desplegada en Supabase.
            </p>
          </div>
        }
      />
    </div>
  )
}

function EsqueletoTabla() {
  return (
    <div className="mt-6 rounded-2xl border border-line-soft bg-paper p-6" aria-busy="true">
      {[0, 1, 2, 3, 4].map((fila) => (
        <div
          key={fila}
          className="flex items-center gap-4 border-b border-line-soft py-4 last:border-0"
        >
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-line-soft" />
            <div className="h-3 w-56 animate-pulse rounded bg-line-soft" />
          </div>
          <div className="h-6 w-24 animate-pulse rounded-full bg-line-soft" />
        </div>
      ))}
      <p className="pt-4 text-sm text-muted">Cargando los usuarios…</p>
    </div>
  )
}

/**
 * Alta de cuenta.
 *
 * Es un formulario distinto del de edicion y no el mismo con campos de mas: al
 * crear hacen falta credenciales, que despues no se pueden cambiar desde aqui
 * —eso es un restablecimiento de contrasenia, otra operacion— y mostrar un campo
 * de contrasenia vacio al editar invitaria a creer que lo hace.
 */
function ModalAlta({
  inicial,
  equipo,
  guardando,
  onClose,
  onSave,
}: {
  inicial: NuevaCuenta
  equipo: { value: string; label: string }[]
  guardando: boolean
  onClose: () => void
  onSave: (datos: NuevaCuenta) => void
}) {
  const [datos, setDatos] = useState<NuevaCuenta>(inicial)
  const [mostrarErrores, setMostrarErrores] = useState(false)

  const errores = useMemo(() => {
    const siguiente: Partial<Record<keyof NuevaCuenta, string>> = {}
    if (!datos.nombre.trim()) siguiente.nombre = 'El nombre es obligatorio.'
    if (!datos.email.trim()) siguiente.email = 'El correo es obligatorio.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())) {
      siguiente.email = 'El formato del correo no es válido.'
    }
    if (datos.password.length < 6) {
      siguiente.password = 'Al menos 6 caracteres.'
    }
    // Una cuenta de profesional sin ficha entra a su panel y no encuentra nada:
    // la politica de 0007 cruza `profesional_id` con las reservas.
    if (datos.rol === 'profesional' && !datos.profesionalId) {
      siguiente.profesionalId = 'Elige a qué ficha del equipo se vincula.'
    }
    return siguiente
  }, [datos])

  const set = <K extends keyof NuevaCuenta>(clave: K, valor: NuevaCuenta[K]) =>
    setDatos((previo) => ({ ...previo, [clave]: valor }))

  return (
    <Modal open title="Nuevo usuario" onClose={onClose}>
      <div className="space-y-4">
        <TextField
          label="Nombre"
          value={datos.nombre}
          onChange={(v) => set('nombre', v)}
          error={mostrarErrores ? errores.nombre : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Correo electrónico"
            value={datos.email}
            onChange={(v) => set('email', v)}
            error={mostrarErrores ? errores.email : undefined}
          />
          <TextField
            label="Contraseña inicial"
            value={datos.password}
            onChange={(v) => set('password', v)}
            hint="La persona podrá cambiarla al entrar."
            error={mostrarErrores ? errores.password : undefined}
          />
        </div>
        <TextField
          label="Teléfono"
          value={datos.telefono}
          onChange={(v) => set('telefono', v)}
        />
        <SelectField
          label="Rol"
          value={datos.rol}
          onChange={(v) => set('rol', v as UsuarioRol)}
          options={ROLES.map((r) => ({ value: r, label: ETIQUETA_ROL[r] }))}
          hint="Define a qué funcionalidades puede acceder."
        />
        {datos.rol === 'profesional' && (
          <div>
            <SelectField
              label="Ficha del equipo"
              value={datos.profesionalId ?? ''}
              onChange={(v) => set('profesionalId', v === '' ? undefined : v)}
              options={[{ value: '', label: 'Elegir…' }, ...equipo]}
              hint="Su panel mostrará la agenda de esta ficha."
            />
            {/* `SelectField` no acepta `error`, asi que el aviso va aparte en vez
                de cambiar un componente compartido por un solo caso. */}
            {mostrarErrores && errores.profesionalId && (
              <p className="mt-1.5 text-xs text-danger">{errores.profesionalId}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={guardando}>
          Cancelar
        </Button>
        <Button
          disabled={guardando}
          onClick={() => {
            setMostrarErrores(true)
            if (Object.keys(errores).length > 0) return
            onSave({
              ...datos,
              nombre: datos.nombre.trim(),
              email: datos.email.trim(),
              telefono: datos.telefono.trim(),
            })
          }}
        >
          {guardando ? 'Creando…' : 'Crear cuenta'}
        </Button>
      </div>
    </Modal>
  )
}

/** Edicion de un perfil ya existente: nombre, telefono y rol. */
function ModalPerfil({
  usuario,
  inicial,
  guardando,
  onClose,
  onSave,
}: {
  usuario: Usuario
  inicial: DatosPerfil
  guardando: boolean
  onClose: () => void
  onSave: (borrador: DatosPerfil) => void
}) {
  const [borrador, setBorrador] = useState<DatosPerfil>(inicial)
  const [mostrarError, setMostrarError] = useState(false)

  return (
    <Modal open title="Editar usuario" onClose={onClose}>
      <div className="space-y-4">
        {/* El correo se muestra y no se edita: vive en `auth.users` y cambiarlo
            es otra operacion, con su propia confirmacion por correo. Un campo
            editable aqui daria a entender que se guarda. */}
        <div className="rounded-xl border border-line-soft bg-ivory px-4 py-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted">Correo</p>
          <p className="mt-1 text-ink">{usuario.email ?? '—'}</p>
          <p className="mt-1 text-xs text-muted">
            El correo se gestiona desde la cuenta de acceso y no se edita aquí.
          </p>
        </div>

        {/* Se escriben como cadenas, sin convertir el vacio a null: la columna
            `nombre` es NOT NULL y de `telefono` no se puede saber desde aqui, asi
            que mandar null arriesga un 23502. La cadena vacia vale para las dos
            formas de la columna. */}
        <TextField
          label="Nombre"
          value={borrador.nombre}
          onChange={(v) => setBorrador({ ...borrador, nombre: v })}
          error={mostrarError && borrador.nombre.trim() === '' ? 'El nombre es obligatorio.' : undefined}
        />
        <TextField
          label="Teléfono"
          value={borrador.telefono}
          onChange={(v) => setBorrador({ ...borrador, telefono: v })}
        />
        <SelectField
          label="Rol"
          value={borrador.rol}
          onChange={(v) => setBorrador({ ...borrador, rol: v as UsuarioRol })}
          options={ROLES.map((r) => ({ value: r, label: ETIQUETA_ROL[r] }))}
          hint="Cambia la etiqueta del perfil, no los permisos reales."
        />

        {/* Dicho sin rodeos: el rol de `perfiles` es descriptivo. Quien decide lo
            que se puede hacer es `app_metadata`, que solo se escribe con la
            service_role key. Sin esta advertencia, cambiar el rol a
            "Administración" pareceria conceder acceso al panel, y no lo hace. */}
        {borrador.rol !== usuario.rol && (
          <p className="rounded-xl border border-[#f0d9a6] bg-[#fbf1de] px-4 py-3 text-xs text-[#8a6a2a]">
            Cambiar el rol aquí actualiza la ficha del usuario, pero{' '}
            <strong>no modifica sus permisos de acceso</strong>. Esos dependen de{' '}
            <code>app_metadata</code> en la cuenta de Supabase, que se asigna al crear la cuenta.
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={guardando}>
          Cancelar
        </Button>
        <Button
          disabled={guardando}
          onClick={() => {
            // La base rechazaria un nombre vacio con un 23502, cuyo mensaje no
            // explica nada. Se detiene aqui y se señala el campo.
            if (borrador.nombre.trim() === '') {
              setMostrarError(true)
              return
            }
            onSave({
              ...borrador,
              nombre: borrador.nombre.trim(),
              telefono: borrador.telefono.trim(),
            })
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  )
}
