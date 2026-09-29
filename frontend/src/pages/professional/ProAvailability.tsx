import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAppState } from '@/shared/state/AppState'
import { useToast } from '@/shared/state/Toast'
import { TODAY_ISO } from '@/shared/data/seed'
import { AvailabilityEditor } from '@/shared/components/AvailabilityEditor'
import { Button } from '@/shared/ui/ui'
import { parseISODate } from '@/shared/lib/format'
import type { WeeklyAvailability } from '@/shared/types'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'
import { guardarDisponibilidad } from '@/modules/profesionales/application'
import { profesionalRepository } from '@/modules/profesionales/infrastructure/supabase-profesional.repository'

export default function ProAvailability() {
  const { bookings } = useAppState()
  const { toast } = useToast()
  // La ficha sale de la base: antes se buscaba en los datos de ejemplo con el
  // `professionalId` del usuario de demostracion y, con el modo "solo
  // Supabase" activo, no habia nada que encontrar.
  const mia = useMiFichaProfesional()
  const professional = mia.ficha
  const [draft, setDraft] = useState<WeeklyAvailability | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * El horario llega despues que la ficha: son dos consultas. Si el borrador
   * se inicializara solo en el primer render se quedaria vacio para siempre,
   * que es justo lo que pasaba.
   *
   * La clave incluye el horario y no solo el id, porque el id ya esta resuelto
   * cuando la agenda todavia no ha llegado. Se ajusta durante el render, que
   * es el patron que recomienda React, en vez de en un efecto.
   */
  const claveFicha = professional
    ? `${professional.id}|${JSON.stringify(professional.availability)}`
    : ''
  const [claveprevia, setClavePrevia] = useState('')
  if (claveFicha !== claveprevia) {
    setClavePrevia(claveFicha)
    setDraft(professional?.availability ?? null)
    setError(null)
  }

  /** Reservas confirmadas que quedarían fuera del horario que se está editando. */
  const conflicts = useMemo(() => {
    if (!professional || !draft) return []
    return bookings.filter((b) => {
      if (b.professionalId !== professional.id) return false
      if (b.status === 'cancelada' || b.status === 'completada') return false
      if (b.dateISO < TODAY_ISO) return false

      const weekday = parseISODate(b.dateISO).getDay() as keyof WeeklyAvailability
      const day = draft[weekday]
      if (!day.enabled) return true
      return b.time < day.start || b.time >= day.end
    })
  }, [professional, draft, bookings])

  async function guardar() {
    if (!professional || !draft) return

    setGuardando(true)
    setError(null)
    try {
      const guardado = await guardarDisponibilidad(profesionalRepository, professional.id, draft)
      // Se adopta lo que devolvio la base, no el borrador: si algo se
      // normalizo al guardarse, lo que queda en pantalla es lo que de verdad
      // hay en la tabla.
      mia.aplicarHorario(guardado)
      toast({
        title: 'Horario guardado',
        description: 'Tus clientas ya solo podrán reservar dentro de estos tramos.',
        tone: 'success',
      })
    } catch (e: unknown) {
      const motivo = e instanceof Error ? e.message : 'No pudimos guardar tu horario.'
      // El aviso queda ademas fijo en la pantalla: un toast se va solo, y este
      // mensaje suele explicar algo que hay que resolver antes de reintentar.
      setError(motivo)
      toast({ title: 'No se guardó el horario', description: motivo, tone: 'error' })
    } finally {
      setGuardando(false)
    }
  }

  // La ficha esta resuelta pero su agenda todavia viaja. Sin este caso se
  // pintaria el editor con la semana cerrada que devuelve el horario vacio, y
  // pareceria que la profesional no trabaja ningun dia.
  if (professional && mia.cargandoAgenda) {
    return <EsqueletoHorario />
  }

  if (!professional || !draft) {
    return (
      <SelectorDeFicha
        equipo={mia.equipo}
        cargando={mia.cargando}
        error={mia.error}
        onElegir={mia.elegir}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      {!mia.vinculoDeclarado && mia.profesional && (
        <FichaActiva nombre={mia.profesional.nombre} onCambiar={() => mia.elegir(null)} />
      )}

      <h1 className="font-serif-display text-4xl text-ink">Mi disponibilidad</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Define tus días laborales y tramos de atención. Los clientes solo podrán reservar dentro de
        estos bloques.
      </p>

      {conflicts.length > 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#f0d9a6] bg-[#fbf1de] px-5 py-4 text-sm text-[#8a6a2a]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Tienes {conflicts.length}{' '}
            {conflicts.length === 1 ? 'reserva confirmada' : 'reservas confirmadas'} fuera de este
            horario. Si guardas los cambios deberás reprogramar
            {conflicts.length === 1 ? 'la' : 'las'}.
          </span>
        </div>
      )}

      <div className="mt-6">
        <AvailabilityEditor
          value={draft}
          onChange={(next) => {
            setDraft(next)
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-[#e8c4c4] bg-[#fbeeee] px-4 py-3 text-sm text-[#8a3a3a]"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar horario'}
        </Button>
        <Button
          variant="outline"
          disabled={guardando}
          onClick={() => {
            setDraft(professional.availability)
            setError(null)
          }}
        >
          Descartar cambios
        </Button>
      </div>
    </div>
  )
}

/**
 * Hueco con la forma del editor mientras llega el horario.
 *
 * Imita las siete filas del editor en vez de mostrar un texto centrado, para
 * que la pagina no salte de altura cuando el contenido real ocupa su sitio.
 */
function EsqueletoHorario() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10" aria-busy="true">
      <div className="h-10 w-72 animate-pulse rounded-lg bg-line-soft" />
      <div className="mt-4 h-4 w-full max-w-xl animate-pulse rounded bg-line-soft" />

      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3, 4, 5, 6].map((fila) => (
          <div
            key={fila}
            className="flex flex-wrap items-center gap-4 rounded-2xl border border-line-soft bg-paper px-5 py-4"
          >
            <div className="h-5 w-10 shrink-0 animate-pulse rounded-full bg-line-soft" />
            <div className="h-4 w-24 animate-pulse rounded bg-line-soft" />
            <div className="ml-auto flex gap-3">
              <div className="h-9 w-24 animate-pulse rounded-lg bg-line-soft" />
              <div className="h-9 w-24 animate-pulse rounded-lg bg-line-soft" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted">Cargando tu horario…</p>
    </div>
  )
}
