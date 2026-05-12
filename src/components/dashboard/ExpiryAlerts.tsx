import type { InventoryItem } from '../../types/inventory'

interface Props {
  items: InventoryItem[]
}

function daysUntil(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function ExpiryAlerts({ items }: Props) {
  const urgent = items
    .filter((i) => i.status === 'active')
    .map((i) => ({ ...i, daysLeft: daysUntil(i.expiry_date) }))
    .filter((i) => i.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  if (urgent.length === 0) {
    return (
      <div className="bg-green-50 rounded-xl p-4">
        <p className="text-green-700 font-medium">All good! Nothing expiring soon.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-gray-900">Expiring Soon</h2>
      {urgent.map((item) => {
        const color = item.daysLeft <= 1 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
        const textColor = item.daysLeft <= 1 ? 'text-red-700' : 'text-yellow-700'
        return (
          <div key={item.id} className={`${color} border rounded-lg p-3 flex items-center justify-between`}>
            <div>
              <p className="font-medium text-gray-900">{item.name}</p>
              <p className="text-xs text-gray-500">{item.quantity} {item.unit} · {item.location}</p>
            </div>
            <span className={`text-sm font-semibold ${textColor}`}>
              {item.daysLeft <= 0 ? 'Expired!' : item.daysLeft === 1 ? 'Tomorrow' : `${item.daysLeft} days`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
