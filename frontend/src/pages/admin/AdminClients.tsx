import { useMemo } from 'react'
import { useAppState } from '@/shared/state/AppState'
import { formatPrice } from '@/shared/lib/format'
import { contenedorPanel } from '@/shared/ui/nv-estilos'

export default function AdminClients() {
  const { bookings } = useAppState()

  const clients = useMemo(() => {
    const map = new Map<string, { name: string; visits: number; total: number; lastVisit: string }>()
    for (const b of bookings) {
      const existing = map.get(b.clientName)
      if (existing) {
        existing.visits += 1
        existing.total += b.status === 'cancelada' ? 0 : b.price
        if (b.dateISO > existing.lastVisit) existing.lastVisit = b.dateISO
      } else {
        map.set(b.clientName, {
          name: b.clientName,
          visits: 1,
          total: b.status === 'cancelada' ? 0 : b.price,
          lastVisit: b.dateISO,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.lastVisit < b.lastVisit ? 1 : -1))
  }, [bookings])

  return (
    <div className={contenedorPanel}>
      <h1 className="font-serif-display text-4xl text-ink">Clientes</h1>
      <p className="mt-2 text-sm text-muted">{clients.length} clientes con reservas registradas.</p>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-line-soft bg-paper">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-line-soft bg-ivory/60 text-xs uppercase tracking-wide text-muted">
              <th className="px-6 py-4 font-medium">Cliente</th>
              <th className="px-6 py-4 font-medium">Reservas</th>
              <th className="px-6 py-4 font-medium">Última visita</th>
              <th className="px-6 py-4 font-medium">Total facturado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {clients.map((c) => (
              <tr key={c.name}>
                <td className="px-6 py-4 font-medium text-ink">{c.name}</td>
                <td className="px-6 py-4 text-ink">{c.visits}</td>
                <td className="px-6 py-4 text-ink">{c.lastVisit}</td>
                <td className="px-6 py-4 text-ink">{formatPrice(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
