import type { InventoryItem } from '../../types/inventory'

interface Props {
  item: InventoryItem
  onMarkConsumed: (id: string) => void
  onMarkWasted: (id: string) => void
}

function daysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function expiryColor(days: number): string {
  if (days <= 1) return 'bg-red-100 text-red-700'
  if (days <= 3) return 'bg-yellow-100 text-yellow-700'
  return 'bg-green-100 text-green-700'
}

export function InventoryCard({ item, onMarkConsumed, onMarkWasted }: Props) {
  const days = daysUntilExpiry(item.expiry_date)

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
          {days <= 0 ? 'Expired' : days === 1 ? '1 day' : `${days} days`}
        </span>
        <button onClick={() => onMarkConsumed(item.id)} className="text-green-600 text-sm font-medium" title="Mark consumed">✓</button>
        <button onClick={() => onMarkWasted(item.id)} className="text-red-400 text-sm" title="Mark wasted">✕</button>
      </div>
    </div>
  )
}
