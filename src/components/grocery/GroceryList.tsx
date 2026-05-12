import { useState } from 'react'
import type { FormEvent } from 'react'
import { GroceryItemRow } from './GroceryItemRow'
import type { GroceryItem } from '../../types/grocery'

interface Props {
  uncheckedItems: GroceryItem[]
  checkedItems: GroceryItem[]
  onAdd: (name: string) => Promise<void>
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
  onCheckIn: () => void
}

export function GroceryList({ uncheckedItems, checkedItems, onAdd, onToggle, onDelete, onCheckIn }: Props) {
  const [newItem, setNewItem] = useState('')

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    await onAdd(newItem.trim())
    setNewItem('')
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Add to shopping list..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
        />
        <button type="submit" disabled={!newItem.trim()} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
          Add
        </button>
      </form>

      {uncheckedItems.length === 0 && checkedItems.length === 0 && (
        <p className="text-gray-400 text-center py-8">Your shopping list is empty</p>
      )}

      {uncheckedItems.map((item) => (
        <GroceryItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />
      ))}

      {checkedItems.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-gray-500">{checkedItems.length} checked</p>
            <button onClick={onCheckIn} className="text-sm font-semibold text-green-600">
              Check in groceries →
            </button>
          </div>
          {checkedItems.map((item) => (
            <GroceryItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </>
      )}
    </div>
  )
}
