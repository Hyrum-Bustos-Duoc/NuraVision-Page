import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AlertTriangle, Plus, RotateCcw, X } from 'lucide-react'
import { useAuth } from '@/modules/auth/ui/useAuth'
import { useToast } from '@/shared/state/Toast'
import { formatLongDate } from '@/shared/lib/format'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { StringListField, TextAreaField, TextField } from '@/shared/ui/form'
import { contenedorPanel } from '@/shared/ui/nv-estilos'
import { Button } from '@/shared/ui/ui'
import {
  CONTENIDO_POR_DEFECTO,
  MAX_ANUNCIOS,
  motivoParaNoGuardarContenido,
  type ClaveImagen,
  type ContenidoSitio,
  type Enlace,
  type Paso,
} from '../application'
import { EditorImagen } from './EditorImagen'
import { useContenido } from './useContenido'

const SECCIONES = [
  { id: 'anuncios', titulo: 'Barra de anuncios' },
  { id: 'fotos', titulo: 'Fotos' },
  { id: 'portada', titulo: 'Portada' },
  { id: 'servicios', titulo: 'Servicios destacados' },
  { id: 'tienda', titulo: 'Tienda' },
  { id: 'banda-ia', titulo: 'NuraVision IA' },
  { id: 'como-funciona', titulo: 'Cómo funciona' },
  { id: 'equipo', titulo: 'Equipo y cierre' },
  { id: 'login', titulo: 'Inicio de sesión' },
  { id: 'footer', titulo: 'Footer' },
  { id: 'analisis', titulo: 'Consejos del análisis' },
] as const

const FOTOS: { clave: ClaveImagen; titulo: string; detalle: string; proporcion: string }[] = [
  { clave: 'portadaEstudio', titulo: 'Portada · El estudio', detalle: 'Tarjeta vertical del hero.', proporcion: 'aspect-[3/5]' },
  { clave: 'portadaTienda', titulo: 'Portada · La tienda', detalle: 'Segunda tarjeta del hero.', proporcion: 'aspect-[3/5]' },
  { clave: 'bandaIA', titulo: 'Banda NuraVision IA', detalle: 'Foto bajo la línea de escaneo.', proporcion: 'aspect-[3/5]' },
  { clave: 'login', titulo: 'Inicio de sesión', detalle: 'Panel derecho, a todo el alto.', proporcion: 'aspect-[3/5]' },
]

const AYUDA_ENFASIS = 'Encierra una palabra entre *asteriscos* para destacarla en cursiva.'

/**
 * Panel -> Contenido: todos los textos y fotos del sitio, editables.
 *
 * Se edita un borrador y se publica de una vez con "Guardar cambios": cambiar
 * la portada letra por letra en vivo dejaria a los visitantes leyendo frases a
 * medio escribir.
 */
export default function AdminContenido() {
  const { usuario, cargando: cargandoSesion } = useAuth()
  const { contenido, cargando, editable, actualizadoEn } = useContenido()

  if (cargandoSesion || cargando) {
    return (
      <div className={contenedorPanel} aria-busy="true">
        <div className="h-10 w-72 animate-pulse rounded bg-line-soft" />
        <div className="mt-8 h-64 animate-pulse rounded-2xl bg-line-soft" />
      </div>
    )
  }

  if (!usuario?.esStaff) {
    return (
      <div className={contenedorPanel}>
        <h1 className="font-serif-display text-4xl text-ink">Contenido del sitio</h1>
        <p className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Esta sección es del personal del estudio. Inicia sesión con una cuenta marcada como personal (es_staff).
          <br />
          <Link to="/login" className="mt-4 inline-block text-ink underline underline-offset-4">
            Ir a iniciar sesión
          </Link>
        </p>
      </div>
    )
  }

  // La clave reinicia el borrador cuando llega una version nueva de la base.
  return <Editor key={actualizadoEn ?? 'original'} inicial={contenido} editable={editable} actualizadoEn={actualizadoEn} />
}

