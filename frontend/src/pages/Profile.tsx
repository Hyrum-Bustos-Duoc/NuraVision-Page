import { useId, useRef, useState, type InputHTMLAttributes, type Ref } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/modules/auth/ui/useAuth'
import {
  validarPerfilPropio,
  type BorradorPerfil,
  type CampoPerfil,
  type DatosPersonales,
  type ErroresPerfil,
} from '@/modules/usuarios/application'
import { useMiPerfil } from '@/modules/usuarios/ui/useMiPerfil'
import { FECHA_NACIMIENTO_MINIMA, hoyISO, sumarMeses } from '@/shared/lib/calendario'
import { useToast } from '@/shared/state/Toast'
import { SelectorFecha } from '@/shared/ui/SelectorFecha'
import { Button } from '@/shared/ui/ui'

/**
 * «Mi perfil» con la sesion real (openspec/changes/perfil-editable-cliente).
 *
 * Lee la fila propia de `perfiles` y guarda por `actualizar_mi_perfil`, la
 * unica via por la que una cuenta corrige sus datos (0017 cerro el UPDATE
 * directo). El correo vive en Supabase Auth y aqui solo se muestra.
 */
export default function Profile() {
  const { usuario, cargando, refrescarSesion } = useAuth()

  // Mientras se restaura la sesion guardada `usuario` todavia es null: redirigir
  // ahi echaria al login a quien si tiene sesion.
  if (cargando) return <Aviso texto="Cargando tu perfil…" />
  if (!usuario) return <Navigate to={`/login?volver=${encodeURIComponent('/perfil')}`} replace />

  return (
    <MiPerfil
      key={usuario.id}
      usuarioId={usuario.id}
      email={usuario.email}
      refrescarSesion={refrescarSesion}
    />
  )
}

function MiPerfil({
  usuarioId,
  email,
  refrescarSesion,
}: {
  usuarioId: string
  email: string
  refrescarSesion: () => Promise<void>
}) {
  const { estado, recargar, guardar, descartarPendiente } = useMiPerfil(usuarioId)

  if (estado.fase === 'cargando') return <Aviso texto="Cargando tu perfil…" />

  if (estado.fase === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="font-serif-display text-5xl text-ink">Mi perfil</h1>
        <div role="alert" className="mt-8 rounded-xl border border-line bg-paper px-4 py-4 text-sm text-ink">
          <p>{estado.mensaje}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={recargar}>
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <FormularioPerfil
      perfil={estado.perfil}
      pendiente={estado.pendiente}
      email={email}
      guardar={guardar}
      descartarPendiente={descartarPendiente}
      refrescarSesion={refrescarSesion}
    />
  )
}

/** El formulario con lo guardado: sin telefono es el campo vacio. */
function borradorDe(perfil: DatosPersonales): BorradorPerfil {
  return { nombre: perfil.nombre, telefono: perfil.telefono ?? '', fechaNacimiento: perfil.fechaNacimiento }
}

