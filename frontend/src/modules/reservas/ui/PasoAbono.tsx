import { useId, useState, type FormEvent } from 'react'
import { Info, Lock } from 'lucide-react'
import { saldoTrasAbono } from '@/shared/lib/abono'
import { formatLongDate, formatPrice } from '@/shared/lib/format'
import { boton } from '@/shared/ui/nv-estilos'
import {
  erroresDeTarjeta,
  formatearNumeroTarjeta,
  formatearVencimiento,
  type DatosTarjeta,
} from '../domain/tarjeta-demo'
import { POLITICA_ABONO } from './politica-abono'

type Campo = keyof DatosTarjeta

/** Orden visual de los campos: es el orden en que se busca el primer error. */
const CAMPOS: Campo[] = ['titular', 'numero', 'vencimiento', 'cvv']

/**
 * Paso «Abono» del flujo de reserva (abono-servicios-unas, decisiones 7 a 9).
 *
 * Es un pago SIMULADO: con datos bien formados se aprueba siempre y la reserva
 * se crea con `onPagar`. La tarjeta vive solo en el estado de este componente:
 * no sube al borrador, no se guarda en el navegador y no viaja en ninguna
 * peticion. Por eso los inputs no tienen `name` y el formulario no se envia de
 * verdad (`preventDefault`): un submit nativo pondria los datos en la URL.
 *
 * Si la reserva falla, el componente sigue montado y conserva lo escrito: se
 * reintenta sin volver a teclear la tarjeta.
 */
