import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Category, Location, Unit } from '../../types/inventory'

interface AddItemInput {
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
  expiry_date?: string
  cost?: number
}

interface Props {
  onAdd: (item: AddItemInput) => Promise<unknown>
  onDone: () => void
  defaultName?: string
  defaultCategory?: Category
}

export function AddItemForm({ onAdd, onDone, defaultName, defaultCategory }: Props) {
  const [name, setName] = useState(defaultName || '')
  const [category, setCategory] = useState<Category>(defaultCategory || 'other')
  const [location, setLocation] = useState<Location>('fridge')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState<Unit>('count')
  const [expiryDate, setExpiryDate] = useState('')
  const [cost, setCost] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onAdd({
      name: name.trim(),
      category,
      location,
      quantity,
      unit,
      expiry_date: expiryDate || undefined,
      cost: cost ? parseFloat(cost) : undefined,
    })
    setName('')
    setExpiryDate('')
    setCost('')
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="text" placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="produce">Produce</option>
            <option value="protein">Protein</option>
            <option value="dairy">Dairy</option>
            <option value="grain">Grain</option>
            <option value="condiment">Condiment</option>
            <option value="beverage">Beverage</option>
            <option value="snack">Snack</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Location</label>
          <select value={location} onChange={(e) => setLocation(e.target.value as Location)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="fridge">Fridge</option>
            <option value="freezer">Freezer</option>
            <option value="pantry">Pantry</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Quantity</label>
          <input type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(parseFloat(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="count">count</option>
            <option value="oz">oz</option>
            <option value="lb">lb</option>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="ml">ml</option>
            <option value="l">l</option>
            <option value="cup">cup</option>
            <option value="tbsp">tbsp</option>
            <option value="tsp">tsp</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Expiry (optional)</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Cost $ (optional)</label>
          <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving || !name.trim()} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50">
          {saving ? 'Adding...' : 'Add Item'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg">Done</button>
      </div>
    </form>
  )
}
