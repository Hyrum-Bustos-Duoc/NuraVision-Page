import { useState } from 'react'
import { useAppState } from '@/shared/state/AppState'
import { useToast } from '@/shared/state/Toast'
import { AppImage, Button } from '@/shared/ui/ui'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { FichaActiva, SelectorDeFicha } from '@/modules/profesionales/ui/SelectorDeFicha'

export default function ProProfile() {
  const { updateProfessional } = useAppState()
  const { toast } = useToast()
  // La ficha sale de la base: antes se buscaba en los datos de ejemplo con el
  // `professionalId` del usuario de demostracion y, con el modo "solo
  // Supabase" activo, no habia nada que encontrar.
  const mia = useMiFichaProfesional()
  const professional = mia.ficha

  const [bio, setBio] = useState(professional?.bio ?? '')
  // La tabla `profesionales` no guarda telefono, asi que el campo arranca
  // vacio en vez de con el del usuario de demostracion, que no es de esta
  // persona.
  const [phone, setPhone] = useState('')

  if (!professional) {
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
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      {!mia.vinculoDeclarado && mia.profesional && (
        <FichaActiva nombre={mia.profesional.nombre} onCambiar={() => mia.elegir(null)} />
      )}

      <h1 className="font-serif-display text-4xl text-ink">Mi perfil</h1>

      <div className="mt-6 flex items-center gap-4">
        {professional.imageUrl ? (
          <AppImage src={professional.imageUrl} alt={professional.name} className="h-14 w-14 rounded-full" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-sm text-white">
            {professional.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium text-ink">{professional.name}</p>
          <p className="text-sm text-muted">
            {professional.role} · {professional.experienceYears} años de experiencia
          </p>
        </div>
      </div>

      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          updateProfessional(professional.id, { bio })
          toast({ title: 'Perfil actualizado' })
        }}
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Teléfono
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Biografía visible para clientes
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div className="flex items-center gap-4">
          <Button type="submit">Guardar cambios</Button>
        </div>
      </form>
    </div>
  )
}
