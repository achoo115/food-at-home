import { useState } from 'react'
import type { InventoryItem, Category, Location } from '../../types/inventory'
import { InventoryCard } from './InventoryCard'

interface Props {
  items: InventoryItem[]
  onMarkConsumed: (id: string) => void
  onMarkWasted: (id: string) => void
}

type SortBy = 'expiry_date' | 'added_at' | 'category'

export function InventoryList({ items, onMarkConsumed, onMarkWasted }: Props) {
  const [filterLocation, setFilterLocation] = useState<Location | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortBy>('expiry_date')

  const filtered = items
    .filter((item) => filterLocation === 'all' || item.location === filterLocation)
    .filter((item) => filterCategory === 'all' || item.category === filterCategory)
    .sort((a, b) => {
      if (sortBy === 'expiry_date') return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
      if (sortBy === 'added_at') return new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
      return a.category.localeCompare(b.category)
    })

  const locations: (Location | 'all')[] = ['all', 'fridge', 'freezer', 'pantry']

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {locations.map((loc) => (
          <button
            key={loc}
            onClick={() => setFilterLocation(loc)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              filterLocation === loc ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {loc === 'all' ? 'All' : loc.charAt(0).toUpperCase() + loc.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="text-sm border border-gray-200 rounded-lg px-2 py-1">
          <option value="expiry_date">Expiring soon</option>
          <option value="added_at">Recently added</option>
          <option value="category">Category</option>
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as Category | 'all')} className="text-sm border border-gray-200 rounded-lg px-2 py-1">
          <option value="all">All categories</option>
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

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No items yet. Add some groceries!</p>
      ) : (
        filtered.map((item) => (
          <InventoryCard key={item.id} item={item} onMarkConsumed={onMarkConsumed} onMarkWasted={onMarkWasted} />
        ))
      )}
    </div>
  )
}