export function PasoAbono({
  servicioNombre,
  profesionalNombre,
  dateISO,
  time,
  precio,
  abono,
  guardando,
  errorAlGuardar,
  onBack,
  onPagar,
}: {
  servicioNombre: string
  profesionalNombre: string
  dateISO: string
  time: string
  /** Precio ya resuelto del servicio (el de la variante elegida, si hay). */
  precio: number
  /** Mayor que 0: con 0 este paso no existe. */
  abono: number
  guardando: boolean
  errorAlGuardar: string | null
  onBack: () => void
  onPagar: () => void
}) {
  const [tarjeta, setTarjeta] = useState<DatosTarjeta>({
    titular: '',
    numero: '',
    vencimiento: '',
    cvv: '',
  })
  // Se valida al salir del campo, no en cada tecla: marcar en rojo un numero a
  // medio escribir es ruido. Al intentar pagar se muestran todos.
  const [tocados, setTocados] = useState<Partial<Record<Campo, boolean>>>({})
  const [intentoPagar, setIntentoPagar] = useState(false)

  const idBase = useId()
  const idDe = (campo: Campo) => `${idBase}-${campo}`

  const errores = erroresDeTarjeta(tarjeta, new Date())
  const errorVisible = (campo: Campo) =>
    intentoPagar || tocados[campo] ? errores[campo] : undefined

  const set = (campo: Campo, valor: string) => setTarjeta((t) => ({ ...t, [campo]: valor }))
  const tocar = (campo: Campo) => setTocados((t) => ({ ...t, [campo]: true }))

  function pagar(evento: FormEvent) {
    evento.preventDefault()
    setIntentoPagar(true)
    const primero = CAMPOS.find((c) => errores[c])
    if (primero) {
      // Por id y no por ref: es un solo enfoque, en el manejador del evento.
      document.getElementById(idDe(primero))?.focus()
      return
    }
    onPagar()
  }

  // El titulo va dentro de la columna izquierda, como en Checkout, y no encima
  // de la rejilla: asi el resumen empieza arriba y en 1280x800 su final (la
  // politica) no cae bajo el boton flotante de Nuria.
  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_0.9fr] lg:gap-11">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-[12.5px] text-nv-soft1 transition-colors hover:text-nv-ink"
        >
          ← Volver a la confirmación
        </button>
        <h1 className="mt-3 font-serif text-[30px] font-light leading-tight tracking-[-0.02em] text-nv-ink sm:text-[38px]">
          Abono
        </h1>
        <p className="mt-2 max-w-lg text-sm text-nv-muted1">
          Para reservar este servicio se adelanta un abono. Tu hora queda tomada en cuanto se
          aprueba.
        </p>

        <form onSubmit={pagar} noValidate autoComplete="off" className="mt-8">
          <p
            role="note"
            className="flex gap-3 rounded-[10px] border border-nv-line2 bg-nv-warn-bg px-4 py-3.5 text-[13px] leading-relaxed text-nv-warn"
          >
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>
              <strong className="font-medium">Pago de demostración:</strong> no se realiza ningún
              cobro. No ingreses datos de una tarjeta real.
            </span>
          </p>

          <section className="mt-8">
            <h2 className="mb-4 text-[11px] uppercase tracking-[0.16em] text-nv-soft1">Tarjeta</h2>
            <div className="space-y-4">
              <CampoTarjeta
                etiqueta="Nombre del titular"
                id={idDe('titular')}
                value={tarjeta.titular}
                onChange={(v) => set('titular', v)}
                onBlur={() => tocar('titular')}
                error={errorVisible('titular')}
                maxLength={80}
              />
              <CampoTarjeta
                etiqueta="Número de tarjeta"
                id={idDe('numero')}
                value={tarjeta.numero}
                onChange={(v) => set('numero', formatearNumeroTarjeta(v))}
                onBlur={() => tocar('numero')}
                error={errorVisible('numero')}
                placeholder="0000 0000 0000 0000"
                inputMode="numeric"
                maxLength={19}
                monoespaciado
              />
              <div className="grid grid-cols-2 gap-4">
                <CampoTarjeta
                  etiqueta="Vencimiento"
                  id={idDe('vencimiento')}
                  value={tarjeta.vencimiento}
                  onChange={(v) => set('vencimiento', formatearVencimiento(v))}
                  onBlur={() => tocar('vencimiento')}
                  error={errorVisible('vencimiento')}
                  placeholder="MM/AA"
                  inputMode="numeric"
                  maxLength={5}
                  monoespaciado
                />
                <CampoTarjeta
                  etiqueta="CVV"
                  id={idDe('cvv')}
                  value={tarjeta.cvv}
                  onChange={(v) => set('cvv', v.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => tocar('cvv')}
                  error={errorVisible('cvv')}
                  placeholder="123"
                  inputMode="numeric"
                  maxLength={3}
                  monoespaciado
                />
              </div>
            </div>
          </section>

          {/* La reserva no se creo. Al ser un pago simulado no hay nada que
              revertir, y decirlo evita que la persona crea que se le cobro. */}
          {errorAlGuardar && (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-nv-error-line bg-nv-error-bg px-4 py-3 text-sm text-nv-error"
            >
              <p>{errorAlGuardar}</p>
              <p className="mt-1 font-medium">No se realizó ningún cobro.</p>
            </div>
          )}

          <button
            type="submit"
            disabled={guardando}
            aria-busy={guardando}
            className={`${boton.acento} mt-8 inline-flex w-full items-center justify-center gap-2 px-8 py-[15px] text-[14.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nv-accent active:scale-[0.98] sm:w-auto`}
          >
            <Lock aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            {guardando ? 'Reservando…' : 'Pagar abono y reservar'}
          </button>
          <p className="mt-3 text-xs text-nv-soft1">
            Se simula un cargo de {formatPrice(abono)}. Los datos de la tarjeta no salen de tu
            navegador.
          </p>
        </form>
      </div>

      <aside className="h-fit rounded-[10px] border border-nv-line1 bg-nv-surface p-5 sm:p-[22px] lg:sticky lg:top-[100px]">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-nv-soft1">Tu reserva</h2>
        <p className="mt-4 font-serif text-xl font-light text-nv-ink">{servicioNombre}</p>
        <p className="mt-1 text-[13px] text-nv-soft1">
          {profesionalNombre} · {formatLongDate(dateISO)} · {time} h
        </p>

        <dl className="mt-5 space-y-2 border-t border-nv-line1 pt-4 text-sm">
          <div className="flex justify-between text-nv-muted1">
            <dt>Total del servicio</dt>
            <dd className="text-nv-ink">{formatPrice(precio)}</dd>
          </div>
          <div className="flex justify-between text-nv-muted1">
            <dt>Saldo a pagar en el estudio</dt>
            <dd className="text-nv-ink">{formatPrice(saldoTrasAbono(precio, abono))}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-nv-line1 pt-3 text-nv-ink">
            <dt className="text-base">Abono hoy</dt>
            <dd className="font-serif text-2xl font-light">{formatPrice(abono)}</dd>
          </div>
        </dl>

        <p className="mt-5 rounded-lg bg-nv-paper2 px-4 py-3 text-xs leading-relaxed text-nv-muted1">
          {POLITICA_ABONO}
        </p>
      </aside>
    </div>
  )
}

const claseInput =
  'w-full rounded-lg border bg-nv-surface px-3.5 py-3 text-sm text-nv-ink outline-none transition-[border-color,box-shadow] placeholder:text-nv-faint2 focus-visible:border-nv-ink focus-visible:ring-2 focus-visible:ring-nv-accent/20'

function CampoTarjeta({
  etiqueta,
  id,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  inputMode,
  maxLength,
  monoespaciado = false,
}: {
  etiqueta: string
  id: string
  value: string
  onChange: (valor: string) => void
  onBlur: () => void
  error?: string
  placeholder?: string
  inputMode?: 'numeric'
  maxLength: number
  /** Digitos de ancho fijo: los grupos del numero no "bailan" al escribir. */
  monoespaciado?: boolean
}) {
  const idError = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs text-nv-soft1">
        {etiqueta}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        // "off" y no "cc-*": con cc-* el navegador ofrece guardar la tarjeta, y
        // estos datos no deben quedar en ninguna parte.
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`${claseInput} ${error ? 'border-nv-error' : 'border-nv-line2'} ${
          monoespaciado ? 'font-mono tracking-[0.06em] tabular-nums' : ''
        }`}
      />
      {error && (
        <p id={idError} className="mt-1.5 text-xs text-nv-error">
          {error}
        </p>
      )}
    </div>
  )
}