function Editor({
  inicial,
  editable,
  actualizadoEn,
}: {
  inicial: ContenidoSitio
  editable: boolean
  actualizadoEn: string | null
}) {
  const { guardar, subirImagen } = useContenido()
  const { toast } = useToast()
  const [borrador, setBorrador] = useState<ContenidoSitio>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)

  const cambios = useMemo(() => JSON.stringify(borrador) !== JSON.stringify(inicial), [borrador, inicial])
  const motivo = useMemo(() => motivoParaNoGuardarContenido(borrador), [borrador])

  /** Copia, aplica el cambio y reemplaza: el borrador nunca se muta en el lugar. */
  function editar(cambio: (c: ContenidoSitio) => void) {
    setBorrador((previo) => {
      const nuevo = structuredClone(previo)
      cambio(nuevo)
      return nuevo
    })
  }

  async function publicar() {
    if (motivo) {
      toast({ title: 'Revisa el contenido', description: motivo, tone: 'error' })
      return
    }
    setGuardando(true)
    try {
      await guardar(borrador)
      toast({ title: 'Contenido publicado', description: 'Los cambios ya se ven en el sitio.', tone: 'success' })
    } catch (e) {
      toast({
        title: 'No se guardó el contenido',
        description: e instanceof Error ? e.message : 'Vuelve a intentarlo.',
        tone: 'error',
      })
    } finally {
      setGuardando(false)
    }
  }

  const c = borrador

  return (
    <div className={`${contenedorPanel} pb-32`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-4xl text-ink">Contenido del sitio</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Textos y fotos de la portada, la barra de anuncios, el inicio de sesión y el footer. Los cambios
            se publican para todos al pulsar <strong className="text-ink">Guardar cambios</strong>.
          </p>
          {actualizadoEn && (
            <p className="mt-1 text-xs text-muted-light">
              Última publicación: {formatLongDate(actualizadoEn.slice(0, 10))}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => setRestaurando(true)} disabled={!editable}>
          <RotateCcw className="h-4 w-4" />
          Restaurar original
        </Button>
      </div>

      {!editable && (
        <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-line bg-paper p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-olive-700" />
          <div>
            <p className="font-medium text-ink">Todavía no se puede guardar</p>
            <p className="mt-1 text-muted">
              Falta aplicar la migración <code className="rounded bg-ivory px-1.5 py-0.5 text-xs">0014_contenido_sitio.sql</code>{' '}
              en la base de datos. Mientras tanto el sitio muestra los textos originales y puedes revisar el
              formulario, pero no publicar.
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Secciones del contenido" className="hidden lg:block">
          <ul className="sticky top-8 space-y-1 text-sm">
            {SECCIONES.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-lg px-3 py-2 text-muted transition-colors hover:bg-paper hover:text-ink"
                >
                  {s.titulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <Seccion id="anuncios" titulo="Barra de anuncios" detalle="La franja oscura en movimiento sobre el menú. Sin anuncios, la barra se oculta.">
            <StringListField
              label={`Anuncios (máximo ${MAX_ANUNCIOS})`}
              values={c.anuncios}
              onChange={(v) => editar((b) => void (b.anuncios = v.slice(0, MAX_ANUNCIOS)))}
              placeholder="Agregar anuncio"
            />
          </Seccion>

          <Seccion id="fotos" titulo="Fotos" detalle="JPG, PNG o WebP. Se comprimen antes de subir. Se publican al guardar.">
            <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
              {FOTOS.map((f) => (
                <EditorImagen
                  key={f.clave}
                  titulo={f.titulo}
                  detalle={f.detalle}
                  proporcion={f.proporcion}
                  valor={c.imagenes[f.clave]}
                  original={CONTENIDO_POR_DEFECTO.imagenes[f.clave]}
                  deshabilitado={!editable}
                  onSubir={(archivo) => subirImagen(f.clave, archivo)}
                  onChange={(url) => editar((b) => void (b.imagenes[f.clave] = url))}
                />
              ))}
            </div>
          </Seccion>

          <Seccion id="portada" titulo="Portada" detalle="El primer bloque de la página de inicio.">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Etiqueta" value={c.portada.etiqueta} onChange={(v) => editar((b) => void (b.portada.etiqueta = v))} />
              <TextField
                label="Título"
                value={c.portada.titulo}
                onChange={(v) => editar((b) => void (b.portada.titulo = v))}
                hint={AYUDA_ENFASIS}
              />
            </div>
            <TextAreaField
              label="Descripción"
              value={c.portada.descripcion}
              onChange={(v) => editar((b) => void (b.portada.descripcion = v))}
              rows={3}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Botón de reserva" value={c.portada.botonReservar} onChange={(v) => editar((b) => void (b.portada.botonReservar = v))} />
              <TextField label="Botón de tienda" value={c.portada.botonTienda} onChange={(v) => editar((b) => void (b.portada.botonTienda = v))} />
            </div>
            <div className="space-y-5">
              <GrupoEnlace
                titulo="Tarjeta del estudio"
                valor={c.portada.tarjetaEstudio}
                onChange={(v) => editar((b) => void (b.portada.tarjetaEstudio = v))}
              />
              <GrupoEnlace
                titulo="Tarjeta de la tienda"
                valor={c.portada.tarjetaTienda}
                onChange={(v) => editar((b) => void (b.portada.tarjetaTienda = v))}
              />
            </div>
          </Seccion>

          <Seccion id="servicios" titulo="Servicios destacados" detalle={`Los cuatro primeros servicios del catálogo. ${AYUDA_ENFASIS}`}>
            <GrupoEnlace valor={c.servicios} onChange={(v) => editar((b) => void (b.servicios = v))} />
          </Seccion>

          <Seccion id="tienda" titulo="Tienda" detalle={`Productos destacados y formas de entrega. ${AYUDA_ENFASIS}`}>
            <GrupoEnlace
              valor={c.tienda}
              onChange={(v) => editar((b) => void Object.assign(b.tienda, v))}
            />
            <EditorPasos
              etiqueta="Formas de entrega"
              pasos={c.tienda.entregas}
              maximo={3}
              onChange={(v) => editar((b) => void (b.tienda.entregas = v))}
            />
          </Seccion>

          <Seccion id="banda-ia" titulo="NuraVision IA" detalle="La banda oscura con el análisis por foto.">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Etiqueta" value={c.bandaIA.eyebrow} onChange={(v) => editar((b) => void (b.bandaIA.eyebrow = v))} />
              <TextAreaField
                label="Título"
                value={c.bandaIA.titulo}
                onChange={(v) => editar((b) => void (b.bandaIA.titulo = v))}
                rows={2}
                hint={`${AYUDA_ENFASIS} Un salto de línea parte el título.`}
              />
            </div>
            <EditorPasos etiqueta="Pasos" pasos={c.bandaIA.pasos} maximo={4} onChange={(v) => editar((b) => void (b.bandaIA.pasos = v))} />
            <StringListField
              label="Hallazgos sobre la foto"
              values={c.bandaIA.hallazgos}
              onChange={(v) => editar((b) => void (b.bandaIA.hallazgos = v.slice(0, 4)))}
              placeholder="Agregar hallazgo"
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Botón" value={c.bandaIA.boton} onChange={(v) => editar((b) => void (b.bandaIA.boton = v))} />
              <TextField label="Aviso" value={c.bandaIA.aviso} onChange={(v) => editar((b) => void (b.bandaIA.aviso = v))} />
            </div>
          </Seccion>

          <Seccion id="como-funciona" titulo="Cómo funciona" detalle="Los pasos para reservar. La numeración es automática.">
            <TextField label="Título" value={c.comoFunciona.titulo} onChange={(v) => editar((b) => void (b.comoFunciona.titulo = v))} />
            <EditorPasos etiqueta="Pasos" pasos={c.comoFunciona.pasos} maximo={4} onChange={(v) => editar((b) => void (b.comoFunciona.pasos = v))} />
          </Seccion>

          <Seccion id="equipo" titulo="Equipo y cierre" detalle="La sección de profesionales y el llamado final de la portada.">
            <GrupoEnlace titulo="Equipo" valor={c.equipo} onChange={(v) => editar((b) => void (b.equipo = v))} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Título del cierre"
                value={c.ctaFinal.titulo}
                onChange={(v) => editar((b) => void (b.ctaFinal.titulo = v))}
                hint={AYUDA_ENFASIS}
              />
              <TextField label="Botón del cierre" value={c.ctaFinal.boton} onChange={(v) => editar((b) => void (b.ctaFinal.boton = v))} />
            </div>
            <TextField label="Texto del cierre" value={c.ctaFinal.descripcion} onChange={(v) => editar((b) => void (b.ctaFinal.descripcion = v))} />
          </Seccion>

          <Seccion id="login" titulo="Inicio de sesión" detalle="La tarjeta sobre la foto del panel derecho.">
            <TextAreaField label="Cita" value={c.login.cita} onChange={(v) => editar((b) => void (b.login.cita = v))} rows={2} />
            <TextField label="Firma" value={c.login.firma} onChange={(v) => editar((b) => void (b.login.firma = v))} />
          </Seccion>

          <Seccion id="footer" titulo="Footer" detalle="Newsletter y datos de contacto del pie de página.">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Título del newsletter" value={c.footer.newsletterTitulo} onChange={(v) => editar((b) => void (b.footer.newsletterTitulo = v))} />
              <TextField label="Frase destacada" value={c.footer.newsletterDestacado} onChange={(v) => editar((b) => void (b.footer.newsletterDestacado = v))} />
              <TextField label="Dirección" value={c.footer.direccion} onChange={(v) => editar((b) => void (b.footer.direccion = v))} />
              <TextField label="Horario" value={c.footer.horario} onChange={(v) => editar((b) => void (b.footer.horario = v))} />
              <TextField label="Teléfono" value={c.footer.telefono} onChange={(v) => editar((b) => void (b.footer.telefono = v))} />
              <TextField label="Correo" type="email" value={c.footer.email} onChange={(v) => editar((b) => void (b.footer.email = v))} />
            </div>
          </Seccion>

          <Seccion id="analisis" titulo="Consejos del análisis" detalle="Lo que se muestra al elegir qué analizar en NuraVision IA.">
            <div className="space-y-5">
              {Object.entries(c.analisis).map(([id, opcion]) => (
                <div key={id} className="space-y-4 rounded-xl border border-line-soft p-4">
                  <TextField
                    label="Nombre de la opción"
                    value={opcion.label}
                    onChange={(v) => editar((b) => void (b.analisis[id].label = v))}
                  />
                  <EditorPasos
                    etiqueta="Consejos"
                    pasos={opcion.tips}
                    maximo={4}
                    onChange={(v) => editar((b) => void (b.analisis[id].tips = v))}
                  />
                </div>
              ))}
            </div>
          </Seccion>
        </div>
      </div>

      {/* Barra de guardado: solo aparece con cambios, siempre a la vista. Va en
          un portal: la animacion de entrada del panel aplica un transform al
          contenido, y dentro de el `fixed` se pegaria al final de la pagina. */}
      {cambios &&
        createPortal(
        <div className="animate-fade-up fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-paper/95 shadow-[0_-8px_24px_rgba(35,32,28,0.06)] backdrop-blur lg:left-72">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
            <p className="text-sm text-ink">
              Tienes cambios sin guardar.
              {motivo && <span className="ml-2 text-danger">{motivo}</span>}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setBorrador(inicial)} disabled={guardando}>
                Descartar
              </Button>
              <Button onClick={() => void publicar()} disabled={guardando || !editable || motivo !== null}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>,
          document.body,
        )}

      <ConfirmDialog
        open={restaurando}
        onClose={() => setRestaurando(false)}
        onConfirm={() => setBorrador(structuredClone(CONTENIDO_POR_DEFECTO))}
        title="¿Restaurar el contenido original?"
        confirmLabel="Restaurar"
        tone="default"
        description="Todos los textos y fotos vuelven a los originales del sitio. El cambio queda como borrador: no se publica hasta que pulses Guardar cambios."
      />
    </div>
  )
}

function Seccion({ id, titulo, detalle, children }: { id: string; titulo: string; detalle: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 rounded-2xl border border-line-soft bg-paper p-5 sm:p-6">
      <h2 className="font-serif-display text-2xl text-ink">{titulo}</h2>
      <p className="mt-1 text-sm text-muted">{detalle}</p>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

function GrupoEnlace({ titulo, valor, onChange }: { titulo?: string; valor: Enlace; onChange: (v: Enlace) => void }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-line-soft p-4">
      {titulo && <legend className="px-1 text-sm font-medium text-ink">{titulo}</legend>}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Etiqueta" value={valor.eyebrow} onChange={(v) => onChange({ ...valor, eyebrow: v })} />
        <TextField label="Título" value={valor.titulo} onChange={(v) => onChange({ ...valor, titulo: v })} />
        <TextField label="Texto del enlace" value={valor.enlace} onChange={(v) => onChange({ ...valor, enlace: v })} />
      </div>
    </fieldset>
  )
}

/** Lista de titulo + detalle (pasos, formas de entrega, consejos). */
function EditorPasos<T extends Paso | { titulo: string; detalle: string }>({
  etiqueta,
  pasos,
  maximo,
  onChange,
}: {
  etiqueta: string
  pasos: T[]
  maximo: number
  onChange: (v: T[]) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{etiqueta}</p>
      <ol className="mt-2 space-y-3">
        {pasos.map((paso, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-2.5 w-6 shrink-0 font-mono text-xs text-muted-light">{String(i + 1).padStart(2, '0')}</span>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <input
                aria-label={`${etiqueta} ${i + 1}: título`}
                value={paso.titulo}
                onChange={(e) => onChange(pasos.map((p, j) => (j === i ? { ...p, titulo: e.target.value } : p)))}
                placeholder="Título"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink"
              />
              <input
                aria-label={`${etiqueta} ${i + 1}: detalle`}
                value={paso.detalle}
                onChange={(e) => onChange(pasos.map((p, j) => (j === i ? { ...p, detalle: e.target.value } : p)))}
                placeholder="Detalle"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink"
              />
            </div>
            <button
              type="button"
              aria-label={`Quitar ${etiqueta.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(pasos.filter((_, j) => j !== i))}
              className="mt-1 h-8 w-8 shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      {pasos.length < maximo && (
        <button
          type="button"
          onClick={() => onChange([...pasos, { titulo: '', detalle: '' } as T])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-4 py-2 text-xs font-medium text-muted transition-colors hover:border-ink hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      )}
    </div>
  )
}
