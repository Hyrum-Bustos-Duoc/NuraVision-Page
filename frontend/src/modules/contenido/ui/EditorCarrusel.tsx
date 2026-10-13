import { useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ImagePlus, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { MAX_FOTOS_CARRUSEL } from '../application'

/**
 * Las fotos de un carrusel de la portada, en acordeon: la cabecera abre y
 * cierra la lista; quien decide cual esta abierta es el panel, para que solo
 * haya una a la vez.
 *
 * Igual que `EditorImagen`, subir una foto la deja en el bucket y agrega su
 * URL al borrador; no se publica hasta "Guardar cambios".
 */
export function EditorCarrusel({
  id,
  titulo,
  detalle,
  fotos,
  original,
  abierto,
  deshabilitado,
  onAlternar,
  onSubir,
  onAgregar,
  onChange,
}: {
  id: string
  titulo: string
  detalle: string
  fotos: string[]
  original: string[]
  abierto: boolean
  deshabilitado: boolean
  onAlternar: () => void
  onSubir: (archivo: File) => Promise<string>
  /**
   * Agrega al final de la lista del borrador ACTUAL, no de la que habia al
   * empezar la subida: si mientras tanto se pulsa "Descartar", las fotos
   * nuevas se suman a lo descartado en vez de resucitar la lista vieja.
   */
  onAgregar: (nuevas: string[]) => void
  onChange: (fotos: string[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [subida, setSubida] = useState<{ hechas: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lleno = fotos.length >= MAX_FOTOS_CARRUSEL
  const esOriginal = fotos.join('\n') === original.join('\n')
  // Mientras sube no se reordena ni se quita: el aviso de progreso y el cupo
  // se calcularon sobre la lista del principio.
  const bloqueado = deshabilitado || subida !== null

  /** Varias fotos de una vez, en orden y una tras otra; si una falla, las anteriores quedan. */
  async function subir(archivos: File[]) {
    const cupo = archivos.slice(0, MAX_FOTOS_CARRUSEL - fotos.length)
    if (cupo.length === 0) return
    setError(
      cupo.length < archivos.length
        ? `Solo se agregaron ${cupo.length}: el carrusel admite hasta ${MAX_FOTOS_CARRUSEL} fotos.`
        : null,
    )
    const nuevas: string[] = []
    try {
      for (const archivo of cupo) {
        setSubida({ hechas: nuevas.length, total: cupo.length })
        nuevas.push(await onSubir(archivo))
      }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'No se pudo subir la foto.'
      setError(nuevas.length > 0 ? `Se subieron ${nuevas.length} de ${cupo.length}. ${motivo}` : motivo)
    } finally {
      if (nuevas.length > 0) onAgregar(nuevas)
      setSubida(null)
      if (input.current) input.current.value = ''
    }
  }

  function mover(desde: number, hacia: number) {
    const lista = [...fotos]
    const [foto] = lista.splice(desde, 1)
    lista.splice(hacia, 0, foto)
    onChange(lista)
  }

  // Clave por URL, no por posicion: al reordenar, el elemento (y el foco en su
  // boton) viaja con la foto. El contador cubre una URL repetida.
  const vistas = new Map<string, number>()
  const claves = fotos.map((url) => {
    const n = vistas.get(url) ?? 0
    vistas.set(url, n + 1)
    return `${url}#${n}`
  })

  const panel = `${id}-fotos`

  return (
    <div className="rounded-xl border border-line-soft">
      <h3>
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={panel}
          onClick={onAlternar}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-ivory"
        >
          <span>
            <span className="block text-sm font-medium text-ink">{titulo}</span>
            <span className="block text-xs text-muted">
              {fotos.length === 1 ? '1 foto' : `${fotos.length} fotos`} · {detalle}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
      </h3>

      {abierto && (
        <div id={panel} className="space-y-4 border-t border-line-soft p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void subir(Array.from(e.target.files ?? []))}
            />
            <button
              type="button"
              disabled={bloqueado || lleno}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-nv-bg transition-colors hover:bg-nv-accent disabled:pointer-events-none disabled:opacity-40"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Agregar fotos
            </button>
            {!esOriginal && (
              <button
                type="button"
                disabled={bloqueado}
                onClick={() => onChange(original)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-ivory disabled:pointer-events-none disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar originales
              </button>
            )}
            <span className="ml-auto text-xs text-muted-light">
              {fotos.length} / {MAX_FOTOS_CARRUSEL}
            </span>
          </div>

          {subida && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-olive-700" />
              Subiendo {subida.hechas + 1} de {subida.total}…
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}

          {fotos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Sin fotos: la tarjeta de la portada se muestra a rayas.
            </p>
          ) : (
            <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {fotos.map((url, i) => (
                <li key={claves[i]}>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-line-soft bg-ivory">
                    <img src={url} alt={`Foto ${i + 1}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 rounded bg-paper/90 px-1.5 py-0.5 font-mono text-[10px] text-ink">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <BotonFoto etiqueta={`Mover la foto ${i + 1} antes`} disabled={bloqueado || i === 0} onClick={() => mover(i, i - 1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </BotonFoto>
                    <BotonFoto
                      etiqueta={`Mover la foto ${i + 1} después`}
                      disabled={bloqueado || i === fotos.length - 1}
                      onClick={() => mover(i, i + 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </BotonFoto>
                    <BotonFoto
                      etiqueta={`Quitar la foto ${i + 1}`}
                      disabled={bloqueado}
                      peligro
                      onClick={() => onChange(fotos.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </BotonFoto>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

function BotonFoto({
  etiqueta,
  disabled,
  peligro,
  onClick,
  children,
}: {
  etiqueta: string
  disabled: boolean
  peligro?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-line transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        peligro ? 'ml-auto text-danger hover:bg-danger-soft' : 'text-ink hover:bg-ivory'
      }`}
    >
      {children}
    </button>
  )
}
