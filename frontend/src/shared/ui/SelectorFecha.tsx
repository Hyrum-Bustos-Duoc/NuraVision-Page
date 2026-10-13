import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatLongDate, monthLabel, MONTHS_SHORT } from '@/shared/lib/format'
import {
  fechaDesdePartes,
  fechaLegible,
  hoyISO,
  inicioDeSemana,
  limitarFecha,
  partesISO,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from '@/shared/lib/calendario'

/**
 * Selector de fecha con calendario propio.
 *
 * Existe porque el `<input type="date">` nativo, para una fecha de nacimiento,
 * obliga en varios navegadores a retroceder mes a mes durante decadas. Aqui el
 * mes y el año del encabezado son botones que abren una vista de años en
 * grilla y otra de meses: tres toques para llegar a cualquier fecha.
 *
 * En escritorio es un popover anclado al campo. Con ventana angosta (bajo
 * 640 px) o baja (bajo ~500 px, un telefono apaisado) es una hoja inferior
 * modal: un popover en 390 px de alto no cabe sin scroll anidado. El corte va
 * en la variante `[@media(min-width:40rem)_and_(min-height:31.3rem)]`, repetida
 * en cada clase porque Tailwind necesita leer los nombres completos. Las dos formas son el mismo nodo con clases distintas: el
 * codigo distingue cual se pinto leyendo su `position` calculada, asi el corte
 * vive solo en las clases y no hay un segundo breakpoint escrito en JavaScript.
 *
 * No usa `useCapaFlotante` porque ese hook devuelve siempre el foco al abridor
 * al cerrar, y aqui el clic fuera debe dejar el foco donde se hizo clic.
 */

type Vista = 'dias' | 'meses' | 'anios'

/** Que hacer con el foco despues de pintar. 'centrar' ademas desplaza la lista de años. */
type Enfoque = 'no' | 'si' | 'centrar'

const DIAS_SEMANA = [
  { corto: 'lu', largo: 'lunes' },
  { corto: 'ma', largo: 'martes' },
  { corto: 'mi', largo: 'miércoles' },
  { corto: 'ju', largo: 'jueves' },
  { corto: 'vi', largo: 'viernes' },
  { corto: 'sá', largo: 'sábado' },
  { corto: 'do', largo: 'domingo' },
]

const COLUMNAS_ANIOS = 4
const COLUMNAS_MESES = 3

/** Aire entre el popover y el borde de la ventana. */
const MARGEN_VENTANA = 12
/** Separacion entre el campo y el popover: tiene que coincidir con su `mt-2`/`mb-2`. */
const SEPARACION_PANEL = 8

/** Botones que Tab puede alcanzar dentro del panel, en orden de documento. */
function enfocablesDe(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled)')).filter(
    (b) => b.tabIndex >= 0,
  )
}

const celdaBase =
  'flex items-center justify-center rounded-full text-sm tabular-nums transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.94] disabled:cursor-not-allowed disabled:text-nv-faint2 disabled:opacity-50 disabled:active:scale-100'

function claseCelda({ elegida, actual }: { elegida: boolean; actual: boolean }): string {
  if (elegida) return `${celdaBase} bg-nv-ink font-medium text-nv-bg`
  if (actual) return `${celdaBase} font-medium text-nv-accent ring-1 ring-inset ring-nv-accent-line2 hover:bg-nv-accent-wash4`
  return `${celdaBase} text-ink hover:bg-nv-paper4`
}

const botonEncabezado =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-serif-display text-xl text-ink transition-colors hover:bg-nv-paper4'

const botonFlecha =
  'flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink transition-[background-color,opacity] hover:bg-ivory disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'

const botonPie =
  'rounded-full px-3 py-1.5 text-xs font-medium text-nv-muted1 transition-colors hover:bg-nv-paper4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

