import { InventoryItem } from '../../types/inventory'

interface Props {
  expiringItems: InventoryItem[]
  onViewRecipes: () => void
}

export function RecipeSuggestion({ expiringItems, onViewRecipes }: Props) {
  if (expiringItems.length === 0) return null

  const names = expiringItems.slice(0, 3).map((i) => i.name)

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
      <p className="font-medium text-gray-900">Tonight's challenge</p>
      <p className="text-sm text-gray-600 mt-1">
        Use up your {names.join(', ')} before {expiringItems.length === 1 ? 'it expires' : 'they expire'}!
      </p>
      <button onClick={onViewRecipes} className="mt-2 text-sm font-semibold text-orange-700">
        Find recipes →
      </button>
    </div>
  )
}
