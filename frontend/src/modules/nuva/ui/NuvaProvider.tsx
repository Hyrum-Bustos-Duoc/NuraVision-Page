import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCarrito } from '@/modules/carrito/ui/useCarrito'
import { obtenerServicios } from '@/modules/servicios/application'
import type { Servicio } from '@/modules/servicios/domain/servicio.types'
import { servicioRepository } from '@/modules/servicios/infrastructure/supabase-servicio.repository'
import { etiquetaDePrecio } from '@/modules/servicios/ui/precio'
import { useCatalogo } from '@/modules/tienda/ui/useCatalogo'
import { formatPrice } from '@/shared/lib/format'
import { useAppState } from '@/shared/state/AppState'
import { MENSAJE_INICIAL, responder, respuestaUpsell } from '../domain/nuva.motor'
import type { ContextoNuva, Mensaje, MensajeNuva, RespuestaNuva } from '../domain/nuva.types'
import { NuvaContext, type HorarioElegido, type NuvaValue } from './nuva.context'

/** Pausa de "escribiendo…" antes de cada respuesta (spec §12.2). */
const DEMORA_RESPUESTA = 800
const DEMORA_TRAS_RESERVAR = 900

function mensajeInicial(): Mensaje[] {
  return [{ id: 0, de: 'nuva', ...MENSAJE_INICIAL }]
}

/**
 * Estado de la conversacion con Nuva, compartido por el launcher, el panel, el
 * hero, la banda de la portada y los links de Ayuda del footer.
 *
 * Los servicios se cargan la primera vez que se abre el panel, no al entrar al
 * sitio: la mayoria de las visitas nunca habla con Nuva.
 */