export function SelectorFecha({
  etiqueta,
  valor,
  onCambio,
  minimo,
  maximo,
  sugerida,
}: {
  etiqueta: string
  /** 'YYYY-MM-DD' o `null` si no hay fecha elegida. */
  valor: string | null
  onCambio: (valor: string | null) => void
  minimo: string
  maximo: string
  /**
   * Donde abrir cuando aun no hay fecha. Sin valor el calendario abre en la
   * vista de años, y esta fecha decide que año queda enfocado y a la vista.
   */
  sugerida?: string
}) {
  const id = useId()
  const idTitulo = `${id}-titulo`
  const idEtiqueta = `${id}-etiqueta`
  const idValor = `${id}-valor`
  const [abierto, setAbierto] = useState(false)
  const [vista, setVista] = useState<Vista>('dias')
  // Una sola fecha decide que se ve: el mes de la vista de dias, el año de la
  // de meses y la celda con foco. Guardar mes y año aparte permitiria que se
  // contradijeran con el dia enfocado.
  const [foco, setFoco] = useState(maximo)
  const enfoque = useRef<Enfoque>('no')
  const contenedorRef = useRef<HTMLDivElement>(null)
  const disparadorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listaAniosRef = useRef<HTMLDivElement>(null)
  const reservaRef = useRef<HTMLDivElement>(null)

  /**
   * Cierre con vuelta del foco al campo: Escape, elegir, Limpiar, Cerrar y el
   * velo movil. El campo siempre esta montado, asi que se enfoca en el acto.
   */
  function cerrarYVolver() {
    setAbierto(false)
    disparadorRef.current?.focus()
  }

  // Popover de escritorio: debe caber en la ventana. Primero desplaza la pagina
  // lo justo para que quepa debajo sin sacar el campo por arriba; si ni asi
  // cabe (ventana baja), abre hacia el lado con mas espacio y limita el alto.
  // Va en layout effect para medir y recolocar antes de pintar, sin parpadeo.
  // Toca el DOM directamente porque es medicion de la ventana, no estado.
  useLayoutEffect(() => {
    const panel = panelRef.current
    const campo = disparadorRef.current
    const reserva = reservaRef.current
    if (!abierto || !panel || !campo || !reserva) return
    if (getComputedStyle(panel).position === 'fixed') return

    // Se parte de cero: en desarrollo StrictMode corre esto dos veces, y medir
    // con el alto ya limitado de la primera pasada daria un alto falso.
    panel.dataset.lado = 'abajo'
    panel.style.maxHeight = ''
    const alto = panel.offsetHeight

    // El panel es absoluto y el documento puede terminar justo en su borde: el
    // navegador no deja desplazar mas alla, y el margen con la ventana se
    // perdia. La reserva es un bloque invisible que alarga el documento hasta
    // el borde del panel mas el margen, para que ese desplazamiento exista.
    const reservar = (altoPanel: number) => {
      reserva.style.height = `${SEPARACION_PANEL + altoPanel + MARGEN_VENTANA}px`
    }
    reservar(alto)

    let caja = campo.getBoundingClientRect()
    const falta = caja.bottom + SEPARACION_PANEL + alto + MARGEN_VENTANA - window.innerHeight
    if (falta > 0) {
      window.scrollBy({ top: Math.min(falta, Math.max(0, caja.top - MARGEN_VENTANA)), behavior: 'instant' })
      caja = campo.getBoundingClientRect()
    }

    const abajo = window.innerHeight - caja.bottom - SEPARACION_PANEL - MARGEN_VENTANA
    if (alto <= abajo) return

    // Ni desplazando cabe: se abre hacia el lado con mas espacio y se limita
    // el alto. El contenido del panel se encoge con scroll propio; el pie no.
    const arriba = caja.top - SEPARACION_PANEL - MARGEN_VENTANA
    const haciaArriba = arriba > abajo
    const disponible = Math.floor(haciaArriba ? arriba : abajo)
    panel.dataset.lado = haciaArriba ? 'arriba' : 'abajo'
    panel.style.maxHeight = `${disponible}px`
    if (haciaArriba) reserva.style.height = '0px'
    else reservar(disponible)
  }, [abierto])

  // Capa abierta: Escape, clic fuera y, solo en la hoja movil (que es modal),
  // bloqueo del scroll del fondo y foco atrapado dentro de la hoja.
  useEffect(() => {
    const panel = panelRef.current
    if (!abierto || !panel) return
    const esHoja = getComputedStyle(panel).position === 'fixed'
    panel.setAttribute('aria-modal', String(esHoja))

    function alPresionarTecla(evento: globalThis.KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        cerrarYVolver()
        return
      }
      if (evento.key !== 'Tab' || !esHoja || !panel) return
      const enfocables = enfocablesDe(panel)
      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      if (!primero || !ultimo) return
      const activo = document.activeElement
      const fuera = !(activo instanceof Node) || !panel.contains(activo) || activo === panel
      if (evento.shiftKey && (fuera || activo === primero)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && (fuera || activo === ultimo)) {
        evento.preventDefault()
        primero.focus()
      }
    }

    // Sin devolver el foco: va a donde se hizo clic, como en cualquier capa.
    function alPresionarFuera(evento: PointerEvent) {
      if (evento.target instanceof Node && contenedorRef.current?.contains(evento.target)) return
      setAbierto(false)
    }

    document.addEventListener('keydown', alPresionarTecla)
    document.addEventListener('pointerdown', alPresionarFuera)
    const overflowPrevio = document.body.style.overflow
    if (esHoja) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alPresionarTecla)
      document.removeEventListener('pointerdown', alPresionarFuera)
      if (esHoja) document.body.style.overflow = overflowPrevio
    }
  }, [abierto])

  // Lleva el foco del DOM a la celda enfocada despues de pintar. Sin
  // dependencias a proposito: corre tras cada render, pero solo actua cuando un
  // manejador de teclado o de cambio de vista lo pidio. Las flechas de mes no lo
  // piden, para que el foco se quede en la flecha al hacer clic seguido.
  useEffect(() => {
    if (enfoque.current === 'no') return
    const modo = enfoque.current
    enfoque.current = 'no'
    const celda = panelRef.current?.querySelector<HTMLElement>('[data-foco="true"]')
    if (!celda) return
    const lista = listaAniosRef.current
    if (modo === 'centrar' && lista) {
      lista.scrollTop = celda.offsetTop - (lista.clientHeight - celda.offsetHeight) / 2
      celda.focus({ preventScroll: true })
    } else {
      celda.focus()
    }
  })

  const { anio, mes, dia } = partesISO(foco)
  const elegida = valor ? partesISO(valor) : null
  const hoy = hoyISO()
  const partesHoy = partesISO(hoy)

  function abrir() {
    const vistaInicial: Vista = valor ? 'dias' : 'anios'
    setFoco(limitarFecha(valor ?? sugerida ?? maximo, minimo, maximo))
    setVista(vistaInicial)
    enfoque.current = vistaInicial === 'anios' ? 'centrar' : 'si'
    setAbierto(true)
  }

  function moverFoco(destino: string, modo: Enfoque = 'si') {
    setFoco(limitarFecha(destino, minimo, maximo))
    enfoque.current = modo
  }

  function cambiarVista(nueva: Vista) {
    setVista(nueva)
    enfoque.current = nueva === 'anios' ? 'centrar' : 'si'
  }

  function elegir(iso: string) {
    onCambio(iso)
    cerrarYVolver()
  }

  /**
   * Las celdas tambien siguen al foco real, no solo a las flechas: el cursor
   * virtual de un lector de pantalla, o Tab tras un clic, pueden enfocar otra
   * celda, y la siguiente flecha debe partir de ahi.
   */
  function alEnfocarCelda(iso: string) {
    setFoco(limitarFecha(iso, minimo, maximo))
  }

  function teclaEnDias(evento: KeyboardEvent) {
    const destinos: Record<string, () => string> = {
      ArrowLeft: () => sumarDias(foco, -1),
      ArrowRight: () => sumarDias(foco, 1),
      ArrowUp: () => sumarDias(foco, -7),
      ArrowDown: () => sumarDias(foco, 7),
      Home: () => inicioDeSemana(foco),
      End: () => sumarDias(inicioDeSemana(foco), 6),
      PageUp: () => sumarMeses(foco, evento.shiftKey ? -12 : -1),
      PageDown: () => sumarMeses(foco, evento.shiftKey ? 12 : 1),
    }
    const destino = destinos[evento.key]
    if (!destino) return
    evento.preventDefault()
    moverFoco(destino())
  }

  /**
   * Flechas en las grillas de meses y de años. Las dos se mueven en meses: un
   * paso es 1 mes en la de meses y 12 en la de años, asi el dia elegido se
   * conserva al ir y volver entre vistas.
   */
  function teclaEnRejilla(evento: KeyboardEvent, paso: number, columnas: number) {
    const saltos: Record<string, number> = {
      ArrowLeft: -paso,
      ArrowRight: paso,
      ArrowUp: -paso * columnas,
      ArrowDown: paso * columnas,
    }
    const salto = saltos[evento.key]
    if (salto === undefined) return
    evento.preventDefault()
    moverFoco(sumarMeses(foco, salto))
  }

  const sinMesAnterior = fechaDesdePartes(anio, mes, 1) <= minimo
  const sinMesSiguiente = fechaDesdePartes(anio, mes + 1, 1) > maximo
  const { anio: anioMinimo } = partesISO(minimo)
  const { anio: anioMaximo } = partesISO(maximo)
  const anios = Array.from({ length: anioMaximo - anioMinimo + 1 }, (_, i) => anioMinimo + i)

  return (
    <div>
      {/* Etiqueta propia y no la de `Field`: el campo necesita su id para que
          el nombre accesible sea etiqueta + fecha elegida. Con solo el
          <label for>, el lector anunciaria "Cumpleaños" y nunca la fecha. */}
      <label
        id={idEtiqueta}
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-[0.14em] text-muted"
      >
        {etiqueta}
      </label>
      <div
        ref={contenedorRef}
        className="relative mt-2"
        onBlur={(evento) => {
          // Tab fuera del popover de escritorio lo cierra (en la hoja movil el
          // foco no puede salir). Al desmontarse una celda enfocada no hay
          // `relatedTarget`, y eso no cuenta como salir.
          const destino = evento.relatedTarget
          if (abierto && destino instanceof Node && !evento.currentTarget.contains(destino)) {
            setAbierto(false)
          }
        }}
      >
        <button
          ref={disparadorRef}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-labelledby={`${idEtiqueta} ${idValor}`}
          onClick={abierto ? cerrarYVolver : abrir}
          className={`flex w-full items-center gap-3 rounded-lg border bg-paper py-3 pl-4 text-left text-sm outline-none transition-[border-color,box-shadow] hover:border-muted-light focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-nv-accent/20 ${
            valor ? 'pr-11' : 'pr-4'
          } ${abierto ? 'border-ink' : 'border-line'}`}
        >
          <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
          <span id={idValor} className={`flex-1 truncate ${valor ? 'text-ink' : 'text-nv-muted1'}`}>
            {valor ? formatLongDate(valor) : 'Elige una fecha'}
          </span>
          {!valor && (
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ease-out ${
                abierto ? 'rotate-180' : ''
              }`}
            />
          )}
        </button>

        {valor && (
          <button
            type="button"
            aria-label="Borrar la fecha"
            onClick={() => {
              onCambio(null)
              // El boton desaparece al borrar; sin esto el foco caeria en <body>.
              disparadorRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted transition-colors hover:bg-nv-paper4 hover:text-ink"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}

        {abierto && (
          <>
            {/* Velo solo en movil, donde el calendario es una hoja inferior. */}
            <div
              aria-hidden="true"
              onClick={cerrarYVolver}
              className="fixed inset-0 z-[89] bg-ink/30 transition-opacity duration-200 starting:opacity-0 [@media(min-width:40rem)_and_(min-height:31.3rem)]:hidden"
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-label={etiqueta}
              tabIndex={-1}
              className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex w-full max-w-md max-h-[calc(100dvh-0.5rem)] flex-col rounded-t-2xl border border-line-soft bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-panel outline-none transition-[opacity,translate,scale] duration-200 ease-out-soft starting:translate-y-6 starting:opacity-0 [@media(min-width:40rem)_and_(min-height:31.3rem)]:absolute [@media(min-width:40rem)_and_(min-height:31.3rem)]:inset-x-auto [@media(min-width:40rem)_and_(min-height:31.3rem)]:bottom-auto [@media(min-width:40rem)_and_(min-height:31.3rem)]:left-0 [@media(min-width:40rem)_and_(min-height:31.3rem)]:top-full [@media(min-width:40rem)_and_(min-height:31.3rem)]:mt-2 [@media(min-width:40rem)_and_(min-height:31.3rem)]:max-h-none [@media(min-width:40rem)_and_(min-height:31.3rem)]:w-[21rem] [@media(min-width:40rem)_and_(min-height:31.3rem)]:origin-top-left [@media(min-width:40rem)_and_(min-height:31.3rem)]:rounded-2xl [@media(min-width:40rem)_and_(min-height:31.3rem)]:pb-3 [@media(min-width:40rem)_and_(min-height:31.3rem)]:shadow-lift [@media(min-width:40rem)_and_(min-height:31.3rem)]:starting:translate-y-0 [@media(min-width:40rem)_and_(min-height:31.3rem)]:starting:scale-[0.98] [@media(min-width:40rem)_and_(min-height:31.3rem)]:data-[lado=arriba]:top-auto [@media(min-width:40rem)_and_(min-height:31.3rem)]:data-[lado=arriba]:bottom-full [@media(min-width:40rem)_and_(min-height:31.3rem)]:data-[lado=arriba]:mb-2 [@media(min-width:40rem)_and_(min-height:31.3rem)]:data-[lado=arriba]:mt-0 [@media(min-width:40rem)_and_(min-height:31.3rem)]:data-[lado=arriba]:origin-bottom-left"
            >
              {/* Solo en la hoja: asa y nombre del campo, que el popover no
                  necesita porque se abre pegado a su etiqueta. */}
              <div className="mb-3 shrink-0 [@media(min-width:40rem)_and_(min-height:31.3rem)]:hidden">
                <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-nv-line3" />
                <p className="mt-2.5 px-2.5 text-xs font-medium uppercase tracking-[0.14em] text-nv-muted1">
                  {etiqueta}
                </p>
              </div>

              {/* Alto fijo para las tres vistas: la hoja movil no cambia de
                  tamaño al pasar de años a meses a dias. Si la ventana no da
                  para tanto, esto se encoge y desplaza (una sola zona con
                  scroll: en la vista de años se desplaza la lista, no esto); el
                  pie queda siempre a la vista. El padding negativo deja sitio
                  al contorno de foco, que el overflow recortaria. */}
              <div className="-mx-1 flex h-[21rem] min-h-0 shrink flex-col overflow-y-auto overscroll-contain px-1">

                {vista === 'dias' && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => cambiarVista('meses')}
                          aria-label={`Cambiar mes, ahora ${monthLabel(anio, mes)}`}
                          className={botonEncabezado}
                        >
                          {monthLabel(anio, mes).split(' ')[0]}
                          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
                        </button>
                        <button
                          type="button"
                          onClick={() => cambiarVista('anios')}
                          aria-label={`Cambiar año, ahora ${anio}`}
                          className={`${botonEncabezado} tabular-nums`}
                        >
                          {anio}
                          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => moverFoco(sumarMeses(foco, -1), 'no')}
                          disabled={sinMesAnterior}
                          aria-label="Mes anterior"
                          className={botonFlecha}
                        >
                          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moverFoco(sumarMeses(foco, 1), 'no')}
                          disabled={sinMesSiguiente}
                          aria-label="Mes siguiente"
                          className={botonFlecha}
                        >
                          <ChevronRight aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Anuncia el mes al cambiarlo con las flechas o el teclado. */}
                    <p id={idTitulo} aria-live="polite" className="sr-only">
                      {monthLabel(anio, mes)}
                    </p>

                    <table
                      role="grid"
                      aria-labelledby={idTitulo}
                      onKeyDown={teclaEnDias}
                      className="mt-3 w-full table-fixed border-collapse"
                    >
                      <thead>
                        <tr>
                          {DIAS_SEMANA.map((d) => (
                            <th
                              key={d.largo}
                              scope="col"
                              abbr={d.largo}
                              className="pb-1.5 text-center text-[11px] font-medium uppercase tracking-[0.1em] text-nv-muted1"
                            >
                              {d.corto}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      {/* La clave por mes repite el fundido solo al cambiar de mes,
                          no al moverse dia a dia dentro del mismo. */}
                      <tbody key={`${anio}-${mes}`} className="animate-fade-in">
                        {semanasDelMes(anio, mes).map((semana, i) => (
                          <tr key={i}>
                            {semana.map((celda, j) => {
                              if (!celda) return <td key={j} className="p-0.5" />
                              const esElegida = celda.iso === valor
                              const esFoco = celda.iso === foco
                              return (
                                <td key={j} role="gridcell" aria-selected={esElegida} className="p-0.5">
                                  <button
                                    type="button"
                                    tabIndex={esFoco ? 0 : -1}
                                    data-foco={esFoco}
                                    disabled={celda.iso < minimo || celda.iso > maximo}
                                    aria-label={fechaLegible(celda.iso)}
                                    aria-current={celda.iso === hoy ? 'date' : undefined}
                                    onClick={() => elegir(celda.iso)}
                                    onFocus={() => alEnfocarCelda(celda.iso)}
                                    className={`mx-auto h-10 w-10 ${claseCelda({
                                      elegida: esElegida,
                                      actual: celda.iso === hoy,
                                    })}`}
                                  >
                                    {celda.dia}
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {vista === 'meses' && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => cambiarVista('anios')}
                        aria-label={`Cambiar año, ahora ${anio}`}
                        className={`${botonEncabezado} tabular-nums`}
                      >
                        {anio}
                        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
                      </button>
                      <p className="text-xs text-nv-muted1">Elige el mes</p>
                    </div>
                    <div
                      onKeyDown={(e) => teclaEnRejilla(e, 1, COLUMNAS_MESES)}
                      className="mt-3 grid animate-fade-in grid-cols-3 gap-1.5"
                    >
                      {MONTHS_SHORT.map((nombre, m) => {
                        const esFoco = m === mes
                        return (
                          <button
                            key={nombre}
                            type="button"
                            tabIndex={esFoco ? 0 : -1}
                            data-foco={esFoco}
                            disabled={
                              fechaDesdePartes(anio, m, 1) > maximo ||
                              fechaDesdePartes(anio, m, 31) < minimo
                            }
                            aria-label={monthLabel(anio, m)}
                            aria-pressed={elegida?.anio === anio && elegida.mes === m}
                            onFocus={() => alEnfocarCelda(fechaDesdePartes(anio, m, dia))}
                            onClick={() => {
                              moverFoco(fechaDesdePartes(anio, m, dia))
                              setVista('dias')
                            }}
                            className={`h-12 ${claseCelda({
                              elegida: elegida?.anio === anio && elegida.mes === m,
                              actual: partesHoy.anio === anio && partesHoy.mes === m,
                            })}`}
                          >
                            {nombre}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                {vista === 'anios' && (
                  <>
                    <p className="px-2.5 py-1 font-serif-display text-xl text-ink">Elige el año</p>
                    {/* El padding interior deja ver el contorno de foco, que el
                        overflow recortaria; el degradado de los bordes y la barra
                        fina avisan que hay mas años arriba y abajo. */}
                    <div
                      ref={listaAniosRef}
                      onKeyDown={(e) => teclaEnRejilla(e, 12, COLUMNAS_ANIOS)}
                      className="relative mt-2 min-h-0 flex-1 animate-fade-in overflow-y-auto overscroll-contain p-1.5 [mask-image:linear-gradient(to_bottom,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] [scrollbar-width:thin]"
                    >
                      <div className="grid grid-cols-4 gap-1.5">
                        {anios.map((a) => {
                          const esFoco = a === anio
                          return (
                            <button
                              key={a}
                              type="button"
                              tabIndex={esFoco ? 0 : -1}
                              data-foco={esFoco}
                              aria-pressed={elegida?.anio === a}
                              onFocus={() => alEnfocarCelda(fechaDesdePartes(a, mes, dia))}
                              onClick={() => {
                                moverFoco(fechaDesdePartes(a, mes, dia))
                                setVista('meses')
                              }}
                              className={`h-10 ${claseCelda({
                                elegida: elegida?.anio === a,
                                actual: partesHoy.anio === a,
                              })}`}
                            >
                              {a}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 flex shrink-0 items-center justify-between border-t border-line-soft pt-3">
                <button
                  type="button"
                  onClick={() => {
                    onCambio(null)
                    cerrarYVolver()
                  }}
                  disabled={!valor}
                  className={botonPie}
                >
                  Limpiar
                </button>
                <button type="button" onClick={cerrarYVolver} className={botonPie}>
                  Cerrar
                </button>
              </div>
            </div>
            <div ref={reservaRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-full w-px" />
          </>
        )}
      </div>
    </div>
  )
}
