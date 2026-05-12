import { GroceryItem } from '../../types/grocery'

interface Props {
  item: GroceryItem
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
}

export function GroceryItemRow({ item, onToggle, onDelete }: Props) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50">
      <button
        onClick={() => onToggle(item.id, !item.is_checked)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          item.is_checked ? 'bg-green-600 border-green-600' : 'border-gray-300'
        }`}
      >
        {item.is_checked && <span className="text-white text-xs">✓</span>}
      </button>
      <div className={`flex-1 ${item.is_checked ? 'line-through text-gray-400' : ''}`}>
        <span>{item.name}</span>
        {item.quantity > 1 && (
          <span className="text-gray-400 text-sm ml-1">× {item.quantity}</span>
        )}
      </div>
      <button onClick={() => onDelete(item.id)} className="text-gray-300 text-sm">✕</button>
    </div>
  )
}