export function NuvaProvider({ children }: { children: ReactNode }) {
  const catalogo = useCatalogo()
  const carrito = useCarrito()
  const { setBookingDraft } = useAppState()

  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>(mensajeInicial)
  const [escribiendo, setEscribiendo] = useState(false)
  const [agregados, setAgregados] = useState<ReadonlySet<string>>(new Set())

  const siguienteId = useRef(1)
  const ultimaRecomendacion = useRef<string[]>([])
  const servicios = useRef<Promise<Servicio[]> | null>(null)
  const temporizador = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  const cargarServicios = useCallback(() => {
    // Si falla, Nuva sigue respondiendo lo que no depende de servicios.
    servicios.current ??= obtenerServicios(servicioRepository).catch(() => [])
    return servicios.current
  }, [])

  const publicar = useCallback((mensaje: Omit<MensajeNuva, 'id' | 'de'> | Omit<Mensaje, 'id'>) => {
    const id = siguienteId.current++
    const completo = ('de' in mensaje ? { ...mensaje, id } : { ...mensaje, id, de: 'nuva' }) as Mensaje
    setMensajes((prev) => [...prev, completo])
  }, [])

  const marcarAgregados = useCallback((slugs: string[]) => {
    setAgregados((prev) => new Set([...prev, ...slugs]))
  }, [])

  // El contexto se lee en el momento de responder, no al enviar: asi "agregar
  // todo" ve el carrito tal como esta cuando Nuva contesta.
  const estado = useRef({ catalogo, carrito })
  useEffect(() => {
    estado.current = { catalogo, carrito }
  }, [catalogo, carrito])

  const aplicar = useCallback(
    (respuesta: RespuestaNuva) => {
      if (respuesta.recomendacion) ultimaRecomendacion.current = respuesta.recomendacion
      if (respuesta.agregar) {
        for (const slug of respuesta.agregar) estado.current.carrito.agregar(slug, 1, { abrir: false })
        marcarAgregados(respuesta.agregar)
      }
      publicar(respuesta.mensaje)
    },
    [publicar, marcarAgregados],
  )

  const enviar = useCallback(
    (texto: string) => {
      const limpio = texto.trim()
      if (!limpio) return
      setAbierto(true)
      publicar({ de: 'usuaria', texto: limpio })
      setEscribiendo(true)
      const pendientes = cargarServicios()

      window.clearTimeout(temporizador.current)
      temporizador.current = window.setTimeout(() => {
        void pendientes.then((lista) => {
          const { catalogo: cat, carrito: car } = estado.current
          const contexto: ContextoNuva = {
            productos: cat.productos,
            servicios: lista.map((s) => ({
              id: s.id,
              nombre: s.nombre,
              duracionMinutos: s.duracionMinutos,
              precioTexto: etiquetaDePrecio(s),
            })),
            carrito: { unidades: car.unidades, totalTexto: formatPrice(car.subtotal) },
            ultimaRecomendacion: ultimaRecomendacion.current,
          }
          const respuesta = responder(limpio, contexto)
          // "Agregar todo" informa el total con lo recien agregado incluido.
          if (respuesta.agregar) {
            const extra = respuesta.agregar.reduce((t, slug) => t + (cat.porSlug(slug)?.precio ?? 0), 0)
            const unidades = car.unidades + respuesta.agregar.length
            respuesta.mensaje.texto += ` Llevas ${unidades} ${unidades === 1 ? 'ítem' : 'ítems'} por ${formatPrice(car.subtotal + extra)}.`
          }
          aplicar(respuesta)
          setEscribiendo(false)
        })
      }, DEMORA_RESPUESTA)
    },
    [publicar, cargarServicios, aplicar],
  )

  const agregarProducto = useCallback(
    (mensaje: MensajeNuva, slug: string) => {
      // No abre el drawer: la conversacion sigue en foco (spec §12.2).
      estado.current.carrito.agregar(slug, 1, { abrir: false })
      if (mensaje.paraLaCita) estado.current.carrito.preferirEntregaEnCita(true)
      marcarAgregados([slug])
    },
    [marcarAgregados],
  )

  const elegirHorario = useCallback(
    (mensaje: MensajeNuva, horario: HorarioElegido) => {
      const servicioId = mensaje.servicioId
      if (!servicioId) return
      setMensajes((prev) => prev.map((m) => (m.id === mensaje.id ? { ...m, horarioElegido: horario.etiqueta } : m)))
      publicar({ de: 'usuaria', texto: horario.etiqueta })
      setEscribiendo(true)

      // Se deja todo listo en el asistente de reserva real. La reserva se crea
      // ahi, con contacto o sesion: Nuva no afirma haber reservado algo que
      // todavia no existe en la base.
      setBookingDraft(() => ({
        serviceId: servicioId,
        professionalId: horario.profesionalId,
        dateISO: horario.dateISO,
        time: horario.time,
      }))

      window.clearTimeout(temporizador.current)
      temporizador.current = window.setTimeout(() => {
        void cargarServicios().then((lista) => {
          const servicio = lista.find((s) => s.id === servicioId)
          publicar({
            texto: `Te dejé lista ${servicio?.nombre ?? 'tu hora'} con ${horario.profesionalNombre} para ${horario.etiqueta}. Confírmala en un paso para que quede a tu nombre y te llegue el correo.`,
            acciones: ['confirmar-reserva'],
          })
          const producto = estado.current.catalogo.productos.find((p) => p.servicioId === servicioId)
          if (producto) aplicar(respuestaUpsell(producto))
          setEscribiendo(false)
        })
      }, DEMORA_TRAS_RESERVAR)
    },
    [publicar, setBookingDraft, cargarServicios, aplicar],
  )

  const declinar = useCallback(() => {
    publicar({ de: 'usuaria', texto: 'No, gracias' })
    publicar({ texto: 'Perfecto. Si necesitas algo más, aquí estoy.', chips: ['Ver mi carrito', 'Busco un regalo'] })
  }, [publicar])

  const reiniciar = useCallback(() => {
    window.clearTimeout(temporizador.current)
    setEscribiendo(false)
    setMensajes(mensajeInicial())
    setAgregados(new Set())
    ultimaRecomendacion.current = []
  }, [])

  const abrir = useCallback(() => {
    void cargarServicios()
    setAbierto(true)
  }, [cargarServicios])
  const cerrar = useCallback(() => setAbierto(false), [])
  const alternar = useCallback(() => {
    void cargarServicios()
    setAbierto((v) => !v)
  }, [cargarServicios])

  const value = useMemo<NuvaValue>(
    () => ({
      abierto,
      abrir,
      cerrar,
      alternar,
      mensajes,
      escribiendo,
      agregados,
      enviar,
      agregarProducto,
      elegirHorario,
      declinar,
      reiniciar,
    }),
    [abierto, abrir, cerrar, alternar, mensajes, escribiendo, agregados, enviar, agregarProducto, elegirHorario, declinar, reiniciar],
  )

  return <NuvaContext.Provider value={value}>{children}</NuvaContext.Provider>
}
