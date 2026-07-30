import type { InventoryItem } from '../../types/inventory'
import { useToday } from '../../hooks/useToday'
import { daysUntilExpiry } from '../../lib/expiry'

interface Props {
  item: InventoryItem
  onMarkConsumed: (id: string) => void
  onMarkWasted: (id: string) => void
}

function expiryColor(days: number | null): string {
  if (days === null) return 'bg-gray-100 text-gray-600'
  if (days <= 1) return 'bg-red-100 text-red-700'
  if (days <= 3) return 'bg-yellow-100 text-yellow-700'
  return 'bg-green-100 text-green-700'
}

function expiryLabel(days: number | null): string {
  if (days === null) return 'No date'
  if (days <= 0) return 'Expired'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function InventoryCard({ item, onMarkConsumed, onMarkWasted }: Props) {
  const today = useToday()
  const days = daysUntilExpiry(item.expiry_date, today)

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
      <div className="flex-1">
        <p className="font-semibold text-gray-900">{item.name}</p>
        <p className="text-sm text-gray-500">
          {item.quantity} {item.unit} · {item.location}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${expiryColor(days)}`}>
          {expiryLabel(days)}
        </span>
        <button onClick={() => onMarkConsumed(item.id)} className="text-green-600 text-sm font-medium" title="Mark consumed">✓</button>
        <button onClick={() => onMarkWasted(item.id)} className="text-red-400 text-sm" title="Mark wasted">✕</button>
      </div>
    </div>
  )
}
