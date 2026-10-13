import { useMemo, useState } from 'react'
import { Cake, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useToast } from '@/shared/state/Toast'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { useUsuarios } from '@/modules/usuarios/ui/useUsuarios'
import { useEquipoGestion } from '@/modules/profesionales/ui/useEquipoGestion'
import {
  ETIQUETA_ROL,
  ROLES,
  VENTANA_CUMPLEANOS_DIAS,
  diasHastaCumpleanos,
  etiquetaDiasRestantes,
  proximosCumpleanos,
  type DatosPerfil,
  type NuevaCuenta,
  type Usuario,
  type UsuarioRol,
} from '@/modules/usuarios/application'
import { Modal, ConfirmDialog } from '@/shared/ui/Modal'
import { Button, FilterPills } from '@/shared/ui/ui'
import { SelectField, TextField } from '@/shared/ui/form'
import { fechaLocalDeInstante, formatDiaMes, formatLongDate, initialsFromName } from '@/shared/lib/format'
import { hoyISO } from '@/shared/lib/calendario'
import { CampoBusqueda } from '@/shared/ui/controles'
import { botonFila, contenedorPanel, tabla } from '@/shared/ui/nv-estilos'

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

  const [busqueda, setBusqueda] = useState('')
  const [soloCumpleanos, setSoloCumpleanos] = useState(false)
  // Fecha local del navegador, no UTC: a las 22:30 en Chile ya es mañana en UTC.
  const hoy = hoyISO()
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return gestion.usuarios.filter(
      (u) =>
        (filtro === 'todos' || u.rol === filtro) &&
        (!termino ||
          u.nombre.toLowerCase().includes(termino) ||
          (u.email ?? '').toLowerCase().includes(termino)),
    )
  }, [gestion.usuarios, filtro, busqueda])
  // El contador cuenta sobre lo ya filtrado por rol y busqueda: asi el boton
  // nunca anuncia (3) encima de «Nadie cumple años…».
  const proximos = proximosCumpleanos(filtrados, hoy)
  // Las tres condiciones a la vez; inactivo, se conserva el orden de la lista.
  const visibles = soloCumpleanos ? proximos.map((x) => x.cuenta) : filtrados

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
      <div className={contenedorPanel}>
        <h1 className="font-serif-display text-4xl text-ink">Usuarios y roles</h1>
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
    <div className={contenedorPanel}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">Usuarios y roles</h1>
          <p className="mt-2 text-sm text-muted">
            Administra quién accede a NuraVision y con qué permisos.
          </p>
        </div>
        <Button onClick={() => setCreando({ ...ALTA_VACIA })}>
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills
            options={[
              { value: 'todos', label: `Todos (${cuentas.todos})` },
              ...ROLES.map((r) => ({ value: r, label: `${ETIQUETA_ROL[r]} (${cuentas[r]})` })),
            ]}
            value={filtro}
            onChange={(v) => setFiltro(v as UsuarioRol | 'todos')}
          />
          {/* Interruptor aparte y no una pildora mas del rol: se combina con
              el rol elegido en vez de reemplazarlo. */}
          <button
            type="button"
            aria-pressed={soloCumpleanos}
            onClick={() => setSoloCumpleanos((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
              soloCumpleanos
                ? 'border-nv-accent bg-nv-accent text-nv-bg'
                : 'border-line bg-paper text-ink hover:bg-ivory'
            }`}
          >
            <Cake aria-hidden="true" className="h-4 w-4" />
            Próximos cumpleaños ({proximos.length})
          </button>
        </div>
        <CampoBusqueda
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por nombre o correo…"
          etiqueta="Buscar usuarios"
          className="w-full sm:w-72"
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
        <div className={`mt-6 ${tabla.contenedor}`}>
          {/* Cabe a 1280 px con nombre y correo largos: el ancho minimo solo
              impide que en movil se aplaste, y los textos largos hacen salto
              (nombre) o se truncan con su `title` (correo). Cumpleaños va justo
              despues del nombre para que en movil se vea sin desplazar. */}
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className={tabla.cabecera}>
                <th className={tabla.th}>Usuario</th>
                <th className={tabla.th}>Cumpleaños</th>
                <th className={tabla.th}>Contacto</th>
                <th className={tabla.th}>Rol</th>
                <th className={tabla.th}>Registro</th>
                <th className={tabla.th}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {visibles.map((u) => (
                <tr key={u.id} className={tabla.fila}>
                  <td className={tabla.td}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-olive-50 text-xs font-medium text-olive-700">
                        {initialsFromName(u.nombre)}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-medium text-ink">{u.nombre}</p>
                        {u.profesionalId && (
                          <p className="text-xs text-muted">
                            Ficha: {nombrePorFicha[u.profesionalId] ?? `#${u.profesionalId}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={tabla.td}>
                    <CeldaCumpleanos fechaNacimiento={u.fechaNacimiento} hoy={hoy} />
                  </td>
                  <td className={tabla.td}>
                    <p className="max-w-[11rem] truncate text-ink" title={u.email ?? undefined}>
                      {u.email ?? '—'}
                    </p>
                    <p className="text-xs text-muted">{u.telefono ?? '—'}</p>
                  </td>
                  <td className={tabla.td}>
                    <span
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${ESTILO_ROL[u.rol]}`}
                    >
                      {u.rol === 'admin' && <ShieldCheck className="h-3.5 w-3.5" />}
                      {ETIQUETA_ROL[u.rol]}
                    </span>
                  </td>
                  <td className={`${tabla.td} min-w-[6.5rem] text-muted first-letter:uppercase`}>
                    {/* `creado_en` es un instante UTC: cortarlo en la "T" daria el
                        dia siguiente a una cuenta creada de noche en Chile. */}
                    {formatLongDate(fechaLocalDeInstante(u.creadoEn))}
                  </td>
                  <td className={tabla.td}>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() =>
                          setEditando({
                            usuario: u,
                            borrador: { nombre: u.nombre, telefono: u.telefono ?? '', rol: u.rol },
                          })
                        }
                        aria-label={`Editar a ${u.nombre}`}
                        className={botonFila.normal}
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
                        className={botonFila.peligro}
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
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted">
                    {soloCumpleanos
                      ? `Nadie cumple años en los próximos ${VENTANA_CUMPLEANOS_DIAS} días.`
                      : busqueda
                        ? `Ningún usuario coincide con «${busqueda}».`
                        : 'No hay usuarios con este rol.'}
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

/**
 * Dia y mes del cumpleaños, sin año ni edad. Si cae dentro de la ventana, una
 * marca con los dias que faltan; el de hoy va en el acento, sin mas ruido.
 */
function CeldaCumpleanos({ fechaNacimiento, hoy }: { fechaNacimiento: string | null; hoy: string }) {
  if (fechaNacimiento === null) return <span className="text-muted">—</span>
  const dias = diasHastaCumpleanos(fechaNacimiento, hoy)
  return (
    <div className="flex flex-col items-start gap-1 whitespace-nowrap">
      <span className={dias === 0 ? 'font-medium text-ink' : 'text-ink'}>
        {formatDiaMes(fechaNacimiento)}
      </span>
      {dias <= VENTANA_CUMPLEANOS_DIAS && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            dias === 0
              ? 'border-nv-accent-line2 bg-nv-accent-wash4 text-nv-accent'
              : 'border-line-soft text-nv-muted1'
          }`}
        >
          {dias === 0 && <Cake aria-hidden="true" className="h-3 w-3" />}
          {etiquetaDiasRestantes(dias)}
        </span>
      )}
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
