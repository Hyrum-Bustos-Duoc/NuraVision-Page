import { Plus, Trash2 } from 'lucide-react'
import { createId } from '@/shared/lib/id'
import { formatPrice } from '@/shared/lib/format'
import { Kicker } from '@/shared/ui/ui'
import { TextField } from '@/shared/ui/form'
import type { OpcionVariante, VarianteServicio } from '../domain/servicio.types'

/** Opcion nueva, con un id estable desde el primer momento. */
function opcionVacia(): OpcionVariante {
  return { id: createId('opc'), etiqueta: '', precio: 0 }
}

/**
 * Configura la pregunta que un servicio le hace a la clienta antes de reservar.
 *
 * `null` significa que no pregunta nada, que es el caso de los 17 servicios
 * actuales. El interruptor cambia entre ese `null` y una variante con una opcion
 * en blanco, en vez de dejar un objeto vacio: la base rechaza una variante sin
 * pregunta ni opciones, y "a medio configurar" no es un estado que deba poder
 * guardarse.
 *
 * Cada opcion nace con su `id` y lo conserva mientras se edita. Es importante y
 * no cosmetico: ese id es lo que queda escrito en las reservas, y regenerarlo al
 * cambiar una etiqueta dejaria las reservas anteriores sin forma de cruzarse con
 * la opcion que las origino.
 */
export function EditorVariantes({
  valor,
  onChange,
  /** `true` para pintar en rojo lo que falta. Lo activa el modal al intentar guardar. */
  mostrarErrores = false,
}: {
  valor: VarianteServicio | null
  onChange: (valor: VarianteServicio | null) => void
  mostrarErrores?: boolean
}) {
  const activo = valor !== null

  function alternar(encendido: boolean) {
    onChange(encendido ? { pregunta: '', opciones: [opcionVacia()] } : null)
  }

  function editarOpcion(id: string, cambio: Partial<OpcionVariante>) {
    if (!valor) return
    onChange({
      ...valor,
      opciones: valor.opciones.map((o) => (o.id === id ? { ...o, ...cambio } : o)),
    })
  }

  function quitarOpcion(id: string) {
    if (!valor) return
    const restantes = valor.opciones.filter((o) => o.id !== id)
    // Quitar la ultima opcion apaga la pregunta entera. Dejar una pregunta sin
    // respuestas posibles seria un callejon sin salida en el flujo de reserva, y
    // la base tampoco lo aceptaria.
    onChange(restantes.length === 0 ? null : { ...valor, opciones: restantes })
  }

  return (
    <div className="border-t border-line-soft pt-5">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => alternar(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-olive-600"
        />
        <span>
          <span className="text-ink">Preguntar algo antes de reservar</span>
          <span className="mt-1 block text-xs text-muted">
            Para servicios cuyo precio depende de una respuesta, como el largo del cabello o si
            hay retiro de uñas externo. La clienta elegirá antes de escoger profesional.
          </span>
        </span>
      </label>

      {activo && valor && (
        <div className="mt-5 space-y-5 rounded-xl border border-line-soft bg-ivory/60 p-4">
          <TextField
            label="Pregunta"
            value={valor.pregunta}
            onChange={(pregunta) => onChange({ ...valor, pregunta })}
            placeholder="¿Largo del cabello?"
            error={
              mostrarErrores && valor.pregunta.trim() === ''
                ? 'Escribe la pregunta que se le mostrará.'
                : undefined
            }
          />

          <div>
            <Kicker>Opciones y precio</Kicker>
            <p className="mt-1 text-xs text-muted-light">
              El precio de cada opción es el precio final del servicio, no un recargo. El catálogo
              anunciará el más bajo como “desde”.
            </p>

            <div className="mt-3 space-y-2">
              {valor.opciones.map((opcion, i) => {
                const faltaEtiqueta = mostrarErrores && opcion.etiqueta.trim() === ''
                return (
                  <div key={opcion.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={opcion.etiqueta}
                        onChange={(e) => editarOpcion(opcion.id, { etiqueta: e.target.value })}
                        placeholder={i === 0 ? 'Corto' : 'Largo'}
                        aria-label={`Nombre de la opción ${i + 1}`}
                        className={`w-full rounded-lg border bg-paper px-4 py-2 text-sm text-ink outline-none focus:border-ink ${
                          faltaEtiqueta ? 'border-danger' : 'border-line'
                        }`}
                      />
                      {faltaEtiqueta && (
                        <p className="mt-1 text-xs text-danger">Ponle nombre a esta opción.</p>
                      )}
                    </div>

                    <div className="relative w-36 shrink-0">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={opcion.precio}
                        onChange={(e) =>
                          // `Number('')` es 0, asi que vaciar el campo deja un
                          // precio de 0 y no un NaN que se propagaria al total.
                          editarOpcion(opcion.id, { precio: Number(e.target.value) || 0 })
                        }
                        aria-label={`Precio de la opción ${i + 1}`}
                        className="w-full rounded-lg border border-line bg-paper px-4 py-2 pr-12 text-sm text-ink outline-none focus:border-ink"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
                        CLP
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => quitarOpcion(opcion.id)}
                      aria-label={`Quitar la opción ${opcion.etiqueta.trim() || i + 1}`}
                      title={
                        valor.opciones.length === 1
                          ? 'Quitar la última opción desactiva la pregunta.'
                          : undefined
                      }
                      className="mt-1 rounded-lg border border-line p-2 text-danger transition-colors hover:bg-danger-soft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => onChange({ ...valor, opciones: [...valor.opciones, opcionVacia()] })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar opción
            </button>

            {/* El "desde" se calcula aqui mismo para que quien configura vea el
                efecto en el catalogo sin tener que guardar y volver. */}
            {valor.opciones.length > 1 && (
              <p className="mt-3 text-xs text-muted">
                En el catálogo se anunciará como{' '}
                <span className="text-ink">
                  desde {formatPrice(Math.min(...valor.opciones.map((o) => o.precio)))}
                </span>
                .
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
