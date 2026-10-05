import { useState } from 'react'
import { useAppState } from '@/shared/state/AppState'
import { useToast } from '@/shared/state/Toast'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { Button, Card, Kicker } from '@/shared/ui/ui'
import { contenedorPanel } from '@/shared/ui/nv-estilos'

export default function AdminSettings() {
  const [name, setName] = useState('Estudio Nura')
  const [address, setAddress] = useState('Av. Libertad 1250, Viña del Mar')
  const [phone, setPhone] = useState('+56 9 1234 5678')
  const [hours, setHours] = useState('Mar a Sáb · 10:00-19:00')
  const [resetting, setResetting] = useState(false)
  const { resetDemoData } = useAppState()
  const { toast } = useToast()

  return (
    <div className={contenedorPanel}>
      <h1 className="font-serif-display text-4xl text-ink">Configuración</h1>
      <p className="mt-2 text-sm text-muted">Datos generales del negocio.</p>

      <form
        className="mt-8 max-w-2xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          toast({ title: 'Configuración guardada' })
        }}
      >
        <Field label="Nombre del negocio" value={name} onChange={setName} />
        <Field label="Dirección" value={address} onChange={setAddress} />
        <Field label="Teléfono" value={phone} onChange={setPhone} />
        <Field label="Horario de atención" value={hours} onChange={setHours} />
        <div className="flex items-center gap-4">
          <Button type="submit">Guardar cambios</Button>
        </div>
      </form>

      <Card className="mt-10 p-6">
        <Kicker>Datos del prototipo</Kicker>
        <p className="mt-2 text-sm text-muted">
          Los servicios, profesionales, reservas e imágenes se guardan en este navegador. Puedes
          volver al contenido de ejemplo original en cualquier momento.
        </p>
        <Button variant="danger-outline" className="mt-4" onClick={() => setResetting(true)}>
          Restablecer datos de demostración
        </Button>
      </Card>

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={() => {
          resetDemoData()
          toast({ title: 'Datos restablecidos', tone: 'info' })
        }}
        title="Restablecer datos"
        confirmLabel="Restablecer"
        description="Se perderán los servicios, profesionales, reservas e imágenes que hayas cargado, y volverá el contenido de ejemplo."
      />
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-ink"
      />
    </div>
  )
}