function FormularioPerfil({
  perfil,
  pendiente,
  email,
  guardar,
  descartarPendiente,
  refrescarSesion,
}: {
  perfil: DatosPersonales
  pendiente: BorradorPerfil | null
  email: string
  guardar: ReturnType<typeof useMiPerfil>['guardar']
  descartarPendiente: () => void
  refrescarSesion: () => Promise<void>
}) {
  const { toast } = useToast()
  // Lo que quedo sin guardar cuando expiro la sesion manda sobre lo guardado,
  // pero no se envia solo: el aviso de abajo lo explica y deja descartarlo.
  const [borrador, setBorrador] = useState<BorradorPerfil>(() => pendiente ?? borradorDe(perfil))
  const [avisoPendiente, setAvisoPendiente] = useState(pendiente !== null)
  const [errores, setErrores] = useState<ErroresPerfil>({})
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  // El `disabled` del boton llega con el siguiente render; dos pulsaciones
  // seguidas podrian pasar las dos. La ref se lee en el acto.
  const enVuelo = useRef(false)
  const refNombre = useRef<HTMLInputElement>(null)
  const refTelefono = useRef<HTMLInputElement>(null)
  const hoy = hoyISO()

  function cambiar(campo: CampoPerfil, valor: string | null) {
    setBorrador((previo) => ({ ...previo, [campo]: valor }))
    // El error se borra al escribir y se recalcula al salir del campo: validar
    // en cada pulsacion marca en rojo lo que aun no terminan de escribir.
    setErrores((previo) => ({ ...previo, [campo]: undefined }))
  }

  function alSalir(campo: CampoPerfil) {
    const validacion = validarPerfilPropio(borrador, hoy)
    setErrores((previo) => ({ ...previo, [campo]: validacion.ok ? undefined : validacion.errores[campo] }))
  }

  function descartar() {
    descartarPendiente()
    setBorrador(borradorDe(perfil))
    setErrores({})
    setErrorGuardado(null)
    setAvisoPendiente(false)
  }

  async function enviar() {
    if (enVuelo.current) return
    enVuelo.current = true
    setGuardando(true)
    setErrorGuardado(null)
    try {
      const resultado = await guardar(borrador)
      if (resultado.estado === 'invalido') {
        setErrores(resultado.errores)
        if (resultado.errores.nombre) refNombre.current?.focus()
        else if (resultado.errores.telefono) refTelefono.current?.focus()
        return
      }
      // Lo que devolvio la base, no el borrador: asi se ve lo guardado (el
      // telefono ya canonico, el nombre recortado).
      setBorrador(borradorDe(resultado.datos))
      setErrores({})
      setAvisoPendiente(false)
      toast({ title: 'Perfil actualizado' })
      // Ya esta en la base: si refrescar la sesion falla, el encabezado se pone
      // al dia en el siguiente refresco de token. No es un fallo del guardado.
      refrescarSesion().catch(() => {})
    } catch (e: unknown) {
      setErrorGuardado(e instanceof Error ? e.message : 'No pudimos guardar tus datos. Inténtalo de nuevo.')
    } finally {
      enVuelo.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="font-serif-display text-5xl text-ink">Mi perfil</h1>
      <p className="mt-3 text-sm text-muted">Corrige tus datos de contacto y tu cumpleaños.</p>

      {avisoPendiente && (
        <div role="status" className="mt-6 rounded-xl border border-line bg-paper px-4 py-4 text-sm text-ink">
          <p>
            Recuperamos lo que escribiste antes de que expirara tu sesión. Todavía no está guardado: revísalo y
            pulsa «Guardar cambios».
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={descartar}>
            Descartar cambios
          </Button>
        </div>
      )}

      <form
        className="mt-8 space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
      >
        <Campo
          etiqueta="Nombre y apellido"
          error={errores.nombre}
          ref={refNombre}
          value={borrador.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
          onBlur={() => alSalir('nombre')}
          autoComplete="name"
        />
        <Campo
          etiqueta="Teléfono"
          error={errores.telefono}
          ayuda="Número chileno de 9 dígitos, por ejemplo 9 1234 5678."
          ref={refTelefono}
          value={borrador.telefono}
          onChange={(e) => cambiar('telefono', e.target.value)}
          onBlur={() => alSalir('telefono')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
        />
        <div>
          <SelectorFecha
            etiqueta="Cumpleaños (opcional)"
            valor={borrador.fechaNacimiento}
            onCambio={(valor) => cambiar('fechaNacimiento', valor)}
            minimo={FECHA_NACIMIENTO_MINIMA}
            maximo={hoy}
            // Igual que en el registro: sin fecha, abre con estos años a la vista.
            sugerida={sumarMeses(hoy, -12 * 30)}
          />
          {/* El selector no deja elegir fuera de rango: esto solo aparece con
              una fecha guardada que ya no cumple la regla. */}
          {errores.fechaNacimiento && (
            <p className="mt-1.5 text-xs text-danger">{errores.fechaNacimiento}</p>
          )}
        </div>
        <Campo etiqueta="Correo" ayuda="El correo no se cambia desde aquí." value={email} readOnly />

        <div className="flex flex-col items-start gap-4">
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          {errorGuardado && (
            <p role="alert" className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
              {errorGuardado}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * Etiqueta, input y mensaje asociados con `htmlFor` y `aria-describedby`. El
 * `TextField` de shared/ui no expone ref (para llevar el foco al error),
 * `onBlur` ni la asociacion del mensaje.
 */
function Campo({
  etiqueta,
  error,
  ayuda,
  ref,
  ...input
}: {
  etiqueta: string
  error?: string
  ayuda?: string
  ref?: Ref<HTMLInputElement>
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>) {
  const id = useId()
  const idMensaje = `${id}-mensaje`
  const mensaje = error ?? ayuda
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        {etiqueta}
      </label>
      <input
        {...input}
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={mensaje ? idMensaje : undefined}
        className={`mt-2 w-full rounded-lg border bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-ink/20 read-only:cursor-default read-only:bg-line-soft/60 read-only:text-muted ${
          error ? 'border-danger' : 'border-line'
        }`}
      />
      {mensaje && (
        <p id={idMensaje} className={`mt-1.5 text-xs ${error ? 'text-danger' : 'text-muted-light'}`}>
          {mensaje}
        </p>
      )}
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <p role="status" className="text-sm text-muted">
        {texto}
      </p>
    </div>
  )
}
