import type { ConsolidatedItem } from '../../lib/groceryConsolidation'

interface Props {
  toBuy: ConsolidatedItem[]
  onHand: { name: string }[]
  onAdd: () => void
  onCancel: () => void
  adding: boolean
}

function label(item: ConsolidatedItem): string {
  return [item.quantity > 1 ? item.quantity : '', item.unit, item.name].filter(Boolean).join(' ')
}

export function PlanShoppingPreview({ toBuy, onHand, onAdd, onCancel, adding }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Shopping list — {toBuy.length} to buy</h3>
        <button onClick={onCancel} className="text-gray-300 text-sm">✕</button>
      </div>

      {toBuy.length === 0 ? (
        <p className="text-sm text-gray-500">Everything for this week is already in your kitchen 🎉</p>
      ) : (
        <ul className="space-y-1">
          {toBuy.map((item) => (
            <li key={`${item.name}-${item.unit}`} className="flex items-start justify-between text-sm">
              <span className="text-gray-700 capitalize">{label(item)}</span>
              <span className="text-xs text-gray-400 ml-2 text-right">{item.fromRecipes.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}

      {onHand.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Already have</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {onHand.map((i) => (
              <li key={i.name} className="text-sm text-gray-400 line-through capitalize">{i.name}</li>
            ))}
          </ul>
        </div>
      )}

      {toBuy.length > 0 && (
        <button onClick={onAdd} disabled={adding} className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50">
          {adding ? 'Adding…' : `Add ${toBuy.length} item${toBuy.length > 1 ? 's' : ''} to shopping list`}
        </button>
      )}
    </div>
  )
}
