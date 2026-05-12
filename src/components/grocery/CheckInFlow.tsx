import { useState } from 'react'
import { Modal } from '../ui/Modal'
import type { GroceryItem } from '../../types/grocery'
import type { Category, Location, Unit } from '../../types/inventory'

interface AddItemInput {
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
}

interface Props {
  open: boolean
  onClose: () => void
  items: GroceryItem[]
  onCheckIn: (items: AddItemInput[]) => Promise<void>
  onClearChecked: () => Promise<void>
}

export function CheckInFlow({ open, onClose, items, onCheckIn, onClearChecked }: Props) {
  const [locations, setLocations] = useState<Record<string, Location>>(
    Object.fromEntries(items.map((i) => [i.id, 'fridge']))
  )
  const [saving, setSaving] = useState(false)

  async function handleCheckIn() {
    setSaving(true)
    const toAdd: AddItemInput[] = items.map((item) => ({
      name: item.name,
      category: (item.category as Category) || 'other',
      location: locations[item.id] || 'fridge',
      quantity: item.quantity,
      unit: (item.unit as Unit) || 'count',
    }))
    await onCheckIn(toAdd)
    await onClearChecked()
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Check In Groceries">
      <p className="text-sm text-gray-500 mb-4">Assign a location for each item:</p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <span className="font-medium">{item.name}</span>
            <select
              value={locations[item.id] || 'fridge'}
              onChange={(e) => setLocations((prev) => ({ ...prev, [item.id]: e.target.value as Location }))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1"
            >
              <option value="fridge">Fridge</option>
              <option value="freezer">Freezer</option>
              <option value="pantry">Pantry</option>
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={handleCheckIn}
        disabled={saving}
        className="w-full mt-4 py-3 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50"
      >
        {saving ? 'Adding...' : `Add ${items.length} items to inventory`}
      </button>
    </Modal>
  )
}
