import { useRef, useState } from 'react'
import { ImagePlus, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { ImageError } from '@/shared/lib/image'

/**
 * Una foto del sitio: vista previa en su proporcion real, subir, volver a la
 * original o quitarla (el sitio muestra el marcador a rayas).
 *
 * La subida va directo al bucket y devuelve una URL; el contenido solo guarda
 * esa URL. Hasta que se pulsa "Guardar cambios" la foto nueva no se publica.
 */
export function EditorImagen({
  titulo,
  detalle,
  valor,
  original,
  proporcion,
  deshabilitado,
  onSubir,
  onChange,
}: {
  titulo: string
  detalle: string
  valor: string | null
  original: string | null
  /** Clase de proporcion: `aspect-[3/5]`, `aspect-[4/5]`… */
  proporcion: string
  deshabilitado?: boolean
  onSubir: (archivo: File) => Promise<string>
  onChange: (url: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function elegir(archivo: File | undefined) {
    if (!archivo) return
    setError(null)
    setSubiendo(true)
    try {
      onChange(await onSubir(archivo))
    } catch (e) {
      setError(e instanceof ImageError || e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ''
    }
  }

  const esOriginal = valor === original

  return (
    <div className="flex flex-col">
      <div className={`relative w-full overflow-hidden rounded-xl border border-line-soft bg-ivory ${proporcion}`}>
        {valor ? (
          <img src={valor} alt={titulo} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="placeholder-stripes absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-light">Sin foto</span>
          </div>
        )}
        {subiendo && (
          <div className="absolute inset-0 flex items-center justify-center bg-paper/70">
            <Loader2 className="h-6 w-6 animate-spin text-olive-700" aria-label="Subiendo" />
          </div>
        )}
      </div>

      <p className="mt-3 text-sm font-medium text-ink">{titulo}</p>
      <p className="text-xs text-muted">{detalle}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void elegir(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={deshabilitado || subiendo}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-nv-bg transition-colors hover:bg-nv-accent disabled:pointer-events-none disabled:opacity-40"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {valor ? 'Cambiar foto' : 'Subir foto'}
        </button>
        {!esOriginal && original && (
          <button
            type="button"
            onClick={() => onChange(original)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-ivory"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Original
          </button>
        )}
        {valor && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Quitar la foto de ${titulo}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
